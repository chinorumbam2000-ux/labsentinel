"""
The CUSUM detector's arithmetic and the three-method agreement, without a
database. Every expected value is worked out by hand in the comments.
"""

import math
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.statistics import cusum, ewma
from app.statistics.cusum import CusumConfig
from app.statistics.cusum_service import three_method
from app.statistics.types import EwmaConfig

CONFIG = CusumConfig()  # k 0.5, h 5, approaching at 0.75 of h (informational)
REFERENCE_CONFIG = EwmaConfig()  # the shared reference: 28 days, >= 21 with data
D0 = date(2026, 3, 1)

# Reference: 14 x 8 and 14 x 12 -> mean 10, SD sqrt(28 x 4 / 27) = 2.036700.
REFERENCE_VALUES = [8.0, 12.0] * 14
SD = math.sqrt(112 / 27)


def series(reference: list[float | None], monitored: list[float | None]) -> dict[date, float | None]:
    values = {D0 + timedelta(days=i): v for i, v in enumerate(reference)}
    start = D0 + timedelta(days=REFERENCE_CONFIG.reference_days)
    values.update({start + timedelta(days=i): v for i, v in enumerate(monitored)})
    return values


def run(monitored: list[float | None], reference_values=REFERENCE_VALUES, config=CONFIG):
    values = series(reference_values, monitored)
    reference = ewma.reference_for(values, D0, REFERENCE_CONFIG)
    last = D0 + timedelta(days=REFERENCE_CONFIG.reference_days + len(monitored) - 1)
    return reference, cusum.run("positivity", values, reference, D0, last, config)[28:]


def test_z_score_and_recursion() -> None:
    assert cusum.standardize(13.0, 10.0, 2.0) == 1.5
    assert cusum.next_cusum(1.0, 1.5, 0.5) == 2.0  # 1 + 1.5 - 0.5
    assert cusum.next_cusum(1.0, -3.0, 0.5) == 0.0  # max(0, -2.5): resets to zero


def test_k_and_h_handling() -> None:
    # k is subtracted every day: with k 0 a day at z 0.5 accumulates, with k 0.5 it does not.
    assert cusum.next_cusum(0.0, 0.5, 0.0) == 0.5
    assert cusum.next_cusum(0.0, 0.5, 0.5) == 0.0
    # The decision limit is inclusive: C_t >= h alerts.
    assert cusum.state_for(5.0, 5.0) == "STATISTICAL_ALERT"
    assert cusum.state_for(4.9999, 5.0) == "NORMAL"
    for bad in ({"k": -0.1}, {"h": 0.0}, {"approaching_fraction": 1.0}):
        with pytest.raises(ValueError):
            CusumConfig(**bad)


def test_hand_calculated_sequence() -> None:
    """
    mean 10, SD 2.036700, k 0.5, h 5
    y 13: z 3/2.036700 = 1.472971; C = max(0, 0 + 1.472971 - 0.5) = 0.972971          NORMAL
    y 16: z 6/2.036700 = 2.945942; C = 0.972971 + 2.445942 = 3.418912                  NORMAL (0.68 h)
    y 16: z 2.945942;              C = 3.418912 + 2.445942 = 5.864854 >= 5             STATISTICAL ALERT
    y  4: z -2.945942;             C = max(0, 5.864854 - 3.445942) = 2.418912          NORMAL again
    """
    reference, points = run([13.0, 16.0, 16.0, 4.0])
    assert reference.mean == pytest.approx(10.0) and reference.stddev == pytest.approx(SD)
    expected = [(1.472971, 0.0, 0.972971, "NORMAL"), (2.945942, 0.972971, 3.418912, "NORMAL"),
                (2.945942, 3.418912, 5.864854, "STATISTICAL_ALERT"), (-2.945942, 5.864854, 2.418912, "NORMAL")]
    for point, (z, previous, value, state) in zip(points, expected):
        assert point.z == pytest.approx(z, abs=1e-6)
        assert point.previous == pytest.approx(previous, abs=1e-6)
        assert point.value == pytest.approx(value, abs=1e-6)
        assert point.state == state
    assert points[2].increment == pytest.approx(2.445942, abs=1e-6)
    assert points[2].distance_to_limit == pytest.approx(-0.864854, abs=1e-6)
    assert [p.t for p in points] == [1, 2, 3, 4]


