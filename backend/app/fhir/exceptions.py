"""
Structured FHIR ingestion issues.

Every problem the ingester reports is an IngestionIssue with a stable code, a
human message and a *safe* resource label ("Observation/abc", "entry[3]") —
never a patient identifier, never a payload excerpt, never a stack trace.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal


class IssueCode(StrEnum):
    # The body or a resource is not valid FHIR R4 JSON.
    INVALID_FHIR = "INVALID_FHIR"
    # A resource type LabSentinel does not ingest.
    UNSUPPORTED_RESOURCE = "UNSUPPORTED_RESOURCE"
    # An Observation that is not a laboratory result (vital signs, device...).
    NON_LAB_OBSERVATION = "NON_LAB_OBSERVATION"
    # Status is not a finalized, result-bearing status.
    NON_FINAL_STATUS = "NON_FINAL_STATUS"
    # No LOINC coding, several conflicting ones, or a malformed LOINC code.
    INVALID_LOINC = "INVALID_LOINC"
    # A valid LOINC code with no LabSentinel mapping (stored, flagged unmapped).
    UNMAPPED_LOINC = "UNMAPPED_LOINC"
    # The performing facility could not be resolved to a LabSentinel facility.
    UNRESOLVED_FACILITY = "UNRESOLVED_FACILITY"
    # The result value is missing, unsupported or not interpretable.
    INVALID_RESULT = "INVALID_RESULT"
    MISSING_EFFECTIVE_TIME = "MISSING_EFFECTIVE_TIME"
    # Effective time present but not a full date-time with offset, or in the future.
    INVALID_EFFECTIVE_TIME = "INVALID_EFFECTIVE_TIME"
    # Falls inside the frozen Day 1-Day 5 demonstration period.
    DEMO_PERIOD_RESERVED = "DEMO_PERIOD_RESERVED"
    # Neither an identifier nor a resource id: cannot be made idempotent.
    MISSING_IDENTIFIER = "MISSING_IDENTIFIER"
    # A reference that points at nothing in the submission.
    UNRESOLVED_REFERENCE = "UNRESOLVED_REFERENCE"
    # A Location's postal code disagrees with its facility's surveillance area.
    GEOGRAPHY_MISMATCH = "GEOGRAPHY_MISMATCH"
    # Already ingested (same source system and source observation id).
    DUPLICATE = "DUPLICATE"


Severity = Literal["error", "warning"]


@dataclass(frozen=True)
class IngestionIssue:
    code: IssueCode
    message: str
    resource: str | None = None
    severity: Severity = "error"


class IngestionError(Exception):
    """Raised inside the pipeline to reject one resource with one issue."""

    def __init__(self, code: IssueCode, message: str, resource: str | None = None) -> None:
        super().__init__(message)
        self.issue = IngestionIssue(code=code, message=message, resource=resource)


class RequestRejected(Exception):
    """The request as a whole cannot be processed (not JSON, not FHIR, ...)."""

    def __init__(self, issue: IngestionIssue, status_code: int = 400) -> None:
        super().__init__(issue.message)
        self.issue = issue
        self.status_code = status_code
