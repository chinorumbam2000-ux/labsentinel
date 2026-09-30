"""
The capstone evaluation framework: scenarios, ground truth, generation,
detector execution (on throwaway SQLite databases), metrics, aggregation,
reports and the read-only API. Small repetition counts only; no network.
"""

import json
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.evaluation import comparison, generator, metrics, reports
from app.evaluation.database import Workspace
from app.evaluation.run import run as run_evaluation
from app.evaluation.runner import run_realization
from app.evaluation.scenarios import BY_ID, END, MONITORING_START, ONSET, SCENARIOS, START, ground_truth
from app.evaluation.types import DayRecord, GroundTruth, RealizationResult
from app.main import create_app

SEED = 20260930


@pytest.fixture(scope="module")
def workspace() -> Iterator[Workspace]:
    ws = Workspace()
    yield ws
    ws.close()


def realize(workspace: Workspace, scenario_id: str, repetition: int = 0) -> RealizationResult:
    return run_realization(BY_ID[scenario_id], repetition, SEED, workspace.fresh(f"{scenario_id}-{repetition}"))


# ---------------------------------------------------------------------------
# Scenarios and ground truth
# ---------------------------------------------------------------------------


def test_scenarios_and_ground_truth() -> None:
    ids = [s.id for s in SCENARIOS]
    assert len(ids) == len(set(ids)) == 15
    assert [s.number for s in SCENARIOS if s.group == "primary"] == list(range(1, 14))
    assert (MONITORING_START - START).days == 28 and (END - MONITORING_START).days == 41
    assert ONSET == date(2024, 4, 19)
    no_outbreak = {s.id for s in SCENARIOS if not s.outbreak_present}
    assert no_outbreak == {"S01-control", "S05-volume-only", "S08-transient-spike", "S12-small-count"}
    for s in SCENARIOS:
        truth = ground_truth(s)
        if s.outbreak_present:
            assert (truth.true_outbreak_start, truth.true_outbreak_end) == (ONSET, END)
            assert truth.true_affected_facilities and len(truth.true_affected_geographies) == len(truth.true_affected_facilities)
        else:
            assert truth.true_outbreak_start is None and truth.true_affected_facilities == ()
    assert ground_truth(BY_ID["S06-single-facility"]).true_affected_geographies == ("E-001",)
    # The calendar never touches the frozen Nov 3-7 2025 demonstration.
    assert END < date(2025, 11, 3)


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


def test_generation_is_reproducible_and_seed_dependent() -> None:
    a, _ = generator.generate(BY_ID["S03-gradual"], 3, SEED)
    b, _ = generator.generate(BY_ID["S03-gradual"], 3, SEED)
    c, _ = generator.generate(BY_ID["S03-gradual"], 4, SEED)
    assert a == b
    assert a != c


def test_common_random_numbers_pair_a_scenario_with_its_variant() -> None:
    clean, clean_draws = generator.generate(BY_ID["S13-moderate"], 0, SEED)
    gap, gap_draws = generator.generate(BY_ID["S09-reporting-gap"], 0, SEED)
    assert clean_draws == gap_draws  # identical underlying draws
    gap_days = {ONSET + timedelta(days=d) for d in range(5)}
    missing = [r for r in clean if r["facility_code"] == "EVAL-B" and r["effective_datetime"].astimezone(generator.ZONE).date() in gap_days]
    assert missing and len(clean) - len(gap) == len(missing)
    assert not [r for r in gap if r["facility_code"] == "EVAL-B" and r["effective_datetime"].astimezone(generator.ZONE).date() in gap_days]


def test_data_quality_conditions_are_generated() -> None:
    delayed, _ = generator.generate(BY_ID["S10-delayed-data"], 0, SEED)
    late = [r for r in delayed if r["effective_datetime"].astimezone(generator.ZONE).date() >= ONSET - timedelta(days=7)]
    lags = {(r["received_datetime"] - r["effective_datetime"]).days for r in late}
    assert lags == {1, 2, 3}
    terms, _ = generator.generate(BY_ID["S11-terminology"], 0, SEED)
    after = [r for r in terms if r["effective_datetime"].astimezone(generator.ZONE).date() >= ONSET - timedelta(days=7)]
    before = [r for r in terms if r not in after]
    unmapped = [r for r in after if r["terminology_status"] == "unmapped"]
    assert {r["facility_code"] for r in unmapped} == {"EVAL-A", "EVAL-B"}
    assert 0.35 < len(unmapped) / len([r for r in after if r["facility_code"] != "EVAL-C"]) < 0.65
    assert all(r["terminology_status"] == "mapped" and r["specimen_type"] for r in before)
    assert 0.15 < sum(r["specimen_type"] is None for r in after) / len(after) < 0.35
    assert all(r["syndrome"] is None for r in unmapped)