def test_reset_to_zero_and_no_other_reset() -> None:
    # Below-mean days keep the sum at zero; an alert does not reset it.
    _, points = run([8.0, 8.0, 30.0, 30.0])
    assert [p.value for p in points[:2]] == [0.0, 0.0]
    assert points[2].state == points[3].state == "STATISTICAL_ALERT"
    assert points[3].value > points[2].value  # still accumulating after the alert


def test_approaching_the_limit_is_informational_only() -> None:
    # After y 13 and y 16, C = 3.418912 = 0.68 h: not approaching.
    # Then y 12 (z 0.981981): C = 3.418912 + 0.481981 = 3.900893 = 0.78 h -> approaching, still NORMAL.
    _, points = run([13.0, 16.0, 12.0])
    assert not points[1].approaching
    assert points[2].value == pytest.approx(3.900893, abs=1e-6)
    assert points[2].approaching and points[2].state == "NORMAL"


def test_days_without_data_carry_the_sum_forward() -> None:
    _, points = run([13.0, None, 16.0])
    assert points[1].status == "NO_DATA" and points[1].previous == pytest.approx(0.972971, abs=1e-6)
    assert points[2].t == 2 and points[2].value == pytest.approx(3.418912, abs=1e-6)


def test_insufficient_baseline_and_zero_variance() -> None:
    reference, points = run([30.0], reference_values=[8.0, 12.0] * 10 + [None] * 8)
    assert reference.status == "INSUFFICIENT_BASELINE"
    assert points[0].status == "INSUFFICIENT_BASELINE" and points[0].value is None and points[0].state is None
    reference, points = run([30.0], reference_values=[8.0] * 28)
    assert reference.status == "INSUFFICIENT_VARIANCE"
    assert points[0].status == "INSUFFICIENT_VARIANCE" and points[0].z is None  # never divides by zero


def test_no_future_data_leaks_into_earlier_days() -> None:
    _, first = run([13.0, 16.0])
    _, later = run([13.0, 16.0, 500.0])
    assert later[:2] == first


def test_in_sample_reference_check() -> None:
    values = series(REFERENCE_VALUES, [])
    reference = ewma.reference_for(values, D0, REFERENCE_CONFIG)
    points = cusum.in_sample("volume", values, reference, CONFIG)
    # Alternating 8 / 12: z -0.981981 and +0.981981; C never exceeds 0.481981.
    assert len(points) == 28 and max(p.value for p in points) == pytest.approx(0.481981, abs=1e-6)
    assert not any(p.state == "STATISTICAL_ALERT" for p in points)


def test_overall_state() -> None:
    assert cusum.overall_state(["NORMAL", "STATISTICAL_ALERT"]) == "STATISTICAL_ALERT"
    assert cusum.overall_state(["NORMAL", None]) == "NORMAL"
    assert cusum.overall_state([None, None]) is None


def composite(severity: str | None) -> SimpleNamespace:
    return SimpleNamespace(severity=severity, calculation_status="CALCULATED" if severity else "INSUFFICIENT_BASELINE")


@pytest.mark.parametrize(
    ("severity", "ewma_state", "cusum_state", "label", "methods"),
    [
        ("High", "STATISTICAL_ALERT", "STATISTICAL_ALERT", "3 OF 3 METHODS SIGNAL", (True, True, True)),
        ("Critical", "WATCH", "STATISTICAL_ALERT", "2 OF 3 METHODS SIGNAL", (True, False, True)),
        ("Moderate", "WATCH", "STATISTICAL_ALERT", "1 OF 3 METHODS SIGNAL", (False, False, True)),
        ("Watch", "NORMAL", "NORMAL", "NO METHODS SIGNAL", (False, False, False)),
        (None, "STATISTICAL_ALERT", "NORMAL", "1 OF 2 AVAILABLE METHODS SIGNAL", (None, True, False)),
    ],
)
def test_three_method_agreement(severity, ewma_state, cusum_state, label, methods) -> None:
    result = three_method(composite(severity), ewma_state, cusum_state)
    assert result["label"] == label
    assert tuple(result["methods"].values()) == methods
    assert three_method(None, None, None)["label"] == "NOT AVAILABLE"
