"""
Normalizing a validated FHIR Observation into LabSentinel's LabObservation
fields.

Results (Observation.value[x]):
- Mapped qualitative tests (binary scale) must normalize to Positive /
  Negative: from valueCodeableConcept (SNOMED CT Positive/Detected/Negative/
  Not detected, else its text or display if it is one of those words), or
  from valueString with one of those words. Anything else is INVALID_RESULT.
- Other tests (unmapped codes): valueQuantity keeps value, unit, system and
  code (UCUM where sent); valueCodeableConcept keeps the coding and its text;
  valueString and valueBoolean are kept as given. No unit conversion.
- Other value types (Range, Ratio, SampledData, ...) are not supported yet.

Source identity (idempotency key, unique in the database):
- Observation.identifier with system and value → source_system
  "fhir:<system>", source_observation_id "<value>".
- else Observation.id → source_system "fhir:resource-id:<facility>",
  source_observation_id "Observation/<id>" (a server id is only unique within
  its source, so it is scoped to the performing facility).
- else MISSING_IDENTIFIER: without a stable id a resubmission could not be
  recognized, so the Observation is not stored.

Privacy: the subject is reduced to a salted one-way pseudonym
("FHIR-PT-..."). The subject's reference or identifier is used only as hash
input; the display text (which can be a name) is never read.
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from fhir.resources.R4B.observation import Observation

from app.fhir import terminology
from app.fhir.exceptions import IngestionError, IngestionIssue, IssueCode
from app.fhir.validator import LoincCoding

MAX_SOURCE_SYSTEM = 100
MAX_SOURCE_ID = 128
NO_SUBJECT = "FHIR-NO-SUBJECT"


@dataclass(frozen=True)
class NormalizedResult:
    result_type: str
    result_value: str | None
    result_unit: str | None = None
    result_numeric: Decimal | None = None
    result_unit_system: str | None = None
    result_unit_code: str | None = None
    result_code_system: str | None = None
    result_code: str | None = None


def _first_text(concept) -> str | None:
    return concept.text or next((c.display for c in concept.coding or [] if c.display), None)


def normalize_result(obs: Observation, loinc: LoincCoding, label: str) -> NormalizedResult:
    binary = loinc.mapping is not None and loinc.mapping.result_scale == "binary"

    if obs.valueCodeableConcept is not None:
        concept = obs.valueCodeableConcept
        for coding in concept.coding or []:
            if coding.system == terminology.SNOMED_SYSTEM and coding.code in terminology.SNOMED_RESULTS:
                return NormalizedResult(
                    "coded", terminology.SNOMED_RESULTS[coding.code], result_code_system=coding.system,
                    result_code=coding.code,
                )
        text = _first_text(concept)
        word = terminology.normalize_result_word(text)
        first = (concept.coding or [None])[0]
        if word:
            return NormalizedResult(
                "coded", word,
                result_code_system=first.system if first else None, result_code=first.code if first else None,
            )
        if binary:
            raise IngestionError(
                IssueCode.INVALID_RESULT,
                f"{loinc.mapping.test_name} needs a Positive/Negative result (SNOMED CT or text).",
                label,
            )
        if not text and first is None:
            raise IngestionError(IssueCode.INVALID_RESULT, "valueCodeableConcept is empty.", label)
        return NormalizedResult(
            "coded", (text or first.code or "")[:255] or None,
            result_code_system=first.system if first else None, result_code=first.code if first else None,
        )

    if obs.valueString is not None:
        word = terminology.normalize_result_word(obs.valueString)
        if binary and not word:
            raise IngestionError(
                IssueCode.INVALID_RESULT,
                f"{loinc.mapping.test_name} needs a Positive/Negative result.",
                label,
            )
        value = word or obs.valueString.strip()
        if not value or len(value) > 255:
            raise IngestionError(IssueCode.INVALID_RESULT, "valueString is empty or too long.", label)
        return NormalizedResult("string", value)

    if obs.valueQuantity is not None:
        quantity = obs.valueQuantity
        if binary:
            raise IngestionError(
                IssueCode.INVALID_RESULT,
                f"{loinc.mapping.test_name} is qualitative; a Quantity result is not valid for it.",
                label,
            )
        if quantity.value is None:
            raise IngestionError(IssueCode.INVALID_RESULT, "valueQuantity has no value.", label)
        comparator = quantity.comparator or ""
        return NormalizedResult(
            "quantity",
            f"{comparator}{quantity.value}",
            result_unit=(quantity.unit or quantity.code),
            result_numeric=Decimal(str(quantity.value)),
            result_unit_system=quantity.system,
            result_unit_code=quantity.code,
        )

    if obs.valueBoolean is not None:
        if binary:
            raise IngestionError(IssueCode.INVALID_RESULT, "A boolean is not a laboratory result code.", label)
        return NormalizedResult("boolean", "true" if obs.valueBoolean else "false")

    other = next(
        (name for name in ("valueRange", "valueRatio", "valueSampledData", "valueTime", "valueDateTime",
                           "valuePeriod", "valueInteger") if getattr(obs, name, None) is not None),
        None,
    )
    if other:
        raise IngestionError(IssueCode.INVALID_RESULT, f"{other} results are not supported yet.", label)
    reason = " (dataAbsentReason given)" if obs.dataAbsentReason is not None else ""
    raise IngestionError(IssueCode.INVALID_RESULT, f"The Observation has no result value{reason}.", label)


def source_identity(obs: Observation, facility_code: str, label: str) -> tuple[str, str]:
    for identifier in obs.identifier or []:
        if identifier.system and identifier.value:
            system = f"fhir:{identifier.system}"
            if len(system) > MAX_SOURCE_SYSTEM:
                digest = hashlib.sha256(identifier.system.encode()).hexdigest()[:40]
                system = f"fhir:sha256:{digest}"
            if len(identifier.value) > MAX_SOURCE_ID:
                raise IngestionError(IssueCode.INVALID_FHIR, "Observation.identifier.value is too long.", label)
            return system, identifier.value
    if obs.id:
        return f"fhir:resource-id:{facility_code}", f"Observation/{obs.id}"
    raise IngestionError(
        IssueCode.MISSING_IDENTIFIER,
        "The Observation has neither an identifier (system and value) nor an id, so a resubmission "
        "could not be recognized.",
        label,
    )


def pseudonymize_subject(obs: Observation, source_system: str, salt: str) -> str:
    subject = obs.subject
    if subject is None:
        return NO_SUBJECT
    if subject.reference:
        key = subject.reference
    elif subject.identifier is not None and subject.identifier.value:
        key = f"{subject.identifier.system or ''}|{subject.identifier.value}"
    else:
        return NO_SUBJECT
    digest = hmac.new(salt.encode(), f"{source_system}|{key}".encode(), hashlib.sha256).hexdigest()
    return f"FHIR-PT-{digest[:24]}"


@dataclass(frozen=True)
class NormalizedObservation:
    source_system: str
    source_observation_id: str
    facility_id: int
    patient_reference: str
    syndrome: str | None
    test_name: str
    loinc_code: str
    terminology_status: str
    code_display: str | None
    result: NormalizedResult
    effective_datetime: datetime
    received_datetime: datetime
    geographic_unit: str
    status: str
    source_report_id: str | None
    specimen_type: str | None

    def column_values(self) -> dict:
        return {
            "source_system": self.source_system,
            "source_observation_id": self.source_observation_id,
            "facility_id": self.facility_id,
            "patient_reference": self.patient_reference,
            "syndrome": self.syndrome,
            "test_name": self.test_name,
            "loinc_code": self.loinc_code,
            "terminology_status": self.terminology_status,
            "code_display": self.code_display,
            "result_type": self.result.result_type,
            "result_value": self.result.result_value,
            "result_unit": self.result.result_unit,
            "result_numeric": self.result.result_numeric,
            "result_unit_system": self.result.result_unit_system,
            "result_unit_code": self.result.result_unit_code,
            "result_code_system": self.result.result_code_system,
            "result_code": self.result.result_code,
            "effective_datetime": self.effective_datetime,
            "received_datetime": self.received_datetime,
            "geographic_unit": self.geographic_unit,
            "status": self.status,
            "source_report_id": self.source_report_id,
            "specimen_type": self.specimen_type,
        }


def terminology_fields(obs: Observation, loinc: LoincCoding, label: str, issues: list[IngestionIssue]):
    """(syndrome, test name, terminology status, code display) for the LOINC code."""
    display = (loinc.display or None) and loinc.display[:255]
    if loinc.mapping is not None:
        return loinc.mapping.syndrome, loinc.mapping.test_name, "mapped", display
    issues.append(
        IngestionIssue(
            IssueCode.UNMAPPED_LOINC,
            f"LOINC {loinc.code} has no LabSentinel mapping; stored as 'unmapped' with no syndrome.",
            label,
            "warning",
        )
    )
    name = obs.code.text or loinc.display or f"LOINC {loinc.code}"
    return None, name[:200], "unmapped", display


def to_utc(value: datetime) -> datetime:
    return value.astimezone(UTC)