def test_small_count_environment() -> None:
    small, _ = generator.generate(BY_ID["S12-small-count"], 0, SEED)
    standard, _ = generator.generate(BY_ID["S01-control"], 0, SEED)
    assert len(small) < len(standard) / 3


# ---------------------------------------------------------------------------
# Detector execution
# ---------------------------------------------------------------------------


def test_detectors_run_unchanged_on_a_realization(workspace: Workspace) -> None:
    result = realize(workspace, "S02-sudden")
    assert len(result.days) == 42 and result.days[0].day == MONITORING_START
    assert [d.truth for d in result.days].count("outbreak") == 21
    assert {d.composite_status for d in result.days} == {"CALCULATED"}
    for detector in ("composite", "ewma", "cusum"):
        out = metrics.outcome(result, detector)
        assert out.detected and 0 <= out.delay <= 2, (detector, out.delay)
    assert all(d.data_confidence is not None for d in result.days)


def test_as_of_replay_for_delayed_data(workspace: Workspace) -> None:
    result = realize(workspace, "S10-delayed-data")
    assert set(result.as_of_detection) == {"composite", "ewma", "cusum"}
    for detector, seen in result.as_of_detection.items():
        retrospective = metrics.outcome(result, detector).retrospective_detection_date
        if seen and retrospective:
            assert seen >= retrospective  # real time never sees an alert before the data exist
    delayed_confidence = [d.data_confidence for d in result.days if d.day >= ONSET]
    assert max(delayed_confidence) < 80  # reporting delay lowers freshness


# ---------------------------------------------------------------------------
# Metrics (hand-worked)
# ---------------------------------------------------------------------------


def test_wilson_interval() -> None:
    # 5/10: centre (0.5 + 1.920729/10)/1.384146 = 0.5, half 0.2634 -> 0.2366-0.7634
    low, high = metrics.wilson(5, 10)
    assert (round(low, 4), round(high, 4)) == (0.2366, 0.7634)
    assert metrics.wilson(0, 0) is None
    low, high = metrics.wilson(0, 20)
    assert low == 0.0 and round(high, 4) == 0.1611


def test_confusion_metrics() -> None:
    c = metrics.confusion(tp=8, fp=2, tn=18, fn=2)
    assert (c["sensitivity"]["value"], c["specificity"]["value"], c["precision"]["value"]) == (0.8, 0.9, 0.8)
    assert (c["npv"]["value"], c["false_positive_rate"]["value"], c["false_negative_rate"]["value"]) == (0.9, 0.1, 0.2)
    assert c["sensitivity"]["numerator"] == 8 and c["sensitivity"]["denominator"] == 10


def fake(states: list[bool], outbreak_from: int | None, as_of: date | None = None) -> RealizationResult:
    """A realization whose composite is High on the given days; others quiet."""
    days = [
        DayRecord(
            day=MONITORING_START + timedelta(days=i),
            truth="outbreak" if outbreak_from is not None and i >= outbreak_from else "normal",
            volume=48, positivity=8.0, composite_status="CALCULATED", composite_score=70.0 if s else 0.0,
            composite_severity="High" if s else "Low", affected_facilities=0, data_confidence=95.0,
            ewma_volume="NORMAL", ewma_positivity="NORMAL", ewma_overall="NORMAL",
            cusum_volume="NORMAL", cusum_positivity="NORMAL", cusum_overall="NORMAL",
        )
        for i, s in enumerate(states)
    ]
    start = None if outbreak_from is None else MONITORING_START + timedelta(days=outbreak_from)
    truth = GroundTruth("X", outbreak_from is not None, start, END if start else None, (), (), "")
    result = RealizationResult("X", 0, SEED, truth, days)
    if as_of:
        result.as_of_detection = {"composite": as_of, "ewma": None, "cusum": None}
    return result


def test_outcome_detection_delay_burden_and_stability() -> None:
    # 10 days, outbreak from day 6; false alerts on days 1-2 and 4; alerts from day 8.
    states = [False, True, True, False, True, False, False, False, True, True]
    out = metrics.outcome(fake(states, 6), "composite")
    assert (out.detected, out.delay) == (True, 2)
    assert (out.normal_days, out.normal_alert_days, out.outbreak_days, out.outbreak_alert_days) == (6, 3, 4, 2)
    assert (out.false_episodes, out.false_episode_lengths) == (2, [2, 1])
    assert out.normal_transitions == 4  # F->T, T->F, F->T, T->F among days 0-5
    assert out.alert_episodes == 3
    # Real-time (as-of) detection replaces the retrospective date for timeliness.
    delayed = metrics.outcome(fake(states, 6, as_of=MONITORING_START + timedelta(days=9)), "composite")
    assert (delayed.delay, delayed.retrospective_detection_date) == (3, MONITORING_START + timedelta(days=8))


