"""
The EWMA detector's arithmetic, without a database. Every expected value is
worked out by hand in the comments.
"""

import math
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.statistics import ewma
from app.statistics.service import agreement
from app.statistics.types import EwmaConfig

CONFIG = EwmaConfig()  # lambda 0.25, k 3, warning 2/3, reference 28 days (>= 21 with data)
D0 = date(2026, 3, 1)


def series(reference: list[float | None], monitored: list[float | None]) -> dict[date, float | None]:
    """Reference values on D0.., then monitored values right after the 28-day reference period."""
    values = {D0 + timedelta(days=i): v for i, v in enumerate(reference)}
    start = D0 + timedelta(days=CONFIG.reference_days)
    values.update({start + timedelta(days=i): v for i, v in enumerate(monitored)})
    return values


# Reference: 14 x 8 and 14 x 12 -> mean 10; deviations all +-2, so
# SD = sqrt(28 x 4 / 27) = sqrt(4.148148) = 2.036700.
REFERENCE = [8.0, 12.0] * 14
SD = math.sqrt(28 * 4 / 27)


def test_recursion() -> None:
    # 0.25 x 20 + 0.75 x 10 = 12.5; then 0.25 x 20 + 0.75 x 12.5 = 14.375
    assert ewma.next_ewma(10.0, 20.0, 0.25) == 12.5
    assert ewma.next_ewma(12.5, 20.0, 0.25) == 14.375


def test_lambda_handling() -> None:
    assert ewma.next_ewma(10.0, 20.0, 1.0) == 20.0  # lambda 1: no memory
    assert ewma.next_ewma(10.0, 20.0, 0.1) == pytest.approx(11.0)
    for bad in ({"lam": 0.0}, {"lam": 1.5}, {"k": 0.0}, {"warning_fraction": 1.0}, {"min_reference_days": 29}):
        with pytest.raises(ValueError):
            EwmaConfig(**bad)
    assert EwmaConfig(lam=0.15).as_dict()["lambda"] == 0.15


def test_limit_factors() -> None:
    # t = 1: sqrt(0.25/1.75 x (1 - 0.75^2)) = sqrt(0.142857 x 0.4375) = sqrt(0.0625) = 0.25 = lambda
    assert ewma.sigma_factor(0.25, 1) == pytest.approx(0.25)
    # t = 2: sqrt(0.142857 x (1 - 0.75^4)) = sqrt(0.142857 x 0.683594) = 0.312500
    assert ewma.sigma_factor(0.25, 2) == pytest.approx(0.3125)
    # long run: sqrt(0.25 / 1.75) = sqrt(1/7) = 0.377964
    assert ewma.asymptotic_factor(0.25) == pytest.approx(1 / math.sqrt(7))
    assert ewma.sigma_factor(0.25, 60) == pytest.approx(ewma.asymptotic_factor(0.25))


def test_reference_mean_and_standard_deviation() -> None:
    reference = ewma.reference_for(series(REFERENCE, []), D0, CONFIG)
    assert (reference.days, reference.status) == (28, "OK")
    assert reference.mean == pytest.approx(10.0)
    assert reference.stddev == pytest.approx(SD)
    assert reference.last == D0 + timedelta(days=27)


def test_insufficient_baseline() -> None:
    # 20 days with data in the 28-day period: fewer than 21.
    reference_values = [8.0, 12.0] * 10 + [None] * 8
    reference, points = ewma.run("volume", series(reference_values, [50.0]), D0, D0 + timedelta(days=28), CONFIG)
    assert (reference.days, reference.status, reference.mean) == (20, "INSUFFICIENT_BASELINE", None)
    assert points[-1].status == "INSUFFICIENT_BASELINE" and points[-1].ewma is None and points[-1].ucl is None


def test_zero_variance() -> None:
    reference, points = ewma.run("positivity", series([8.0] * 28, [30.0]), D0, D0 + timedelta(days=28), CONFIG)
    assert (reference.status, reference.stddev) == ("INSUFFICIENT_VARIANCE", 0.0)
    assert points[-1].status == "INSUFFICIENT_VARIANCE" and points[-1].ucl is None


