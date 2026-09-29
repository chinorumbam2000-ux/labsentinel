"""
FHIR ingestion: run each Observation through the pipeline and persist it.

Transaction behaviour — BEST EFFORT, per Observation. Each Observation is
validated, normalized and inserted inside its own SAVEPOINT. A valid one is
kept even when others in the same Bundle are rejected; a rejected one leaves
nothing behind. The caller commits once at the end.

Idempotency — the existing unique key (source_system, source_observation_id).
A resubmitted Observation is reported as a duplicate and nothing is written.
If its content differs from what was stored, that is said, but the stored row
is not changed: amendments are not applied in this phase.

Demonstration safety — effective times inside the frozen Day 1-Day 5
demonstration period (Nov 3-7, 2025, America/New_York) are rejected, so
ingested data can never alter the five-day demonstration's figures.

Logging records resource type, source id, facility and outcome only. Payloads
and patient data are never logged.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Literal

from fhir.resources.R4B.observation import Observation
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.simulation import demo_period_utc
from app.fhir import normalizer, resolver, validator
from app.fhir.exceptions import IngestionError, IngestionIssue, IssueCode
from app.fhir.normalizer import NormalizedObservation
from app.fhir.parser import ParsedResource, Submission, parse_submission
from app.models import Facility, LabObservation

logger = logging.getLogger("app.fhir.ingestion")

Outcome = Literal["created", "duplicate", "rejected"]


@dataclass
class ObservationOutcome:
    resource: str
    outcome: Outcome
    observation_id: int | None = None
    source_system: str | None = None
    source_observation_id: str | None = None
    message: str | None = None
    #: The rejecting issue's code, for a rejected Observation.
    issue_code: str | None = None
    facility_code: str | None = None
    #: Which configured rule resolved the facility (see app.fhir.resolver).
    facility_resolution: str | None = None
    #: Warning codes raised for this Observation (UNMAPPED_LOINC, DUPLICATE...).
    warnings: list[str] = field(default_factory=list)


@dataclass
class IngestionReport:
    resources_received: int = 0
    observations_received: int = 0
    observations_validated: int = 0
    observations_created: int = 0
    duplicates: int = 0
    rejected: int = 0
    errors: list[IngestionIssue] = field(default_factory=list)
    warnings: list[IngestionIssue] = field(default_factory=list)
    results: list[ObservationOutcome] = field(default_factory=list)

    def add_issue(self, issue: IngestionIssue) -> None:
        (self.warnings if issue.severity == "warning" else self.errors).append(issue)


def _normalize(
    parsed: ParsedResource,
    submission: Submission,
    reports: dict[int, resolver.ReportContext],
    facilities: dict[str, Facility],
    received_at: datetime,
    salt: str,
    warnings: list[IngestionIssue],
) -> tuple[NormalizedObservation, resolver.ResolvedFacility]:
    """
    The pipeline, in the order the ingestion demo shows it:
    validation → facility resolution → terminology/result normalization →
    source identity (the key persistence uses).
    """
    obs: Observation = parsed.model  # type: ignore[assignment]
    label = parsed.label

    # 1. Validation.
    validator.check_status(obs, label)
    if obs.code is None:
        raise IngestionError(IssueCode.INVALID_FHIR, "Observation.code is required.", label)
    validator.check_laboratory(obs, label)
    loinc = validator.check_loinc(obs, label)
    effective = normalizer.to_utc(validator.effective_time(obs, label, received_at))
    start, end = demo_period_utc()
    if start <= effective < end:
        raise IngestionError(
            IssueCode.DEMO_PERIOD_RESERVED,
            "Effective time falls inside the frozen Day 1-Day 5 demonstration period "
            "(Nov 3-7, 2025); ingested data may not alter it.",
            label,
        )

    # 2. Facility resolution.
    report = reports.get(id(obs))
    resolved = resolver.resolve_facility(obs, label, submission, report, facilities)
    facility = resolved.facility

    # 3. Terminology and result normalization.
    local_warnings: list[IngestionIssue] = []
    syndrome, test_name, status, display = normalizer.terminology_fields(obs, loinc, label, local_warnings)
    result = normalizer.normalize_result(obs, loinc, label)
    specimen = resolver.specimen_type(obs, label, submission, report, local_warnings)
    warnings.extend(local_warnings)

    # 4. Source identity: the key persistence uses for duplicate detection.
    source_system, source_id = normalizer.source_identity(obs, facility.facility_code, label)

    return (
        NormalizedObservation(
            source_system=source_system,
            source_observation_id=source_id,
            facility_id=facility.id,
            patient_reference=normalizer.pseudonymize_subject(obs, source_system, salt),
            syndrome=syndrome,
            test_name=test_name,
            loinc_code=loinc.code,
            terminology_status=status,
            code_display=display,
            result=result,
            effective_datetime=effective,
            received_datetime=received_at,
            geographic_unit=facility.postal_code or "",
            status=obs.status,
            source_report_id=report.source_id if report else None,
            specimen_type=specimen,
        ),
        resolved,
    )


def _differs(row: LabObservation, values: dict[str, Any]) -> bool:
    def same(stored: Any, wanted: Any) -> bool:
        if isinstance(stored, datetime) and stored.tzinfo is None:
            stored = stored.replace(tzinfo=UTC)
        if isinstance(stored, Decimal) and isinstance(wanted, Decimal):
            return stored.compare(wanted) == 0
        return stored == wanted

    return any(
        not same(getattr(row, key), value)
        for key, value in values.items()
        if key not in {"received_datetime", "source_system", "source_observation_id"}
    )


def ingest_document(
    session: Session,
    document: dict[str, Any],
    *,
    salt: str,
    received_at: datetime | None = None,
) -> IngestionReport:
    """Ingest a parsed JSON document. The caller commits the session."""
    received_at = received_at or datetime.now(UTC)
    submission = parse_submission(document)
    # Every entry counts as received, including ones that failed validation.
    is_bundle = document.get("resourceType") == "Bundle"
    report = IngestionReport(resources_received=len(document.get("entry") or []) if is_bundle else 1)
    for issue in submission.issues:
        report.add_issue(issue)

    facilities = {
        f.facility_code: f for f in session.scalars(select(Facility).where(Facility.active.is_(True)))
    }
    context_warnings: list[IngestionIssue] = []
    reports = resolver.report_index(submission, context_warnings)
    resolver.check_locations(submission, facilities, context_warnings)
    for issue in context_warnings:
        report.add_issue(issue)

    for parsed in submission.of_type("Observation"):
        report.observations_received += 1
        if parsed.model is None:
            # Structural validation already failed and was reported.
            report.rejected += 1
            report.results.append(
                ObservationOutcome(
                    parsed.label,
                    "rejected",
                    message="Not valid FHIR.",
                    issue_code=IssueCode.INVALID_FHIR.value,
                )
            )
            logger.info("FHIR ingest: %s rejected (INVALID_FHIR)", parsed.label)
            continue

        warnings: list[IngestionIssue] = []
        try:
            normalized, resolved = _normalize(
                parsed, submission, reports, facilities, received_at, salt, warnings
            )
        except IngestionError as error:
            report.rejected += 1
            report.add_issue(error.issue)
            report.results.append(
                ObservationOutcome(
                    parsed.label,
                    "rejected",
                    message=error.issue.message,
                    issue_code=error.issue.code.value,
                    warnings=[w.code.value for w in warnings],
                )
            )
            logger.info("FHIR ingest: %s rejected (%s)", parsed.label, error.issue.code.value)
            continue

        for warning in warnings:
            report.add_issue(warning)
        facility = resolved.facility
        context = {
            "facility_code": facility.facility_code,
            "facility_resolution": resolved.method,
            "warnings": [w.code.value for w in warnings],
        }
        report.observations_validated += 1
        values = normalized.column_values()
        key = (normalized.source_system, normalized.source_observation_id)

        existing = session.scalar(
            select(LabObservation).where(
                LabObservation.source_system == key[0],
                LabObservation.source_observation_id == key[1],
            )
        )
        if existing is None:
            try:
                with session.begin_nested():
                    row = LabObservation(**values)
                    session.add(row)
                    session.flush()
            except IntegrityError:
                # Lost a race with a concurrent submission of the same result.
                existing = session.scalar(
                    select(LabObservation).where(
                        LabObservation.source_system == key[0],
                        LabObservation.source_observation_id == key[1],
                    )
                )
                if existing is None:
                    raise
            else:
                report.observations_created += 1
                report.results.append(
                    ObservationOutcome(parsed.label, "created", row.id, key[0], key[1], **context)
                )
                logger.info(
                    "FHIR ingest: %s created as observation %s (facility %s, %s)",
                    parsed.label, row.id, facility.facility_code, normalized.terminology_status,
                )
                continue

        report.duplicates += 1
        differs = _differs(existing, values)
        message = (
            "Already ingested; the resubmitted content differs, and amendments are not applied in this phase."
            if differs
            else "Already ingested; nothing written."
        )
        report.add_issue(IngestionIssue(IssueCode.DUPLICATE, message, parsed.label, "warning"))
        context["warnings"].append(IssueCode.DUPLICATE.value)
        report.results.append(
            ObservationOutcome(parsed.label, "duplicate", existing.id, key[0], key[1], message, **context)
        )
        logger.info("FHIR ingest: %s duplicate of observation %s", parsed.label, existing.id)

    return report
