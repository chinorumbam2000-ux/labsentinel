"""
Component scores, the Composite Outbreak Signal Score and Data Confidence.

A Python port of the prototype's own models (src/lib/signalScore.ts and
src/lib/dataConfidence.ts): the same weights, the same normalization, the
same severity and confidence bands, and the same half-up rounding as
JavaScript's Math.round. Only the inputs differ: the frozen demonstration
passes fixed denominators (3 facilities, 3 areas) and a fixed baseline
(100 tests, 8 %), the dynamic engine passes what it measured.

Everything here is pure: numbers in, numbers out.
"""

import statistics
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# The existing LabSentinel weights. Not configurable: changing them would make
# dynamic and demonstration scores incomparable.
SCORE_WEIGHTS = {
    "volume": 0.25,
    "positivity": 0.30,
    "facilities": 0.20,
    "geography": 0.15,
    "persistence": 0.10,
}
COMPONENT_LABELS = {
    "volume": "Test Volume",
    "positivity": "Positivity",
    "facilities": "Affected Facilities",
    "geography": "Geographic Spread",
    "persistence": "Persistence",
}
#: A positivity rise of this many percentage points scores 100.
POSITIVITY_RANGE_POINTS = 15.0
#: This many consecutive abnormal days scores 100.
MAX_PERSISTENCE_DAYS = 4

CONFIDENCE_WEIGHTS = {
    "freshness": 0.30,
    "completeness": 0.25,
    "terminology": 0.20,
    "participation": 0.15,
    "integrity": 0.10,
}
CONFIDENCE_LABELS = {
    "freshness": "Feed Freshness",
    "completeness": "Data Completeness",
    "terminology": "Terminology Mapping Quality",
    "participation": "Facility Participation",
    "integrity": "Data Integrity",
}
FRESHNESS_FLOOR_MINUTES = 5.0
FRESHNESS_CEILING_MINUTES = 120.0
INTEGRITY_PENALTY_PER_PERCENT = 4.0


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return min(max(value, low), high)


def round_half_up(value: float, places: int = 0) -> float:
    """
    Math.round semantics (halves round up), not Python's round-half-even.
    Float noise is removed first, so 12.4999999999 from a sum of weights is
    treated as the 12.5 it represents.
    """
    exponent = Decimal(1).scaleb(-places)
    return float(Decimal(repr(round(value, 9))).quantize(exponent, rounding=ROUND_HALF_UP))


def severity_for(score: float) -> str:
    if score < 20:
        return "Low"
    if score < 40:
        return "Watch"
    if score < 65:
        return "Moderate"
    if score < 85:
        return "High"
    return "Critical"


def confidence_level_for(score: float) -> str:
    if score >= 90:
        return "Very High"
    if score >= 75:
        return "High"
    if score >= 50:
        return "Moderate"
    return "Low"


# ---------------------------------------------------------------------------
# Components
# ---------------------------------------------------------------------------


def volume_change_percent(current_tests: int, baseline_mean: float) -> float:
    return (current_tests - baseline_mean) / baseline_mean * 100


def volume_score(change_percent: float) -> float:
    """A 1 % rise in tests is 1 point, up to 100. Falls score 0."""
    return clamp(change_percent)


def positivity_score(change_points: float) -> float:
    """A rise of 15 percentage points scores 100."""
    return clamp(change_points / POSITIVITY_RANGE_POINTS * 100)


def share_score(affected: int, participating: int) -> float:
    """Affected share of the participating facilities (or areas)."""
    return 0.0 if participating == 0 else clamp(affected / participating * 100)


def persistence_score(days: int) -> float:
    return clamp(days / MAX_PERSISTENCE_DAYS * 100)


@dataclass(frozen=True)
class Component:
    key: str
    normalized: float  # 0-100, before weighting

    @property
    def weight(self) -> float:
        return SCORE_WEIGHTS[self.key]

    @property
    def weighted(self) -> float:
        return self.normalized * self.weight

    @property
    def max_points(self) -> int:
        return int(round_half_up(self.weight * 100))

    @property
    def points(self) -> int:
        """Rounded for display, as the prototype shows it; the composite uses the unrounded sum."""
        return int(round_half_up(self.weighted))


@dataclass(frozen=True)
class Composite:
    components: tuple[Component, ...]
    unrounded: float
    score: int
    severity: str


def composite(normalized: dict[str, float]) -> Composite:
    """The weighted sum of the five normalized components, rounded half up."""
    if set(normalized) != set(SCORE_WEIGHTS):
        raise ValueError(f"Expected components {sorted(SCORE_WEIGHTS)}.")
    components = tuple(Component(key, normalized[key]) for key in SCORE_WEIGHTS)
    unrounded = sum(component.weighted for component in components)
    score = int(round_half_up(unrounded))
    return Composite(components, unrounded, score, severity_for(score))


# ---------------------------------------------------------------------------
# Data Confidence
# ---------------------------------------------------------------------------


