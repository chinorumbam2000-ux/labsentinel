"""
The dynamic engine's scorer and baseline, without a database.

Hand-calculated examples are written out in the comments; the code must
reproduce them exactly.
"""

import re
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.seed import load_dataset
from app.surveillance import scorer
from app.surveillance.baseline import baseline_for, window_for
from app.surveillance.scorer import FacilityQuality
from app.surveillance.types import Counts, EngineConfig

REPO = Path(__file__).resolve().parents[2]


def ts_weights(path: str, name: str) -> dict[str, float]:
    source = (REPO / path).read_text(encoding="utf-8")
    block = re.search(name + r" = \{(.*?)\} as const", source, re.S).group(1)
    return {key: float(value) for key, value in re.findall(r"(\w+): ([0-9.]+)", block)}


# ---------------------------------------------------------------------------
# Fidelity to the prototype's models
# ---------------------------------------------------------------------------


def test_weights_are_the_prototypes_own() -> None:
    assert ts_weights("src/lib/signalScore.ts", "SCORE_WEIGHTS") == scorer.SCORE_WEIGHTS
    assert ts_weights("src/lib/dataConfidence.ts", "CONFIDENCE_WEIGHTS") == scorer.CONFIDENCE_WEIGHTS
    assert sum(scorer.SCORE_WEIGHTS.values()) == pytest.approx(1.0)


def test_port_reproduces_the_frozen_demonstration_from_its_inputs() -> None:
    """
    Fed the frozen demonstration's own inputs (fixed baseline 100 tests / 8 %,
    three facilities, three areas), the Python scorer gives the persisted
    classroom scores. The demonstration itself is never recalculated.
    """
    scores = []
    for row in load_dataset().signals:
        result = scorer.composite(
            {
                "volume": scorer.volume_score(scorer.volume_change_percent(row.test_volume, 100)),
                "positivity": scorer.positivity_score(float(row.positivity_rate) - 8.0),
                "facilities": scorer.share_score(row.affected_facilities, 3),
                "geography": scorer.share_score(len(row.affected_geographies), 3),
                "persistence": scorer.persistence_score(row.persistence_days),
            }
        )
        assert result.score == int(row.composite_score)
        assert result.severity == row.severity
        scores.append(result.score)
    assert scores == [0, 24, 50, 74, 87]


# ---------------------------------------------------------------------------
# Components
# ---------------------------------------------------------------------------


def test_round_half_up_matches_math_round() -> None:
    assert scorer.round_half_up(12.5) == 13  # Python's round() gives 12
    assert scorer.round_half_up(84.5) == 85
    assert scorer.round_half_up(0.4999) == 0
    # A weighted sum that represents 12.5 but carries float noise still rounds up.
    assert scorer.round_half_up(12.499999999999998) == 13
    assert scorer.round_half_up(7.345, 2) == 7.35


@pytest.mark.parametrize(
    ("score", "severity"),
    [(0, "Low"), (19, "Low"), (20, "Watch"), (39, "Watch"), (40, "Moderate"), (64, "Moderate"),
     (65, "High"), (84, "High"), (85, "Critical"), (100, "Critical")],
)
def test_severity_bands(score: int, severity: str) -> None:
    assert scorer.severity_for(score) == severity


def test_volume_component() -> None:
    # 60 tests against a baseline of 48: (60 - 48) / 48 = +25 % -> 25 points.
    assert scorer.volume_change_percent(60, 48) == pytest.approx(25.0)
    assert scorer.volume_score(25.0) == 25.0
    assert scorer.volume_score(-10.0) == 0.0  # fewer tests are not a signal
    assert scorer.volume_score(140.0) == 100.0  # clamped


def test_positivity_component() -> None:
    # 8 % -> 15.5 %: +7.5 points of a 15-point range -> 50.
    assert scorer.positivity_score(7.5) == pytest.approx(50.0)
    assert scorer.positivity_score(-2.0) == 0.0
    assert scorer.positivity_score(20.0) == 100.0


def test_share_and_persistence_components() -> None:
    assert scorer.share_score(1, 3) == pytest.approx(100 / 3)
    assert scorer.share_score(2, 4) == 50.0  # the denominator is what participates
    assert scorer.share_score(0, 0) == 0.0
    assert scorer.persistence_score(2) == 50.0
    assert scorer.persistence_score(6) == 100.0


def test_composite_hand_calculated() -> None:
    """
    volume 25 x 0.25       = 6.25
    positivity 50 x 0.30   = 15.00
    facilities 33.33 x 0.20 = 6.667
    geography 50 x 0.15    = 7.50
    persistence 25 x 0.10  = 2.50
    total                  = 37.917 -> 38, Watch
    """
    result = scorer.composite(
        {"volume": 25.0, "positivity": 50.0, "facilities": 100 / 3, "geography": 50.0, "persistence": 25.0}
    )
    assert result.unrounded == pytest.approx(37.91667, abs=1e-4)
    assert (result.score, result.severity) == (38, "Watch")
    assert [c.points for c in result.components] == [6, 15, 7, 8, 3]
    assert [c.max_points for c in result.components] == [25, 30, 20, 15, 10]


