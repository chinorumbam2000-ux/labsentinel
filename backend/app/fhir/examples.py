"""
Catalogue of the synthetic FHIR fixtures in backend/examples/fhir, for the
development ingestion demonstration.

The fixture files are the single source of their content; this module only
describes them. Clients see an id and a description, never a filesystem path.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

EXAMPLES_DIR = Path(__file__).resolve().parents[2] / "examples" / "fhir"

ExampleKind = Literal["valid", "bundle", "invalid"]


@dataclass(frozen=True)
class FhirExample:
    id: str
    title: str
    description: str
    kind: ExampleKind
    #: What the demonstration should show when it is ingested (first time).
    expected: str
    filename: str

    def content(self) -> str:
        return (EXAMPLES_DIR / self.filename).read_text(encoding="utf-8")


EXAMPLES: tuple[FhirExample, ...] = (
    FhirExample(
        "influenza-a-positive", "Influenza A positive Observation",
        "Influenza A RNA (LOINC 92142-9), SNOMED CT 'Detected'. Facility from a logical identifier; "
        "contained nasopharyngeal Specimen.",
        "valid", "Created — normalized to Positive at Worcester Central Medical Center.",
        "case-a-influenza-a-positive.json",
    ),
    FhirExample(
        "sars-cov-2-negative", "SARS-CoV-2 negative Observation",
        "SARS-CoV-2 RNA (LOINC 94500-6), SNOMED CT 'Negative'. Facility from a configured "
        "Organization id; effective time given in UTC.",
        "valid", "Created — normalized to Negative at Central Massachusetts Regional Hospital.",
        "case-b-sars-cov-2-negative.json",
    ),
    FhirExample(
        "rsv-positive", "RSV positive Observation (no category)",
        "RSV RNA (LOINC 85479-4), SNOMED CT 'Positive', with no category: accepted because the "
        "LOINC code is a mapped laboratory test.",
        "valid", "Created — normalized to Positive at Shrewsbury Community Medical Center.",
        "case-c-rsv-positive-no-category.json",
    ),
    FhirExample(
        "numeric-hemoglobin", "Numeric laboratory Observation",
        "Hemoglobin (LOINC 718-7), valueQuantity 13.2 g/dL (UCUM). Not a surveillance test.",
        "valid", "Created as unmapped: number and unit kept, no syndrome assigned.",
        "case-d-quantity-hemoglobin.json",
    ),
    FhirExample(
        "respiratory-panel-bundle", "Multi-resource Bundle",
        "Collection Bundle: Organization, Location, Patient, Specimen, DiagnosticReport and three "
        "Observations. The facility comes from the DiagnosticReport's performer.",
        "bundle", "Three Observations created with report and specimen context; Patient not read.",
        "case-e-bundle-respiratory-panel.json",
    ),
    FhirExample(
        "unmapped-loinc", "Unmapped LOINC Observation",
        "Hepatitis B surface antigen (LOINC 5195-3): a valid code with no LabSentinel mapping.",
        "valid", "Created as unmapped with an UNMAPPED_LOINC warning; no syndrome guessed.",
        "case-h-unmapped-loinc.json",
    ),
    FhirExample(
        "invalid-loinc", "Invalid LOINC coding",
        "LOINC 92142-8: the check digit is wrong.",
        "invalid", "Rejected — INVALID_LOINC.",
        "case-g-invalid-loinc.json",
    ),
    FhirExample(
        "unresolved-facility", "Unresolved facility",
        "Performer identifier HOSP-Z is not a LabSentinel facility.",
        "invalid", "Rejected — UNRESOLVED_FACILITY.",
        "case-i-unresolvable-facility.json",
    ),
    FhirExample(
        "vital-signs", "Non-laboratory Observation",
        "Heart rate (LOINC 8867-4) with category vital-signs.",
        "invalid", "Rejected — NON_LAB_OBSERVATION.",
        "case-j-vital-signs-not-laboratory.json",
    ),
    FhirExample(
        "malformed-json", "Malformed FHIR JSON",
        "Truncated JSON that cannot be parsed.",
        "invalid", "Request rejected — INVALID_FHIR (HTTP 400).",
        "case-k-malformed-json.txt",
    ),
)

EXAMPLES_BY_ID = {example.id: example for example in EXAMPLES}
