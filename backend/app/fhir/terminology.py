"""
Terminology normalization: the one place LabSentinel maps laboratory codes.

LOINC → normalized test name → surveillance syndrome. The entries match the
React prototype's test catalogue (src/data/tests.ts); a test pins that.

Rules:
- Only codings with system == http://loinc.org are LOINC.
- A LOINC code must be well formed: digits, a hyphen, and the correct
  mod-10 check digit. A malformed code is rejected (INVALID_LOINC).
- A well-formed code with no entry here is *preserved* and flagged
  terminology_status = 'unmapped', with no syndrome. It is never assigned a
  guessed syndrome.

Qualitative results (binary scale) normalize to 'Positive' / 'Negative' from
SNOMED CT codes, or from the exact words below when no code is sent.
"""

import re
from dataclasses import dataclass
from typing import Literal

LOINC_SYSTEM = "http://loinc.org"
SNOMED_SYSTEM = "http://snomed.info/sct"
UCUM_SYSTEM = "http://unitsofmeasure.org"
OBSERVATION_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/observation-category"
LABORATORY_CATEGORY = "laboratory"

RESPIRATORY_VIRAL_SYNDROME = "Respiratory Viral Syndrome"

ResultScale = Literal["binary", "any"]


@dataclass(frozen=True)
class LabTestMapping:
    loinc_code: str
    test_name: str
    syndrome: str
    # binary: the result must normalize to Positive / Negative.
    result_scale: ResultScale


LAB_TEST_MAPPINGS: dict[str, LabTestMapping] = {
    mapping.loinc_code: mapping
    for mapping in (
        LabTestMapping("92142-9", "Influenza A RNA", RESPIRATORY_VIRAL_SYNDROME, "binary"),
        LabTestMapping("94500-6", "SARS-CoV-2 RNA", RESPIRATORY_VIRAL_SYNDROME, "binary"),
        LabTestMapping("85479-4", "RSV RNA", RESPIRATORY_VIRAL_SYNDROME, "binary"),
    )
}

POSITIVE, NEGATIVE = "Positive", "Negative"

# SNOMED CT qualifier values for qualitative laboratory results.
SNOMED_RESULTS: dict[str, str] = {
    "10828004": POSITIVE,  # Positive
    "260373001": POSITIVE,  # Detected
    "260385009": NEGATIVE,  # Negative
    "260415000": NEGATIVE,  # Not detected
}

# Accepted only when no recognized code is present, matched case-insensitively.
RESULT_WORDS: dict[str, str] = {
    "positive": POSITIVE,
    "detected": POSITIVE,
    "negative": NEGATIVE,
    "not detected": NEGATIVE,
}

_LOINC_PATTERN = re.compile(r"^(\d{1,7})-(\d)$")


def loinc_check_digit(base: str) -> int:
    """LOINC's mod-10 check digit for the digits before the hyphen."""
    total = 0
    for position, char in enumerate(reversed(base)):
        digit = int(char)
        if position % 2 == 0:  # odd positions counting from the right: doubled
            digit *= 2
        total += digit // 10 + digit % 10
    return (10 - total % 10) % 10


def is_valid_loinc(code: str) -> bool:
    match = _LOINC_PATTERN.match(code)
    return bool(match) and loinc_check_digit(match.group(1)) == int(match.group(2))


def lookup(loinc_code: str) -> LabTestMapping | None:
    return LAB_TEST_MAPPINGS.get(loinc_code)


def normalize_result_word(text: str | None) -> str | None:
    if not text:
        return None
    return RESULT_WORDS.get(" ".join(text.split()).lower())