def test_composite_requires_all_five_components() -> None:
    with pytest.raises(ValueError):
        scorer.composite({"volume": 10.0})


# ---------------------------------------------------------------------------
# Data Confidence
# ---------------------------------------------------------------------------


def quality(code: str, delays: tuple[float, ...], events: int, **overrides: int) -> FacilityQuality:
    values = dict(
        fields_populated=events * 2, fields_required=events * 2, lab_observations=events,
        mapped_observations=events, integrity_issues=0,
    )
    values.update(overrides)
    return FacilityQuality(code, delays, events, **values)


def test_data_confidence_hand_calculated() -> None:
    """
    Two of three facilities report.
      freshness: medians 20 and 5 min -> (100 - 15/115*100) = 86.957 and 100 -> mean 93.478
      completeness: 36 of 40 fields = 90
      terminology: 19 of 20 mapped = 95
      participation: 2 of 3 = 66.667
      integrity: 1 issue in 20 = 5 % -> 100 - 20 = 80
      score = 93.478*.30 + 90*.25 + 95*.20 + 66.667*.15 + 80*.10 = 87.543 -> 88, High
    """
    result = scorer.data_confidence(
        [
            quality("A", (10.0, 20.0, 30.0), 10, fields_populated=16, lab_observations=10, mapped_observations=10),
            quality("B", (5.0,), 10, fields_populated=20, lab_observations=10, mapped_observations=9, integrity_issues=1),
        ],
        facilities_total=3,
    )
    assert [round(c.score, 3) for c in result.components] == [93.478, 90.0, 95.0, 66.667, 80.0]
    assert (result.score, result.level) == (88, "High")
    assert "1 of 3 participating facility reported nothing" in result.explanation


def test_unknown_timeliness_is_not_assumed_good() -> None:
    result = scorer.data_confidence([quality("A", (), 5)], facilities_total=1)
    assert result.components[0].score == 0.0


def test_no_reporting_facility() -> None:
    result = scorer.data_confidence([], facilities_total=3)
    assert result.level == "Low"
    assert "Absence of data is not evidence" in result.explanation


# ---------------------------------------------------------------------------
# Baseline
# ---------------------------------------------------------------------------

CONFIG = EngineConfig()
D = date(2026, 1, 20)


def daily(values: dict[int, tuple[int, int]]) -> dict[date, Counts]:
    """{days before D: (tests, positives)} -> daily counts."""
    return {D - timedelta(days=ago): Counts(t, p, t - p) for ago, (t, p) in values.items()}


def test_baseline_is_the_mean_of_the_prior_window() -> None:
    """Days D-7..D-1 with 40..46 tests (sum 301, mean 43) and 3 positives each (21/301 = 6.977 %)."""
    baseline = baseline_for(daily({ago: (39 + ago, 3) for ago in range(1, 8)}), D, CONFIG)
    assert window_for(D, CONFIG) == (date(2026, 1, 13), date(2026, 1, 19))
    assert baseline.observed_days == 7
    assert baseline.mean_tests == pytest.approx(43.0)
    assert baseline.positivity == pytest.approx(21 / 301 * 100)


def test_baseline_never_reads_the_target_day_or_later() -> None:
    history = {ago: (40, 4) for ago in range(1, 8)}
    leak = daily({**history, 0: (500, 400), -1: (900, 800)})
    baseline = baseline_for(leak, D, CONFIG)
    assert baseline.mean_tests == 40.0
    assert baseline.positivity == 10.0


def test_days_without_data_are_left_out_not_counted_as_zero() -> None:
    baseline = baseline_for(daily({1: (40, 4), 2: (40, 4), 3: (0, 0), 4: (40, 4), 5: (40, 4), 6: (40, 4)}), D, CONFIG)
    assert baseline.observed_days == 5
    assert baseline.mean_tests == 40.0


def test_insufficient_history_produces_no_baseline() -> None:
    baseline = baseline_for(daily({1: (40, 4), 2: (40, 4), 3: (40, 4), 4: (40, 4)}), D, CONFIG)
    assert baseline.observed_days == 4
    assert not baseline.sufficient
    assert baseline.mean_tests is None and baseline.positivity is None
    assert baseline.as_dict()["status"] == "INSUFFICIENT_BASELINE"


def test_history_older_than_the_window_is_ignored() -> None:
    baseline = baseline_for(daily({8: (40, 4), 9: (40, 4), 10: (40, 4), 11: (40, 4), 12: (40, 4)}), D, CONFIG)
    assert baseline.observed_days == 0
    assert not baseline.sufficient


def test_indeterminate_results_do_not_count_towards_positivity() -> None:
    # 10 tests: 2 positive, 6 negative, 2 with a numeric/unsupported result -> 2 / 8 = 25 %.
    counts = Counts(tests=10, positive=2, negative=6)
    assert counts.indeterminate == 2
    assert counts.positivity() == 25.0
    assert Counts(tests=3).positivity() is None


def test_config_is_validated() -> None:
    with pytest.raises(ValueError):
        EngineConfig(baseline_window_days=7, min_baseline_days=8)
