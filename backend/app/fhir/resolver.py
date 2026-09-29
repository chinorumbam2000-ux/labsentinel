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

# Development sources: an Observation whose meta.source starts with one of
# these prefixes, and that names no resolvable performer, is attributed to
# the given *development* facility — a fictional stand-in, never one of the
# participating facilities. It takes effect only once that facility exists
# (python -m app.seed.smart_sandbox); until then the Observation is rejected.
DEVELOPMENT_SOURCE_FACILITIES: tuple[tuple[str, str], ...] = (
    ("https://launch.smarthealthit.org/", "SMART-SANDBOX"),
)

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


# How a facility was resolved, as shown to people (e.g. the ingestion demo).
BY_ORGANIZATION_IDENTIFIER = f"Organization.identifier ({FACILITY_IDENTIFIER_SYSTEM})"
BY_DEVELOPMENT_ORGANIZATION_ID = "Configured development Organization id"
BY_LOGICAL_IDENTIFIER = f"Performer logical identifier ({FACILITY_IDENTIFIER_SYSTEM})"
VIA_REPORT = " via DiagnosticReport.performer"
BY_DEVELOPMENT_SOURCE = "Configured development source (Observation.meta.source)"


@dataclass(frozen=True)
class ResolvedFacility:
    facility: Facility
    #: Which configured rule matched, e.g. BY_ORGANIZATION_IDENTIFIER.
    method: str


def _code_from_organization(org: FHIRAbstractModel) -> tuple[str, str] | None:
    for identifier in getattr(org, "identifier", None) or []:
        if identifier.system == FACILITY_IDENTIFIER_SYSTEM and identifier.value:
            return identifier.value, BY_ORGANIZATION_IDENTIFIER
    code = DEVELOPMENT_ORGANIZATION_IDS.get(org.id or "")
    return (code, BY_DEVELOPMENT_ORGANIZATION_ID) if code else None


def _code_from_reference(
    reference, submission: Submission, context: FHIRAbstractModel
) -> tuple[str, str] | None:
    target = resolve_reference(reference.reference, submission, context)
    if target is not None:
        if target.get_resource_type() != "Organization":
            return None
        return _code_from_organization(target)
    if reference.reference:
        parts = reference.reference.rstrip("/").split("/")
        if len(parts) >= 2 and parts[-2] == "Organization":
            code = DEVELOPMENT_ORGANIZATION_IDS.get(parts[-1])
            if code:
                return code, BY_DEVELOPMENT_ORGANIZATION_ID
    identifier = reference.identifier
    if identifier is not None and identifier.system == FACILITY_IDENTIFIER_SYSTEM and identifier.value:
        return identifier.value, BY_LOGICAL_IDENTIFIER
    return None


def _codes_from_performers(
    performers, submission: Submission, context: FHIRAbstractModel
) -> dict[str, str]:
    """Facility code → the rule that produced it, for every resolvable performer."""
    codes: dict[str, str] = {}
    for performer in performers or []:
        match = _code_from_reference(performer, submission, context)
        if match:
            codes.setdefault(match[0], match[1])
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
) -> ResolvedFacility:
    codes = _codes_from_performers(obs.performer, submission, obs)
    if not codes and report is not None:
        codes = {
            code: method + VIA_REPORT
            for code, method in _codes_from_performers(
                report.report.performer, submission, report.report
            ).items()
        }
    if not codes:
        source = obs.meta.source if obs.meta is not None else None
        for prefix, code in DEVELOPMENT_SOURCE_FACILITIES:
            if source and source.startswith(prefix):
                codes = {code: BY_DEVELOPMENT_SOURCE}
                break
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
    code, method = next(iter(codes.items()))
    facility = facilities.get(code)
    if facility is None and method == BY_DEVELOPMENT_SOURCE:
        raise IngestionError(
            IssueCode.UNRESOLVED_FACILITY,
            "The source is a known development source, but no LabSentinel facility mapping is "
            f"configured for it (development facility {code} does not exist).",
            label,
        )
    if facility is None:
        raise IngestionError(
            IssueCode.UNRESOLVED_FACILITY,
            f"'{code}' is not an active LabSentinel facility.",
            label,
        )
    # A development facility is reachable only through its configured source
    # mapping — a submitter cannot simply claim it by identifier.
    if facility.participation == "development" and method != BY_DEVELOPMENT_SOURCE:
        raise IngestionError(
            IssueCode.UNRESOLVED_FACILITY,
            f"'{code}' is a development source and cannot be named as a performer.",
            label,
        )
    return ResolvedFacility(facility, method)


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
        match = _code_from_reference(location.managingOrganization, submission, location)
        facility = facilities_by_code.get(match[0]) if match else None
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