def freshness_for(minutes: float) -> float:
    """100 at or under 5 minutes, falling linearly to 0 at 120 minutes."""
    if minutes <= FRESHNESS_FLOOR_MINUTES:
        return 100.0
    if minutes >= FRESHNESS_CEILING_MINUTES:
        return 0.0
    span = FRESHNESS_CEILING_MINUTES - FRESHNESS_FLOOR_MINUTES
    return clamp(100 - (minutes - FRESHNESS_FLOOR_MINUTES) / span * 100)


@dataclass(frozen=True)
class FacilityQuality:
    """One reporting facility's inputs to Data Confidence."""

    facility_code: str
    reporting_delays: tuple[float, ...]
    eligible_observations: int
    fields_populated: int
    fields_required: int
    lab_observations: int
    mapped_observations: int
    integrity_issues: int

    @property
    def median_delay(self) -> float | None:
        return statistics.median(self.reporting_delays) if self.reporting_delays else None


@dataclass(frozen=True)
class ConfidenceComponent:
    key: str
    score: float
    evidence: str

    @property
    def weight(self) -> float:
        return CONFIDENCE_WEIGHTS[self.key]

    @property
    def points(self) -> int:
        return int(round_half_up(self.score * self.weight))


@dataclass(frozen=True)
class DataConfidence:
    score: int
    level: str
    components: tuple[ConfidenceComponent, ...]
    facilities_reporting: int
    facilities_total: int
    explanation: str


def data_confidence(reporting: list[FacilityQuality], facilities_total: int) -> DataConfidence:
    """
    The prototype's Data Confidence framework, fed from stored observations:

    - Feed Freshness: each reporting facility's median reporting delay
      (received - effective time) through the prototype's freshness curve,
      averaged across facilities. A facility with no received times scores 0:
      unknown timeliness is not assumed to be good.
    - Data Completeness: required fields populated (specimen type, received
      time), pooled across eligible observations.
    - Terminology Mapping Quality: laboratory observations whose LOINC code
      maps to a LabSentinel test, pooled.
    - Facility Participation: reporting / participating facilities.
    - Data Integrity: 4 points lost per 1 % of eligible observations failing
      a consistency check.
    """
    count = len(reporting)
    freshness = (
        0.0
        if count == 0
        else sum(freshness_for(f.median_delay) if f.median_delay is not None else 0.0 for f in reporting) / count
    )
    delays = [f.median_delay for f in reporting if f.median_delay is not None]

    populated = sum(f.fields_populated for f in reporting)
    required = sum(f.fields_required for f in reporting)
    completeness = 0.0 if required == 0 else clamp(populated / required * 100)

    lab = sum(f.lab_observations for f in reporting)
    mapped = sum(f.mapped_observations for f in reporting)
    terminology = 0.0 if lab == 0 else clamp(mapped / lab * 100)

    participation = 0.0 if facilities_total == 0 else clamp(count / facilities_total * 100)

    events = sum(f.eligible_observations for f in reporting)
    issues = sum(f.integrity_issues for f in reporting)
    issue_rate = 100.0 if events == 0 else issues / events * 100
    integrity = clamp(100 - issue_rate * INTEGRITY_PENALTY_PER_PERCENT)

    components = (
        ConfidenceComponent(
            "freshness",
            freshness,
            "No facility reported" if not reporting
            else f"Median reporting delay {min(delays):.0f}-{max(delays):.0f} minutes across reporting facilities"
            if delays else "No received times recorded",
        ),
        ConfidenceComponent("completeness", completeness, f"{completeness:.1f}% of required fields populated"),
        ConfidenceComponent("terminology", terminology, f"{terminology:.1f}% of laboratory results mapped to a LabSentinel test"),
        ConfidenceComponent("participation", participation, f"{count} of {facilities_total} facilities reporting"),
        ConfidenceComponent(
            "integrity",
            integrity,
            "No consistency issues" if issues == 0 else f"{issues} of {events} results failed a consistency check",
        ),
    )
    score = int(round_half_up(sum(c.score * c.weight for c in components)))
    level = confidence_level_for(score)

    if count == 0:
        explanation = (
            "No facility reported eligible results, so there is no data to assess. "
            "Absence of data is not evidence that activity is normal."
        )
    elif count < facilities_total:
        silent = facilities_total - count
        explanation = (
            f"Confidence is reduced because {silent} of {facilities_total} participating "
            f"{'facility' if silent == 1 else 'facilities'} reported nothing. Activity there is unknown, not normal."
        )
    else:
        weakest = min(components, key=lambda c: c.score)
        if score >= 90:
            explanation = f"All {count} facilities reported, promptly and with high mapping quality."
        elif score >= 75:
            explanation = (
                f"All facilities reported; {CONFIDENCE_LABELS[weakest.key].lower()} is the weakest "
                f"contributor ({weakest.score:.0f}/100)."
            )
        else:
            explanation = (
                f"Data quality is reduced: {CONFIDENCE_LABELS[weakest.key].lower()} scores "
                f"{weakest.score:.0f}/100. Interpret the signal with caution."
            )
    return DataConfidence(score, level, components, count, facilities_total, explanation)