def test_first_updates_hand_calculated() -> None:
    """
    mean 10, SD 2.036700, lambda 0.25, k 3, warning 2/3
    day 1: y 12 -> EWMA 0.25x12 + 0.75x10 = 10.5
           sigma_1 = 2.036700 x 0.25 = 0.509175; UCL 10 + 3 x 0.509175 = 11.527525;
           WL 10 + 2 x 0.509175 = 11.018350 -> 10.5 below both: NORMAL
    day 2: y 16 -> EWMA 0.25x16 + 0.75x10.5 = 11.875
           sigma_2 = 2.036700 x 0.3125 = 0.636469; UCL 11.909406; WL 11.272938 -> WATCH
    day 3: y 16 -> EWMA 0.25x16 + 0.75x11.875 = 12.90625
           sigma_3 = 2.036700 x sqrt(0.142857 x (1 - 0.177979)) = 2.036700 x 0.342683 = 0.697943
           UCL 10 + 3 x 0.697943 = 12.093828 -> above: STATISTICAL_ALERT,
           distance 12.093828 - 12.90625 = -0.812422
    """
    _, points = ewma.run("volume", series(REFERENCE, [12.0, 16.0, 16.0]), D0, D0 + timedelta(days=30), CONFIG)
    day1, day2, day3 = points[28:]
    assert [p.status for p in points[:28]] == ["REFERENCE_PERIOD"] * 28
    assert (day1.previous_ewma, day1.ewma, day1.t) == (10.0, 10.5, 1)
    assert day1.ucl == pytest.approx(11.527525, abs=1e-6)
    assert day1.warning_limit == pytest.approx(11.018350, abs=1e-6)
    assert day1.state == "NORMAL"
    assert day2.ewma == 11.875 and day2.ucl == pytest.approx(11.909406, abs=1e-6)
    assert day2.warning_limit == pytest.approx(11.272938, abs=1e-6) and day2.state == "WATCH"
    assert day3.ewma == pytest.approx(12.90625) and day3.ucl == pytest.approx(12.093828, abs=1e-6)
    assert day3.state == "STATISTICAL_ALERT"
    assert day3.distance_to_ucl == pytest.approx(-0.812422, abs=1e-6)
    assert day3.asymptotic_ucl == pytest.approx(10 + 3 * SD / math.sqrt(7))


def test_only_increases_are_flagged() -> None:
    _, points = ewma.run("volume", series(REFERENCE, [0.0, 0.0, 0.0]), D0, D0 + timedelta(days=30), CONFIG)
    assert [p.state for p in points[28:]] == ["NORMAL"] * 3


def test_days_without_data_carry_the_ewma_forward() -> None:
    _, points = ewma.run("volume", series(REFERENCE, [12.0, None, 16.0]), D0, D0 + timedelta(days=30), CONFIG)
    day1, gap, day3 = points[28:]
    assert gap.status == "NO_DATA" and gap.ewma is None and gap.previous_ewma == 10.5 and gap.t == 1
    # The update after the gap is the second one: 0.25 x 16 + 0.75 x 10.5 = 11.875, t = 2.
    assert (day3.ewma, day3.t) == (11.875, 2)


def test_no_future_data_leaks_into_earlier_days() -> None:
    first = ewma.run("volume", series(REFERENCE, [12.0, 16.0]), D0, D0 + timedelta(days=29), CONFIG)[1]
    later = ewma.run("volume", series(REFERENCE, [12.0, 16.0, 500.0]), D0, D0 + timedelta(days=30), CONFIG)[1]
    assert later[:30] == first  # a huge later value changes nothing before it


def test_overall_state() -> None:
    assert ewma.overall_state(["NORMAL", "STATISTICAL_ALERT"]) == "STATISTICAL_ALERT"
    assert ewma.overall_state(["WATCH", "NORMAL"]) == "WATCH"
    assert ewma.overall_state(["NORMAL", None]) == "NORMAL"
    assert ewma.overall_state([None, None]) is None


def composite(severity: str | None, status: str = "CALCULATED") -> SimpleNamespace:
    return SimpleNamespace(severity=severity, calculation_status=status)


@pytest.mark.parametrize(
    ("severity", "overall", "expected"),
    [
        ("High", "STATISTICAL_ALERT", "BOTH_METHODS_SIGNAL"),
        ("Critical", "WATCH", "COMPOSITE_ONLY"),
        ("Moderate", "STATISTICAL_ALERT", "EWMA_ONLY"),
        ("Watch", "WATCH", "NEITHER"),
        ("Low", "NORMAL", "NEITHER"),
        (None, "NORMAL", "NOT_AVAILABLE"),
    ],
)
def test_agreement(severity: str | None, overall: str, expected: str) -> None:
    signal = composite(severity) if severity else composite(None, "INSUFFICIENT_BASELINE")
    assert agreement(signal, overall) == expected  # type: ignore[arg-type]
    assert agreement(None, overall) == "NOT_AVAILABLE"  # type: ignore[arg-type]
    assert agreement(composite("High"), None) == "NOT_AVAILABLE"
