"""
Comparisons between detectors and between scenarios, and the SECONDARY
analyses (parameter and composite-cutoff sensitivity).

The primary evaluation always uses the application's default parameters
(composite bands; EWMA lambda 0.25, k 3; CUSUM k 0.5, h 5). The secondary
analyses recompute EWMA and CUSUM from each realization's stored daily
series with other parameters, using the same pure functions. They are
explanatory only: nothing is persisted, and the defaults are not changed.
"""

import statistics
from dataclasses import replace
from datetime import date

from app.evaluation.metrics import SEVERITY_RANK, distribution, outcome, proportion
from app.evaluation.scenarios import END, MONITORING_START, ONSET, START
from app.evaluation.types import DETECTORS, RealizationResult
from app.statistics import cusum, ewma
from app.statistics.cusum import CusumConfig
from app.statistics.types import EwmaConfig

PAIRS = (("composite", "ewma"), ("composite", "cusum"), ("ewma", "cusum"))
EWMA_LAMBDAS = (0.15, 0.20, 0.25, 0.30)
CUSUM_GRID = tuple((k, h) for k in (0.25, 0.5, 0.75) for h in (4.0, 5.0, 6.0))
COMPOSITE_CUTOFFS = ("Watch", "Moderate", "High", "Critical")


def lead_lag(results: list[RealizationResult]) -> dict:
    """For each pair (a, b): b's detection date minus a's, over realizations where both detect."""
    out = {}
    for a, b in PAIRS:
        diffs, only_a, only_b = [], 0, 0
        for r in results:
            da, db = outcome(r, a).detection_date, outcome(r, b).detection_date
            if da and db:
                diffs.append((db - da).days)
            elif da:
                only_a += 1
            elif db:
                only_b += 1
        out[f"{a}_vs_{b}"] = {
            "both_detected": len(diffs),
            f"{a}_earlier": sum(d > 0 for d in diffs),
            f"{b}_earlier": sum(d < 0 for d in diffs),
            "same_day": sum(d == 0 for d in diffs),
            f"only_{a}": only_a,
            f"only_{b}": only_b,
            "days_b_minus_a": distribution(diffs),
            "note": f"Positive: {a} detected first by that many days; negative: {b} first.",
        }
    return out


# ---------------------------------------------------------------------------
# Secondary: parameter sensitivity and composite cutoffs
# ---------------------------------------------------------------------------


def _states_by_day(points_by_metric: dict[str, list]) -> dict[date, bool]:
    alerts: dict[date, bool] = {}
    for points in points_by_metric.values():
        for p in points:
            if MONITORING_START <= p.day <= END:
                alerts[p.day] = alerts.get(p.day, False) or p.state == "STATISTICAL_ALERT"
    return alerts


def _evaluate_alerts(result: RealizationResult, alerts: dict[date, bool]) -> tuple[date | None, int, int]:
    outbreak = result.truth.outbreak_present
    detection = next((d for d in sorted(alerts) if alerts[d] and outbreak and d >= ONSET), None)
    normal = [d for d in alerts if not (outbreak and d >= ONSET)]
    return detection, sum(alerts[d] for d in normal), len(normal)


def _summary(rows: list[tuple[bool, date | None, int, int]]) -> dict:
    outbreak = [r for r in rows if r[0]]
    control = [r for r in rows if not r[0]]
    delays = [(r[1] - ONSET).days for r in outbreak if r[1] is not None]
    normal_days = sum(r[3] for r in rows)
    false_days = sum(r[2] for r in rows)
    return {
        "detected": proportion(len(delays), len(outbreak)),
        "delay_days": distribution(delays),
        "false_alert_realizations": proportion(sum(r[2] > 0 for r in control), len(control)),
        "false_alert_days_per_100_normal_days": None if normal_days == 0 else round(100 * false_days / normal_days, 3),
    }


def ewma_sensitivity(results: list[RealizationResult]) -> list[dict]:
    rows = []
    for lam in EWMA_LAMBDAS:
        config = replace(EwmaConfig(), lam=lam)
        evaluated = []
        for r in results:
            points = {m: ewma.run(m, r.series[m], START, END, config)[1] for m in ("volume", "positivity")}
            detection, false_days, normal_days = _evaluate_alerts(r, _states_by_day(points))
            evaluated.append((r.truth.outbreak_present, detection, false_days, normal_days))
        rows.append({"lambda": lam, "default": lam == EwmaConfig().lam, **_summary(evaluated)})
    return rows


def cusum_sensitivity(results: list[RealizationResult]) -> list[dict]:
    rows = []
    references = [
        {m: ewma.reference_for(r.series[m], START, EwmaConfig()) for m in ("volume", "positivity")} for r in results
    ]
    for k, h in CUSUM_GRID:
        config = replace(CusumConfig(), k=k, h=h)
        evaluated = []
        for r, refs in zip(results, references):
            points = {m: cusum.run(m, r.series[m], refs[m], START, END, config) for m in ("volume", "positivity")}
            detection, false_days, normal_days = _evaluate_alerts(r, _states_by_day(points))
            evaluated.append((r.truth.outbreak_present, detection, false_days, normal_days))
        rows.append({"k": k, "h": h, "default": (k, h) == (CusumConfig().k, CusumConfig().h), **_summary(evaluated)})
    return rows


def composite_cutoffs(results: list[RealizationResult]) -> list[dict]:
    """Exploratory: the composite 'detects' at other severity cutoffs. The application's bands are unchanged."""
    rows = []
    for cutoff in COMPOSITE_CUTOFFS:
        rank = SEVERITY_RANK[cutoff]
        evaluated = []
        for r in results:
            alerts = {d.day: SEVERITY_RANK.get(d.composite_severity or "", -1) >= rank for d in r.days}
            detection, false_days, normal_days = _evaluate_alerts(r, alerts)
            evaluated.append((r.truth.outbreak_present, detection, false_days, normal_days))
        rows.append({"cutoff": cutoff, "default": cutoff == "High", **_summary(evaluated)})
    return rows


# ---------------------------------------------------------------------------
# Robustness and coverage (against a clean comparator scenario)
# ---------------------------------------------------------------------------


def condition_row(scenario_id: str, summary: dict) -> dict:
    """The robustness columns for one scenario summary (see reports.scenario_summary)."""
    detectors = summary["detectors"]
    return {
        "scenario": scenario_id,
        "conditions": summary["conditions"],
        **{
            detector: {
                "detected": detectors[detector]["realization_level"]["sensitivity"],
                "median_delay": detectors[detector]["detection_delay_days"]["median"],
                "false_alert_days_per_100_normal_days": detectors[detector]["burden"]["false_alert_days_per_100_normal_days"],
            }
            for detector in DETECTORS
        },
        "data_confidence_normal_mean": summary["data_confidence"]["normal_days"]["mean"],
        "data_confidence_outbreak_mean": summary["data_confidence"]["outbreak_days"]["mean"],
        "data_confidence_outbreak_min": summary["data_confidence"]["outbreak_days"]["min"],
        "outbreak_composite_score_mean": summary["data_confidence"]["outbreak_composite_score_mean"],
    }


def mean_or_none(values: list[float]) -> float | None:
    return None if not values else round(statistics.fmean(values), 3)
