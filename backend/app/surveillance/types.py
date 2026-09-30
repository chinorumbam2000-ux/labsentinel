"""
Shared types and configuration of the dynamic surveillance engine.

The Dynamic Surveillance Engine is a capstone prototype model and is not
epidemiologically validated for production public-health decision-making.
"""

from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Literal

#: The syndrome the capstone surveils today. The engine takes the syndrome as
#: a parameter throughout, so another syndrome needs only mapped tests.
DEFAULT_SYNDROME = "Respiratory Viral Syndrome"

#: Bumped whenever a calculation rule changes, and stored with every signal.
ENGINE_VERSION = "1"

#: FHIR Observation.status values whose results count (as FHIR ingestion
#: stores only these, this is a guard rather than a filter in practice).
COUNTED_STATUSES = ("final", "amended", "corrected")

#: The normalized qualitative results that count towards positivity.
POSITIVE, NEGATIVE = "Positive", "Negative"

CalculationStatus = Literal["CALCULATED", "INSUFFICIENT_BASELINE", "NO_DATA"]
FacilityStatus = Literal["ABNORMAL", "NORMAL", "BELOW_MINIMUM", "INSUFFICIENT_BASELINE", "NOT_REPORTING"]


@dataclass(frozen=True)
class EngineConfig:
    """
    Development defaults. Every value is stored in each signal's metadata, so
    a signal can always be explained by the configuration that produced it.
    """

    #: Days before the surveillance date that form the rolling baseline.
    baseline_window_days: int = 7
    #: A baseline needs at least this many of those days to have data.
    min_baseline_days: int = 5
    #: A facility is assessed only when it reported at least this many tests.
    facility_min_tests: int = 10
    #: Abnormal when volume rises at least this much over the baseline mean...
    abnormal_volume_increase_percent: float = 25.0
    #: ...or positivity rises at least this many percentage points.
    abnormal_positivity_increase_points: float = 5.0
    #: Surveillance days are calendar days in this zone (the synthetic
    #: facilities are in Worcester County, Massachusetts).
    timezone: str = "America/New_York"

    def __post_init__(self) -> None:
        if not 1 <= self.min_baseline_days <= self.baseline_window_days:
            raise ValueError("min_baseline_days must be between 1 and baseline_window_days.")
        if self.facility_min_tests < 1:
            raise ValueError("facility_min_tests must be at least 1.")

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class Counts:
    """Eligible results for one syndrome, for one facility (or the region), on one day."""

    tests: int = 0
    positive: int = 0
    negative: int = 0

    @property
    def determinate(self) -> int:
        """Results that count towards positivity (Positive or Negative)."""
        return self.positive + self.negative

    @property
    def indeterminate(self) -> int:
        return self.tests - self.determinate

    def positivity(self) -> float | None:
        """Percent, or None when no result is Positive or Negative."""
        return None if self.determinate == 0 else self.positive / self.determinate * 100

    def add(self, other: "Counts") -> None:
        self.tests += other.tests
        self.positive += other.positive
        self.negative += other.negative


@dataclass
class QualityInputs:
    """What Data Confidence is calculated from, for one facility on one day."""

    #: Minutes from effective to received time, one per eligible observation
    #: that has a received time.
    reporting_delays: list[float] = field(default_factory=list)
    #: Required surveillance fields (specimen type, received time) populated,
    #: out of the number required, across eligible observations.
    fields_populated: int = 0
    fields_required: int = 0
    #: Laboratory observations from the facility that day: all of them, and
    #: those whose LOINC code maps to a LabSentinel test.
    lab_observations: int = 0
    mapped_observations: int = 0
    #: Eligible observations failing a consistency check: an indeterminate
    #: result, or a received time before the effective time.
    integrity_issues: int = 0

    def add(self, other: "QualityInputs") -> None:
        self.reporting_delays.extend(other.reporting_delays)
        self.fields_populated += other.fields_populated
        self.fields_required += other.fields_required
        self.lab_observations += other.lab_observations
        self.mapped_observations += other.mapped_observations
        self.integrity_issues += other.integrity_issues


@dataclass(frozen=True)
class FacilityInfo:
    facility_code: str
    name: str
    vendor: str
    postal_code: str | None
    subregion: str | None
    region: str
    country_code: str


@dataclass
class Baseline:
    """A rolling historical baseline. No value is produced from insufficient history."""

    window_start: date
    window_end: date
    window_days: int
    observed_days: int
    min_days: int
    #: Mean eligible tests per observed day.
    mean_tests: float | None
    #: Pooled positivity over the observed days, percent.
    positivity: float | None

    @property
    def sufficient(self) -> bool:
        return self.mean_tests is not None and self.positivity is not None

    def as_dict(self) -> dict:
        return {
            "window_start": self.window_start.isoformat(),
            "window_end": self.window_end.isoformat(),
            "window_days": self.window_days,
            "observed_days": self.observed_days,
            "min_days": self.min_days,
            "mean_tests": _round(self.mean_tests),
            "positivity_rate": _round(self.positivity),
            "status": "SUFFICIENT" if self.sufficient else "INSUFFICIENT_BASELINE",
        }


def _round(value: float | None, places: int = 4) -> float | None:
    return None if value is None else round(value, places)
