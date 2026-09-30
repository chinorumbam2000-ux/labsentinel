"""
The dynamic baseline: a rolling historical mean of prior days only.

For a surveillance date D and a window of W days (default 7):

- The window is D-W through D-1. D itself and anything after it are never
  read, so a baseline cannot see the future (no data leakage).
- An *observed* day is a window day with at least one eligible result. Days
  without data are left out rather than counted as zero: a silent feed is
  unknown, not a quiet week.
- With fewer than ``min_baseline_days`` observed days (default 5) there is no
  baseline, and nothing is scored (INSUFFICIENT_BASELINE). None is invented.
- Baseline test volume = total eligible tests / observed days.
- Baseline positivity = total positives / total Positive-or-Negative results
  over the observed days (pooled, so a large day weighs more than a small one).

The frozen demonstration's fixed baseline (100 tests, 8 %) is never used here.
"""

from collections.abc import Mapping
from datetime import date, timedelta

from app.surveillance.types import Baseline, Counts, EngineConfig


def window_for(target: date, config: EngineConfig) -> tuple[date, date]:
    """The first and last day of the baseline window for ``target``."""
    return target - timedelta(days=config.baseline_window_days), target - timedelta(days=1)


def baseline_for(daily: Mapping[date, Counts], target: date, config: EngineConfig) -> Baseline:
    start, end = window_for(target, config)
    observed = [
        counts
        for day, counts in daily.items()
        if start <= day <= end and counts.tests > 0
    ]
    tests = sum(c.tests for c in observed)
    positives = sum(c.positive for c in observed)
    determinate = sum(c.determinate for c in observed)
    sufficient = len(observed) >= config.min_baseline_days and determinate > 0
    return Baseline(
        window_start=start,
        window_end=end,
        window_days=config.baseline_window_days,
        observed_days=len(observed),
        min_days=config.min_baseline_days,
        mean_tests=tests / len(observed) if sufficient else None,
        positivity=positives / determinate * 100 if sufficient else None,
    )