def test_summarize_realization_and_day_level() -> None:
    results = [fake([False] * 4 + [True] * 4, 4), fake([False] * 8, 4), fake([False, True] + [False] * 6, None),
               fake([False] * 8, None)]
    s = metrics.summarize(results, "composite")
    r = s["realization_level"]
    assert (r["tp"], r["fn"], r["fp"], r["tn"]) == (1, 1, 1, 1)
    d = s["day_level"]
    assert (d["tp"], d["fn"], d["fp"], d["tn"]) == (4, 4, 1, 23)
    assert s["detection_delay_days"]["median"] == 0
    assert s["burden"]["false_alert_days_per_100_normal_days"] == round(100 / 24, 3)


def test_lead_lag() -> None:
    a = fake([False] * 4 + [True] * 4, 4)
    for day in a.days[5:]:
        day.ewma_overall = "STATISTICAL_ALERT"  # EWMA one day after the composite
    ll = comparison.lead_lag([a])["composite_vs_ewma"]
    assert (ll["both_detected"], ll["composite_earlier"], ll["days_b_minus_a"]["median"]) == (1, 1, 1)
    assert comparison.lead_lag([a])["composite_vs_cusum"]["only_composite"] == 1


# ---------------------------------------------------------------------------
# Aggregation, reproducibility, reports, API
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def small_summary() -> dict:
    return run_evaluation(["S01-control", "S13-moderate", "C1-coverage-1of3"], repetitions=2, seed=SEED, workers=1)


def test_repeated_run_aggregation(small_summary: dict) -> None:
    by_id = {s["id"]: s for s in small_summary["scenarios"]}
    assert all(s["realizations"] == 2 for s in by_id.values())
    moderate = by_id["S13-moderate"]["detectors"]["ewma"]["realization_level"]
    assert moderate["tp"] + moderate["fn"] == 2
    control = by_id["S01-control"]["detectors"]["cusum"]["realization_level"]
    assert control["tp"] + control["fn"] == 0 and control["tn"] + control["fp"] == 2
    overall = small_summary["overall"]["detectors"]["composite"]["realization_level"]
    assert overall["tp"] + overall["fn"] + overall["fp"] + overall["tn"] == 4  # coverage variants are not pooled
    assert [row["scenario"] for row in small_summary["coverage"]] == ["S13-moderate", "C1-coverage-1of3"]
    assert len(small_summary["sensitivity"]["cusum_k_h"]["pooled"]) == 9
    assert [r["cutoff"] for r in small_summary["sensitivity"]["composite_cutoffs"]["pooled"]] == ["Watch", "Moderate", "High", "Critical"]
    timeline = by_id["S13-moderate"]["representative"]["timeline"]
    assert len(timeline) == 42 and {"truth", "composite_severity", "ewma_overall", "cusum_overall"} <= set(timeline[0])


def test_same_seed_reproduces_identical_results(small_summary: dict) -> None:
    again = run_evaluation(["S01-control", "S13-moderate", "C1-coverage-1of3"], repetitions=2, seed=SEED, workers=1)
    assert json.dumps(again, sort_keys=True) == json.dumps(small_summary, sort_keys=True)


def test_report_artifacts(small_summary: dict, tmp_path: Path) -> None:
    paths = reports.write(small_summary, tmp_path)
    report = paths["markdown"].read_text(encoding="utf-8")
    assert "do not establish clinical or epidemiological validation" in report
    assert "No method is declared best" in report and "## Threats to validity" in report
    rows = paths["csv"].read_text(encoding="utf-8").strip().splitlines()
    assert len(rows) == 1 + 3 * 3 and rows[0].startswith("scenario,name,outbreak_present")
    assert json.loads(paths["json"].read_text(encoding="utf-8"))["seed"] == SEED
    assert "FHIR-PT" not in paths["json"].read_text(encoding="utf-8")


def test_evaluation_api_is_read_only_and_development_only(small_summary: dict, tmp_path: Path,
                                                          monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EVALUATION_RESULTS_DIR", str(tmp_path / "missing"))
    with TestClient(create_app()) as client:
        assert client.get("/api/evaluation/summary").status_code == 404  # nothing run yet
    reports.write(small_summary, tmp_path)
    monkeypatch.setenv("EVALUATION_RESULTS_DIR", str(tmp_path))
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        summary = client.get("/api/evaluation/summary").json()
        assert summary["seed"] == SEED and "representative" not in summary["scenarios"][0]
        assert [s["id"] for s in client.get("/api/evaluation/scenarios").json()][0] == "S01-control"
        detail = client.get("/api/evaluation/scenarios/S13-moderate").json()
        assert len(detail["representative"]["timeline"]) == 42
        assert client.get("/api/evaluation/scenarios/S99").status_code == 404
        assert client.post("/api/evaluation/summary").status_code == 405
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        assert client.get("/api/evaluation/summary").status_code == 404
