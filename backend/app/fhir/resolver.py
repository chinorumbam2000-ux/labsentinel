"""
Resolving an Observation's context: facility, geography, specimen, report.

Facility resolution is deterministic and configured, never inferred from
free text. For each performer reference, in order:

1. The referenced Organization (in the Bundle, or contained): its identifier
   with system FACILITY_IDENTIFIER_SYSTEM, else its id in
   DEVELOPMENT_ORGANIZATION_IDS.
2. An unresolved "Organization/<id>" reference: DEVELOPMENT_ORGANIZATION_IDS.
3. A logical reference (Reference.identifier) with FACILITY_IDENTIFIER_SYSTEM.

If the Observation names no resolvable performer, the performer of the
DiagnosticReport that lists it is tried the same way. Non-Organization
performers (practitioners) are ignored. No match, conflicting matches, or a
code that is not an active LabSentinel facility → UNRESOLVED_FACILITY, and
nothing is stored.

Geography is the resolved facility's configured surveillance area
(postal_code). A Location in the Bundle is only cross-checked: its postal
code is compared with the facility's and a mismatch is reported. No street
address is ever read or stored.
"""

from dataclasses import dataclass

from fhir.resources.R4B.diagnosticreport import DiagnosticReport
from fhir.resources.R4B.observation import Observation
from fhir_core.fhirabstractmodel import FHIRAbstractModel

from app.fhir.exceptions import IngestionError, IngestionIssue, IssueCode
from app.fhir.parser import Submission, resolve_reference
from app.models import Facility

# Identifier system whose value is a LabSentinel facility code (e.g. HOSP-A).
FACILITY_IDENTIFIER_SYSTEM = "urn:labsentinel:facility-code"

# Development mapping of synthetic source Organization ids to facility codes.
DEVELOPMENT_ORGANIZATION_IDS: dict[str, str] = {
    "org-worcester-central": "HOSP-A",
    "org-central-mass-regional": "HOSP-B",
    "org-shrewsbury-community": "HOSP-C",
}


@dataclass(frozen=True)
class ReportContext:
    report: DiagnosticReport
    #: Stable id for the report: identifier value, else "DiagnosticReport/<id>".
    source_id: str | None


def _code_from_organization(org: FHIRAbstractModel) -> str | None:
    for identifier in getattr(org, "identifier", None) or []:
        if identifier.system == FACILITY_IDENTIFIER_SYSTEM and identifier.value:
            return identifier.value
    return DEVELOPMENT_ORGANIZATION_IDS.get(org.id or "")


def _code_from_reference(reference, submission: Submission, context: FHIRAbstractModel) -> str | None:
    target = resolve_reference(reference.reference, submission, context)
    if target is not None:
        if target.get_resource_type() != "Organization":
            return None
        return _code_from_organization(target)
    if reference.reference:
        parts = reference.reference.rstrip("/").split("/")
        if len(parts) >= 2 and parts[-2] == "Organization":
            return DEVELOPMENT_ORGANIZATION_IDS.get(parts[-1])
    identifier = reference.identifier
    if identifier is not None and identifier.system == FACILITY_IDENTIFIER_SYSTEM and identifier.value:
        return identifier.value
    return None


def _codes_from_performers(performers, submission: Submission, context: FHIRAbstractModel) -> set[str]:
    codes = set()
    for performer in performers or []:
        code = _code_from_reference(performer, submission, context)
        if code:
            codes.add(code)
    return codes


def report_index(submission: Submission, issues: list[IngestionIssue]) -> dict[int, ReportContext]:
    """Map each Observation (by object id) to the DiagnosticReport listing it."""
    index: dict[int, ReportContext] = {}
    for parsed in submission.of_type("DiagnosticReport"):
        report = parsed.model
        if report is None:
            continue
        identifier = next((i for i in report.identifier or [] if i.value), None)
        source_id = identifier.value if identifier else (f"DiagnosticReport/{report.id}" if report.id else None)
        for result in report.result or []:
            target = resolve_reference(result.reference, submission, report)
            if target is None or target.get_resource_type() != "Observation":
                issues.append(
                    IngestionIssue(
                        IssueCode.UNRESOLVED_REFERENCE,
                        "DiagnosticReport.result points at an Observation that is not in this submission.",
                        parsed.label,
                        "warning",
                    )
                )
                continue
            index[id(target)] = ReportContext(report, source_id)
    return index


def resolve_facility(
    obs: Observation,
    label: str,
    submission: Submission,
    report: ReportContext | None,
    facilities: dict[str, Facility],
) -> Facility:
    codes = _codes_from_performers(obs.performer, submission, obs)
    if not codes and report is not None:
        codes = _codes_from_performers(report.report.performer, submission, report.report)
    if not codes:
        raise IngestionError(
            IssueCode.UNRESOLVED_FACILITY,
            "No performer Organization could be resolved to a LabSentinel facility.",
            label,
        )
    if len(codes) > 1:
        raise IngestionError(
            IssueCode.UNRESOLVED_FACILITY,
            f"Performers resolve to different facilities ({', '.join(sorted(codes))}).",
            label,
        )
    code = codes.pop()
    facility = facilities.get(code)
    if facility is None:
        raise IngestionError(
            IssueCode.UNRESOLVED_FACILITY,
            f"'{code}' is not an active LabSentinel facility.",
            label,
        )
    return facility


def specimen_type(
    obs: Observation,
    label: str,
    submission: Submission,
    report: ReportContext | None,
    issues: list[IngestionIssue],
) -> str | None:
    """The specimen's type, if the Observation (or its report) references one."""
    reference, context = obs.specimen, obs
    if reference is None and report is not None and report.report.specimen:
        reference, context = report.report.specimen[0], report.report
    if reference is None:
        return None
    specimen = resolve_reference(reference.reference, submission, context)
    if specimen is None or specimen.get_resource_type() != "Specimen":
        issues.append(
            IngestionIssue(
                IssueCode.UNRESOLVED_REFERENCE,
                "The referenced Specimen is not in this submission; specimen type not recorded.",
                label,
                "warning",
            )
        )
        return None
    concept = specimen.type
    if concept is None:
        return None
    text = concept.text or next((c.display for c in concept.coding or [] if c.display), None)
    return text[:100] if text else None


def check_locations(
    submission: Submission,
    facilities_by_code: dict[str, Facility],
    issues: list[IngestionIssue],
) -> None:
    """Cross-check each Location's postal code against its organization's facility."""
    for parsed in submission.of_type("Location"):
        location = parsed.model
        if location is None or location.managingOrganization is None:
            continue
        code = _code_from_reference(location.managingOrganization, submission, location)
        facility = facilities_by_code.get(code or "")
        postal = location.address.postalCode if location.address else None
        if facility is not None and postal and postal != facility.postal_code:
            issues.append(
                IngestionIssue(
                    IssueCode.GEOGRAPHY_MISMATCH,
                    f"Location postal code does not match facility {facility.facility_code}'s "
                    "surveillance area; the facility's configured area is used.",
                    parsed.label,
                    "warning",
                )
            )
