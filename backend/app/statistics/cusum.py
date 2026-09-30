"""
The standardized one-sided upper CUSUM. Pure functions: numbers in, numbers out.

For one metric's daily series Y_t (test volume, or positivity in percent):

    reference   mean mu and sample SD s over the SAME reference period EWMA
                uses (passed in; see cusum_service), strictly before every
                monitored day
    standardize z_t = (Y_t - mu) / s
    start       C_0 = 0
    recursion   C_t = max(0, C_(t-1) + z_t - k)
    decision    STATISTICAL_ALERT when C_t >= h, otherwise NORMAL

k (the reference or slack value) is how many SDs above the mean a day must be
before it adds to the sum; h is the decision limit. The max(0, ...) is the
only reset: the sum falls back towards zero on its own when days are not
persistently above the baseline. Nothing else resets it, not even an alert,
and it never looks at another detector.

A day without data does not update the sum (carried forward).

"Approaching the limit" (C_t / h >= approaching_fraction) is an INFORMATIONAL
display flag only. It is not a statistical state: the formal state stays
NORMAL until C_t reaches h.

Only increases are detected (upper CUSUM). There is no downward CUSUM.
"""

from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import Literal

from app.statistics.types import Metric, Reference, Status

CusumState = Literal["NORMAL", "STATISTICAL_ALERT"]

LABEL = "Experimental Statistical Surveillance"
DISCLAIMER = (
    "CUSUM is an experimental statistical surveillance method in this capstone and has not been "
    "epidemiologically validated for production decision-making."
)


@dataclass(frozen=True)
class CusumConfig:
    """Illustrative prototype defaults, not epidemiologically validated."""

    #: Reference (slack) value, in SDs.
    k: float = 0.5
    #: Decision limit.
    h: float = 5.0
    #: The informational "approaching the limit" flag starts at this fraction of h.
    approaching_fraction: float = 0.75

    def __post_init__(self) -> None:
        if self.k < 0:
            raise ValueError("k must not be negative.")
        if self.h <= 0:
            raise ValueError("h must be positive.")
        if not 0 < self.approaching_fraction < 1:
            raise ValueError("approaching_fraction must be in (0, 1).")

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class CusumPoint:
    day: date
    metric: Metric
    status: Status
    observed: float | None
    z: float | None = None
    previous: float | None = None
    value: float | None = None
    #: Number of CUSUM updates so far (days with data since monitoring began).
    t: int = 0
    state: CusumState | None = None
    k: float | None = None
    h: float | None = None
    approaching_fraction: float | None = None

    @property
    def increment(self) -> float | None:
        """What today adds before the max(0, ...): z_t - k."""
        return None if self.z is None or self.k is None else self.z - self.k

    @property
    def distance_to_limit(self) -> float | None:
        """h - C_t: positive below the limit, zero or negative once it is reached."""
        return None if self.value is None or self.h is None else self.h - self.value

    @property
    def approaching(self) -> bool:
        """Informational only: NORMAL, but at or above approaching_fraction of h."""
        return (
            self.state == "NORMAL"
            and self.value is not None
            and self.h is not None
            and self.approaching_fraction is not None
            and self.value / self.h >= self.approaching_fraction
        )


def standardize(observed: float, mean: float, stddev: float) -> float:
    return (observed - mean) / stddev


def next_cusum(previous: float, z: float, k: float) -> float:
    return max(0.0, previous + z - k)


def state_for(value: float, h: float) -> CusumState:
    return "STATISTICAL_ALERT" if value >= h else "NORMAL"


def run(
    metric: Metric,
    series: Mapping[date, float | None],
    reference: Reference,
    first: date,
    last: date,
    config: CusumConfig,
) -> list[CusumPoint]:
    """Every day from ``first`` to ``last``: reference days, then monitored days."""
    points: list[CusumPoint] = []
    value = 0.0
    t = 0
    day = first
    while day <= last:
        observed = series.get(day)
        if day <= reference.last:
            points.append(CusumPoint(day, metric, "REFERENCE_PERIOD", observed))
        elif reference.status != "OK":
            points.append(CusumPoint(day, metric, reference.status, observed))
        elif observed is None:
            points.append(CusumPoint(day, metric, "NO_DATA", None, previous=value, t=t, k=config.k, h=config.h))
        else:
            t += 1
            z = standardize(observed, reference.mean, reference.stddev)
            previous, value = value, next_cusum(value, z, config.k)
            points.append(
                CusumPoint(
                    day, metric, "CALCULATED", observed, z=z, previous=previous, value=value, t=t,
                    state=state_for(value, config.h), h=config.h,
                    approaching_fraction=config.approaching_fraction, k=config.k,
                )
            )
        day += timedelta(days=1)
    return points


def in_sample(
    metric: Metric, series: Mapping[date, float | None], reference: Reference, config: CusumConfig
) -> list[CusumPoint]:
    """
    ANALYSIS ONLY: CUSUM run over the reference period itself, against the
    reference's own mean and SD. Optimistic (the period defines its own
    baseline), but it shows whether ordinary in-control variation alone would
    have crossed h.
    """
    if reference.status != "OK":
        return []
    shifted = Reference(reference.first, reference.first - timedelta(days=1), reference.days,
                        reference.mean, reference.stddev, "OK")
    return run(metric, {d: v for d, v in series.items() if d <= reference.last}, shifted,
               reference.first, reference.last, config)


def overall_state(states: list[CusumState | None]) -> CusumState | None:
    """STATISTICAL_ALERT when either metric has reached h; None when neither was monitored."""
    known = [s for s in states if s is not None]
    if not known:
        return None
    return "STATISTICAL_ALERT" if "STATISTICAL_ALERT" in known else "NORMAL"
