"""
Types and configuration of the EWMA statistical detector.

EXPERIMENTAL STATISTICAL SURVEILLANCE. EWMA is an experimental statistical
surveillance method in this capstone and has not been validated for
production epidemiological decision-making.
"""

from dataclasses import asdict, dataclass
from datetime import date
from typing import Literal

LABEL = "Experimental Statistical Surveillance"
DISCLAIMER = (
    "EWMA is an experimental statistical surveillance method in this capstone and has not been "
    "validated for production epidemiological decision-making."
)
DETECTOR_NOTE = "Prototype statistical detector — not clinically or epidemiologically validated."

METHOD = "EWMA"
Metric = Literal["volume", "positivity"]
METRICS: tuple[Metric, ...] = ("volume", "positivity")
METRIC_LABEL = {"volume": "Test volume", "positivity": "Positivity"}

Status = Literal["CALCULATED", "REFERENCE_PERIOD", "INSUFFICIENT_BASELINE", "INSUFFICIENT_VARIANCE", "NO_DATA"]
AlertState = Literal["NORMAL", "WATCH", "STATISTICAL_ALERT"]
Agreement = Literal["BOTH_METHODS_SIGNAL", "COMPOSITE_ONLY", "EWMA_ONLY", "NEITHER", "NOT_AVAILABLE"]


@dataclass(frozen=True)
class EwmaConfig:
    """
    Development defaults; every value is stored with each result. None of
    them is epidemiologically validated.
    """

    #: Smoothing weight of today's value (0 < lambda <= 1). 0.25 is a common
    #: textbook starting point, not a validated choice.
    lam: float = 0.25
    #: Control-limit multiplier: UCL = mean + k x sigma_EWMA.
    k: float = 3.0
    #: WATCH starts this fraction of the way from the mean to the UCL.
    #: 2/3 with k = 3 is a 2-sigma warning limit.
    warning_fraction: float = 2 / 3
    #: The reference period is the first ``reference_days`` calendar days of
    #: eligible history; monitoring starts the day after it.
    reference_days: int = 28
    #: ...and needs at least this many days with data in it.
    min_reference_days: int = 21

    def __post_init__(self) -> None:
        if not 0 < self.lam <= 1:
            raise ValueError("lambda must be in (0, 1].")
        if self.k <= 0:
            raise ValueError("k must be positive.")
        if not 0 < self.warning_fraction < 1:
            raise ValueError("warning_fraction must be in (0, 1).")
        if not 2 <= self.min_reference_days <= self.reference_days:
            raise ValueError("min_reference_days must be between 2 and reference_days.")

    def as_dict(self) -> dict:
        values = asdict(self)
        values["lambda"] = values.pop("lam")
        return values


@dataclass(frozen=True)
class Reference:
    """Mean and sample SD of one metric over the reference period."""

    first: date
    last: date
    days: int  # days with data in the period
    mean: float | None
    stddev: float | None
    status: Literal["OK", "INSUFFICIENT_BASELINE", "INSUFFICIENT_VARIANCE"]

    def as_dict(self) -> dict:
        return {
            "first": self.first.isoformat(),
            "last": self.last.isoformat(),
            "days": self.days,
            "mean": None if self.mean is None else round(self.mean, 4),
            "stddev": None if self.stddev is None else round(self.stddev, 4),
            "status": self.status,
        }


@dataclass(frozen=True)
class EwmaPoint:
    """One day of one metric."""

    day: date
    metric: Metric
    status: Status
    observed: float | None
    previous_ewma: float | None = None
    ewma: float | None = None
    #: Number of EWMA updates so far, this one included (days with data).
    t: int = 0
    ucl: float | None = None
    warning_limit: float | None = None
    asymptotic_ucl: float | None = None
    state: AlertState | None = None

    @property
    def distance_to_ucl(self) -> float | None:
        """UCL - EWMA: positive while below the limit, negative once above it."""
        return None if self.ucl is None or self.ewma is None else self.ucl - self.ewma
