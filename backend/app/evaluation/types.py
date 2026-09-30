"""
Types of the capstone evaluation framework.

These evaluations use synthetic scenarios and demonstrate technical behavior
only. They do not establish clinical or epidemiological validation.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Literal

DISCLAIMER = (
    "These evaluations use synthetic scenarios and demonstrate technical behavior only. "
    "They do not establish clinical or epidemiological validation."
)
LABEL = "Experimental capstone evaluation using synthetic scenarios."

Detector = Literal["composite", "ewma", "cusum"]
DETECTORS: tuple[Detector, ...] = ("composite", "ewma", "cusum")
DETECTOR_LABEL = {"composite": "Composite Outbreak Signal", "ewma": "EWMA", "cusum": "CUSUM"}

#: Fixed before any result was seen (Phase 10 specification, section 6).
DETECTION_DEFINITION = {
    "composite": "First monitored date whose severity is High or Critical.",
    "ewma": "First monitored date whose overall EWMA state is STATISTICAL ALERT.",
    "cusum": "First monitored date on which either metric's CUSUM has reached h.",
}
SECONDARY_EVENTS = {
    "composite_watch": "First monitored date whose severity is Watch or above.",
    "composite_moderate": "First monitored date whose severity is Moderate or above.",
    "ewma_watch": "First monitored date whose overall EWMA state is WATCH or above.",
}

FACILITIES = ("EVAL-A", "EVAL-B", "EVAL-C")


@dataclass(frozen=True)
class FacilityProfile:
    code: str
    name: str
    postal_code: str
    #: Mean eligible tests a day at baseline.
    mean_tests: float


@dataclass(frozen=True)
class DayPlan:
    """What the generator should draw for one facility on one day."""

    volume_multiplier: float = 1.0
    positivity: float = 0.08
    reporting: bool = True
    #: Share of the facility's tests coded with an unmapped LOINC code.
    unmapped_share: float = 0.0
    #: Share of tests missing a specimen type.
    missing_specimen_share: float = 0.0
    #: Reporting delay range in days (None: same day, minutes).
    delay_days: tuple[int, int] | None = None


@dataclass(frozen=True)
class GroundTruth:
    """Set by the scenario design, never inferred from any detector."""

    scenario_id: str
    outbreak_present: bool
    true_outbreak_start: date | None
    true_outbreak_end: date | None
    true_affected_facilities: tuple[str, ...]
    true_affected_geographies: tuple[str, ...]
    description: str

    def as_dict(self) -> dict:
        return {
            "scenario_id": self.scenario_id,
            "outbreak_present": self.outbreak_present,
            "true_outbreak_start": None if self.true_outbreak_start is None else self.true_outbreak_start.isoformat(),
            "true_outbreak_end": None if self.true_outbreak_end is None else self.true_outbreak_end.isoformat(),
            "true_affected_facilities": list(self.true_affected_facilities),
            "true_affected_geographies": list(self.true_affected_geographies),
            "description": self.description,
        }


@dataclass(frozen=True)
class Scenario:
    id: str
    number: int
    name: str
    purpose: str
    description: str
    facilities: tuple[FacilityProfile, ...]
    #: (facility code, monitoring-day offset from onset, d) -> plan; d < 0 before onset.
    plan: Callable[[str, int], DayPlan]
    outbreak_present: bool
    affected_facilities: tuple[str, ...]
    #: Data-quality or coverage conditions, for the robustness sections.
    conditions: tuple[str, ...] = ()
    #: Evaluate detection "as of" each day, with only data received by then.
    as_of: bool = False
    #: Id of the clean scenario this one is compared with, if any.
    compare_with: str | None = None
    group: Literal["primary", "coverage"] = "primary"


@dataclass
class DayRecord:
    """One monitored day of one realization, as the detectors saw it."""

    day: date
    truth: Literal["normal", "outbreak"]
    volume: int
    positivity: float | None
    composite_status: str
    composite_score: float | None
    composite_severity: str | None
    affected_facilities: int
    data_confidence: float | None
    ewma_volume: str | None
    ewma_positivity: str | None
    ewma_overall: str | None
    cusum_volume: str | None
    cusum_positivity: str | None
    cusum_overall: str | None
    cusum_positivity_value: float | None = None
    cusum_volume_value: float | None = None

    def alert(self, detector: Detector) -> bool:
        if detector == "composite":
            return self.composite_severity in ("High", "Critical")
        if detector == "ewma":
            return self.ewma_overall == "STATISTICAL_ALERT"
        return self.cusum_overall == "STATISTICAL_ALERT"


@dataclass
class RealizationResult:
    scenario_id: str
    repetition: int
    seed: int
    truth: GroundTruth
    days: list[DayRecord]
    #: As-of detection dates (only for as-of scenarios): detector -> date seen.
    as_of_detection: dict[str, date | None] = field(default_factory=dict)
    #: Daily regional series of the whole realization (for the secondary analyses).
    series: dict[str, dict[date, float | None]] = field(default_factory=dict)
    observation_count: int = 0
