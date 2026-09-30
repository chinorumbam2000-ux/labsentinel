"""
The EWMA (exponentially weighted moving average) control chart. Pure
functions: numbers in, numbers out.

For one metric's daily series Y_t (test volume, or positivity in percent):

    reference period  mean mu and sample SD s of Y over the reference days
                      (the first ``reference_days`` of history), strictly
                      before every monitored day: no future data is used
    start             EWMA_0 = mu
    recursion         EWMA_t = lambda * Y_t + (1 - lambda) * EWMA_(t-1)
    limits            sigma_t = s * sqrt( lambda / (2 - lambda) * (1 - (1 - lambda)^(2t)) )
                      UCL_t   = mu + k * sigma_t
                      WL_t    = mu + warning_fraction * k * sigma_t
    state             STATISTICAL_ALERT if EWMA_t > UCL_t
                      WATCH             if EWMA_t > WL_t
                      NORMAL            otherwise

t counts EWMA updates (days with data) since monitoring began. The limits
are the exact time-varying ones (Montgomery, Introduction to Statistical
Quality Control): narrower for the first few updates, then converging to the
long-run limit mu + k * s * sqrt(lambda / (2 - lambda)), which is stored
alongside for reference. A day without data does not update the EWMA (it is
carried forward, and t does not advance).

Only the UPPER limit is used: LabSentinel watches for increases in testing
and positivity. Falls are not flagged.
"""

import math
import statistics
from collections.abc import Mapping
from datetime import date, timedelta

from app.statistics.types import AlertState, EwmaConfig, EwmaPoint, Metric, Reference

#: A reference SD at or below this is treated as zero variance.
MIN_STDDEV = 1e-9


def next_ewma(previous: float, observed: float, lam: float) -> float:
    return lam * observed + (1 - lam) * previous


def sigma_factor(lam: float, t: int) -> float:
    """sigma_t / s for the t-th update (exact, time-varying)."""
    return math.sqrt(lam / (2 - lam) * (1 - (1 - lam) ** (2 * t)))


def asymptotic_factor(lam: float) -> float:
    """The long-run limit of sigma_factor as t grows."""
    return math.sqrt(lam / (2 - lam))


def limits(mean: float, stddev: float, config: EwmaConfig, t: int) -> tuple[float, float]:
    """(UCL_t, warning limit_t)."""
    spread = config.k * stddev * sigma_factor(config.lam, t)
    return mean + spread, mean + config.warning_fraction * spread


def state_for(ewma: float, ucl: float, warning_limit: float) -> AlertState:
    if ewma > ucl:
        return "STATISTICAL_ALERT"
    if ewma > warning_limit:
        return "WATCH"
    return "NORMAL"


def reference_for(
    series: Mapping[date, float | None], first: date, config: EwmaConfig
) -> Reference:
    """Mean and sample SD over the reference period [first, first + reference_days - 1]."""
    last = first + timedelta(days=config.reference_days - 1)
    values = [v for day, v in series.items() if first <= day <= last and v is not None]
    if len(values) < config.min_reference_days:
        return Reference(first, last, len(values), None, None, "INSUFFICIENT_BASELINE")
    mean = statistics.fmean(values)
    stddev = statistics.stdev(values)
    if stddev <= MIN_STDDEV:
        return Reference(first, last, len(values), mean, stddev, "INSUFFICIENT_VARIANCE")
    return Reference(first, last, len(values), mean, stddev, "OK")


def run(
    metric: Metric,
    series: Mapping[date, float | None],
    first: date,
    last: date,
    config: EwmaConfig,
) -> tuple[Reference, list[EwmaPoint]]:
    """
    Every day from ``first`` to ``last``: reference days, then monitored days.
    ``series`` maps a day to its observed value, or None when there were no
    eligible results.
    """
    reference = reference_for(series, first, config)
    points: list[EwmaPoint] = []
    ewma = reference.mean
    t = 0
    day = first
    while day <= last:
        observed = series.get(day)
        if day <= reference.last:
            points.append(EwmaPoint(day, metric, "REFERENCE_PERIOD", observed))
        elif reference.status != "OK":
            points.append(EwmaPoint(day, metric, reference.status, observed))
        elif observed is None:
            points.append(EwmaPoint(day, metric, "NO_DATA", None, previous_ewma=ewma, t=t))
        else:
            t += 1
            previous, ewma = ewma, next_ewma(ewma, observed, config.lam)
            ucl, warning = limits(reference.mean, reference.stddev, config, t)
            points.append(
                EwmaPoint(
                    day,
                    metric,
                    "CALCULATED",
                    observed,
                    previous_ewma=previous,
                    ewma=ewma,
                    t=t,
                    ucl=ucl,
                    warning_limit=warning,
                    asymptotic_ucl=reference.mean
                    + config.k * reference.stddev * asymptotic_factor(config.lam),
                    state=state_for(ewma, ucl, warning),
                )
            )
        day += timedelta(days=1)
    return reference, points


def overall_state(states: list[AlertState | None]) -> AlertState | None:
    """
    STATISTICAL_ALERT if any metric is above its UCL, else WATCH if any is
    above its warning limit, else NORMAL. None when no metric was monitored.
    Not a score: it only says whether either metric crossed a line.
    """
    known = [s for s in states if s is not None]
    if not known:
        return None
    if "STATISTICAL_ALERT" in known:
        return "STATISTICAL_ALERT"
    if "WATCH" in known:
        return "WATCH"
    return "NORMAL"
