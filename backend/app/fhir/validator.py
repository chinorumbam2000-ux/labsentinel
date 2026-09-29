"""
LabSentinel's rules for accepting a FHIR Observation as a laboratory result.

The FHIR model library checks structure and datatypes. It does not enforce
every required element or code binding (it accepts an explicit null `code`
or an unknown `status`), so the rules LabSentinel relies on are enforced here.

Status: only final, amended and corrected Observations carry a result fit
for surveillance. registered and preliminary have no final result; cancelled,
entered-in-error and unknown must not be counted. They are rejected.

Laboratory detection:
- category present: it must include observation-category 'laboratory'
  (http://terminology.hl7.org/CodeSystem/observation-category). Any other
  category — vital-signs, activity, imaging... — is not a laboratory result.
- category absent: accepted only when the code carries a LOINC code that is a
  mapped LabSentinel laboratory test. An unrecognized code without a
  laboratory category is not assumed to be laboratory.

Effective time: effectiveDateTime, effectiveInstant or effectivePeriod.start,
as a full date-time with a timezone offset. A date-only or partial value is
rejected rather than guessed at (FHIR itself requires an offset whenever a
time is given), as is a time in the future.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from fhir.resources.R4B.observation import Observation

from app.fhir import terminology
from app.fhir.exceptions import IngestionError, IssueCode

FHIR_OBSERVATION_STATUSES = frozenset(
    {"registered", "preliminary", "final", "amended", "corrected", "cancelled", "entered-in-error", "unknown"}
)
INGESTIBLE_STATUSES = frozenset({"final", "amended", "corrected"})

# Tolerated clock skew between a source system and LabSentinel.
FUTURE_TOLERANCE = timedelta(minutes=5)


@dataclass(frozen=True)
class LoincCoding:
    code: str
    display: str | None
    mapping: terminology.LabTestMapping | None


def check_status(obs: Observation, label: str) -> None:
    if obs.status not in FHIR_OBSERVATION_STATUSES:
        raise IngestionError(IssueCode.INVALID_FHIR, f"Unknown Observation.status '{obs.status}'.", label)
    if obs.status not in INGESTIBLE_STATUSES:
        raise IngestionError(
            IssueCode.NON_FINAL_STATUS,
            f"Status '{obs.status}' is not a finalized result; only final, amended and corrected are ingested.",
            label,
        )


def _loinc_codings(obs: Observation) -> list:
    return [c for c in (obs.code.coding or []) if c.system == terminology.LOINC_SYSTEM]


def check_laboratory(obs: Observation, label: str) -> None:
    categories = [
        coding
        for concept in obs.category or []
        for coding in concept.coding or []
    ]
    if categories:
        if any(
            c.system == terminology.OBSERVATION_CATEGORY_SYSTEM and c.code == terminology.LABORATORY_CATEGORY
            for c in categories
        ):
            return
        found = ", ".join(sorted({str(c.code) for c in categories}))
        raise IngestionError(
            IssueCode.NON_LAB_OBSERVATION,
            f"Observation category ({found}) is not 'laboratory'.",
            label,
        )
    # No category: only a recognized LabSentinel laboratory test is accepted.
    if any(
        c.code and terminology.is_valid_loinc(c.code) and terminology.lookup(c.code)
        for c in _loinc_codings(obs)
    ):
        return
    raise IngestionError(
        IssueCode.NON_LAB_OBSERVATION,
        "No 'laboratory' category, and the code is not a recognized LabSentinel laboratory test.",
        label,
    )


def check_loinc(obs: Observation, label: str) -> LoincCoding:
    if obs.code is None:
        raise IngestionError(IssueCode.INVALID_FHIR, "Observation.code is required.", label)
    codings = _loinc_codings(obs)
    codes = {c.code for c in codings}
    if not codings:
        raise IngestionError(
            IssueCode.INVALID_LOINC,
            f"Observation.code has no coding with system {terminology.LOINC_SYSTEM}.",
            label,
        )
    if len(codes) > 1:
        raise IngestionError(IssueCode.INVALID_LOINC, "Observation.code has conflicting LOINC codes.", label)
    coding = codings[0]
    if not coding.code or not terminology.is_valid_loinc(coding.code):
        raise IngestionError(
            IssueCode.INVALID_LOINC,
            f"'{coding.code}' is not a well-formed LOINC code (format or check digit).",
            label,
        )
    return LoincCoding(coding.code, coding.display, terminology.lookup(coding.code))


def effective_time(obs: Observation, label: str, now: datetime) -> datetime:
    if obs.effectiveDateTime is not None:
        value = obs.effectiveDateTime
    elif obs.effectiveInstant is not None:
        value = obs.effectiveInstant
    elif obs.effectivePeriod is not None and obs.effectivePeriod.start is not None:
        value = obs.effectivePeriod.start
    elif obs.effectiveTiming is not None:
        raise IngestionError(
            IssueCode.INVALID_EFFECTIVE_TIME, "effectiveTiming is not supported; send effectiveDateTime.", label
        )
    else:
        raise IngestionError(IssueCode.MISSING_EFFECTIVE_TIME, "The Observation has no effective time.", label)

    if not isinstance(value, datetime) or value.tzinfo is None:
        kind = "a date only" if isinstance(value, date) else "a partial date"
        raise IngestionError(
            IssueCode.INVALID_EFFECTIVE_TIME,
            f"Effective time is {kind}; a full date-time with a timezone offset is required.",
            label,
        )
    if value > now + FUTURE_TOLERANCE:
        raise IngestionError(IssueCode.INVALID_EFFECTIVE_TIME, "Effective time is in the future.", label)
    return value
