"""
Parsing a submission into validated FHIR resources.

Accepts a single Observation or a Bundle (collection, transaction or batch).
Each resource is validated on its own with the FHIR model library, so one bad
entry is reported without discarding the rest of the Bundle.

Validation error text from the library can echo input values, which may be
personal data. It is never passed on: only the element path and the error
type are reported.
"""

import json
from dataclasses import dataclass, field
from typing import Any

import pydantic
from fhir.resources.R4B import get_fhir_model_class
from fhir.resources.R4B.bundle import Bundle
from fhir_core.fhirabstractmodel import FHIRAbstractModel

from app.fhir.exceptions import IngestionIssue, IssueCode, RequestRejected

# Resources LabSentinel reads. Everything else in a Bundle is reported as
# unsupported and ignored.
SUPPORTED_RESOURCES = frozenset(
    {"Observation", "DiagnosticReport", "Organization", "Location", "Specimen"}
)
# Accepted in a Bundle for reference context only, and never read further:
# a Patient's name, address, birth date or identifiers are never looked at.
CONTEXT_ONLY_RESOURCES = frozenset({"Patient", "ServiceRequest"})
BUNDLE_TYPES = frozenset({"collection", "transaction", "batch"})


@dataclass
class ParsedResource:
    resource_type: str
    #: Safe label for messages: "Observation/abc" or "entry[2] Patient".
    label: str
    model: FHIRAbstractModel | None
    full_url: str | None = None


@dataclass
class Submission:
    resources: list[ParsedResource] = field(default_factory=list)
    issues: list[IngestionIssue] = field(default_factory=list)
    #: fullUrl and "Type/id" → model, for reference resolution.
    index: dict[str, FHIRAbstractModel] = field(default_factory=dict)

    def of_type(self, resource_type: str) -> list[ParsedResource]:
        return [r for r in self.resources if r.resource_type == resource_type]


def safe_errors(error: pydantic.ValidationError, limit: int = 5) -> str:
    """Element paths and error types only — never the offending values."""
    parts = []
    for item in error.errors()[:limit]:
        path = ".".join(str(part) for part in item["loc"]) or "(resource)"
        parts.append(f"{path}: {item['type']}")
    more = len(error.errors()) - limit
    return "; ".join(parts) + (f"; and {more} more" if more > 0 else "")


def parse_json(body: bytes) -> dict[str, Any]:
    try:
        document = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RequestRejected(
            IngestionIssue(IssueCode.INVALID_FHIR, "The request body is not valid JSON.")
        ) from None
    if not isinstance(document, dict):
        raise RequestRejected(
            IngestionIssue(IssueCode.INVALID_FHIR, "A FHIR resource must be a JSON object.")
        )
    return document


def _label(resource_type: str, resource_id: Any, position: str | None) -> str:
    # A Patient's id can be a record number; it is never echoed.
    if resource_type == "Patient" or not isinstance(resource_id, str) or not resource_id:
        return f"{position} {resource_type}" if position else resource_type
    return f"{resource_type}/{resource_id}"


def _validate(raw: Any, position: str | None, submission: Submission) -> ParsedResource | None:
    if not isinstance(raw, dict) or not isinstance(raw.get("resourceType"), str):
        submission.issues.append(
            IngestionIssue(IssueCode.INVALID_FHIR, "Entry has no resource with a resourceType.", position)
        )
        return None
    resource_type = raw["resourceType"]
    label = _label(resource_type, raw.get("id"), position)
    if resource_type not in SUPPORTED_RESOURCES | CONTEXT_ONLY_RESOURCES:
        submission.issues.append(
            IngestionIssue(
                IssueCode.UNSUPPORTED_RESOURCE,
                f"{resource_type} is not ingested by LabSentinel; ignored.",
                label,
                "warning",
            )
        )
        return None
    try:
        model = get_fhir_model_class(resource_type).model_validate(raw)
    except pydantic.ValidationError as error:
        submission.issues.append(
            IngestionIssue(IssueCode.INVALID_FHIR, f"Invalid {resource_type}: {safe_errors(error)}", label)
        )
        return ParsedResource(resource_type, label, None)
    return ParsedResource(resource_type, label, model)


def _index(parsed: ParsedResource, submission: Submission) -> None:
    if parsed.model is None:
        return
    if parsed.full_url:
        submission.index[parsed.full_url] = parsed.model
    if parsed.model.id:
        submission.index[f"{parsed.resource_type}/{parsed.model.id}"] = parsed.model


def parse_submission(document: dict[str, Any]) -> Submission:
    """Validate a single Observation or a Bundle's entries, one by one."""
    submission = Submission()
    resource_type = document.get("resourceType")

    if resource_type == "Observation":
        parsed = _validate(document, None, submission)
        if parsed is not None:
            submission.resources.append(parsed)
            _index(parsed, submission)
        return submission

    if resource_type != "Bundle":
        raise RequestRejected(
            IngestionIssue(
                IssueCode.UNSUPPORTED_RESOURCE,
                f"Submit an Observation or a Bundle, not {resource_type or 'an unknown resource'}.",
            )
        )

    entries = document.get("entry")
    if entries is not None and not isinstance(entries, list):
        raise RequestRejected(IngestionIssue(IssueCode.INVALID_FHIR, "Bundle.entry must be an array."))
    # The envelope is validated without its resources, which are validated
    # individually below so one bad entry does not reject the whole Bundle.
    envelope = {
        **document,
        "entry": [
            {k: v for k, v in entry.items() if k != "resource"} if isinstance(entry, dict) else entry
            for entry in entries or []
        ]
        or None,
    }
    if envelope["entry"] is None:
        envelope.pop("entry")
    try:
        bundle = Bundle.model_validate(envelope)
    except pydantic.ValidationError as error:
        raise RequestRejected(
            IngestionIssue(IssueCode.INVALID_FHIR, f"Invalid Bundle: {safe_errors(error)}")
        ) from None
    if bundle.type not in BUNDLE_TYPES:
        raise RequestRejected(
            IngestionIssue(
                IssueCode.UNSUPPORTED_RESOURCE,
                f"Bundle type '{bundle.type}' is not accepted; use collection, transaction or batch.",
            )
        )

    for position, entry in enumerate(entries or []):
        where = f"entry[{position}]"
        parsed = _validate(entry.get("resource"), where, submission)
        if parsed is None:
            continue
        parsed.full_url = entry.get("fullUrl")
        submission.resources.append(parsed)
        _index(parsed, submission)
    return submission


def resolve_reference(
    reference: str | None,
    submission: Submission,
    context: FHIRAbstractModel | None = None,
) -> FHIRAbstractModel | None:
    """
    Resolve a literal reference within the submission: "#id" against the
    context resource's contained resources, otherwise by fullUrl or
    "Type/id" (including the tail of an absolute URL).
    """
    if not reference:
        return None
    if reference.startswith("#"):
        for contained in getattr(context, "contained", None) or []:
            if contained.id == reference[1:]:
                return contained
        return None
    if reference in submission.index:
        return submission.index[reference]
    parts = reference.rstrip("/").split("/")
    if len(parts) >= 2:
        return submission.index.get(f"{parts[-2]}/{parts[-1]}")
    return None
