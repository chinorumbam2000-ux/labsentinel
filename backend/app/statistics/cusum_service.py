"""
CUSUM over the dynamic surveillance series, and the three-method comparison.

Baseline: CUSUM deliberately takes its reference period, mean and SD from
EWMA's own reference routine (ewma.reference_for) with EWMA's reference
settings, so the two statistical detectors are judged against an identical
baseline by construction. Nothing here changes EWMA.

The Composite Outbreak Signal Score, EWMA and CUSUM are compared, never
combined: the agreement count describes how many methods signal. It is not a
score.
"""

from dataclasses import dataclass, field, replace
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import SurveillanceSignal
from app.statistics import cusum, ewma
from app.statistics.cusum import CusumConfig, CusumPoint, CusumState
from app.statistics.service import COMPOSITE_BANDS, _BAND_RANK, composite_signals, daily_series, dynamic_signals
from app.statistics.types import METRICS, AlertState, EwmaConfig, EwmaPoint, Metric, Reference
from app.surveillance.aggregator import observed_date_range
from app.surveillance.types import EngineConfig

#: EWMA's reference settings (28 days, >= 21 with data), shared on purpose.
REFERENCE_CONFIG = EwmaConfig()

SIGNAL_RULE = (
    "For comparison only: the Composite Outbreak Signal signals at High or Critical severity; EWMA "
    "signals when its overall state is STATISTICAL ALERT (either metric above its UCL); CUSUM signals "
    "when either metric's cumulative sum has reached the decision limit h. Each method's own logic is "
    "unchanged. The count is descriptive, not a score."
)


@dataclass
class CusumRun:
    syndrome: str
    config: CusumConfig
    first: date
    last: date
    references: dict[Metric, Reference] = field(default_factory=dict)
    points: dict[Metric, list[CusumPoint]] = field(default_factory=dict)
    #: Analysis only: the CUSUM run over the reference period against its own baseline.
    in_sample: dict[Metric, list[CusumPoint]] = field(default_factory=dict)

    @property
    def monitoring_from(self) -> date:
        return self.first + timedelta(days=REFERENCE_CONFIG.reference_days)


def calculate(session: Session, syndrome: str, config: CusumConfig) -> CusumRun | None:
    span = observed_date_range(session, syndrome, EngineConfig())
    if span is None:
        return None
    first, last = span
    series = daily_series(session, syndrome, first, last)
    result = CusumRun(syndrome, config, first, last)
    for metric in METRICS:
        reference = ewma.reference_for(series[metric], first, REFERENCE_CONFIG)
        result.references[metric] = reference
        result.points[metric] = cusum.run(metric, series[metric], reference, first, last, config)
        result.in_sample[metric] = cusum.in_sample(metric, series[metric], reference, config)
    return result


# ---------------------------------------------------------------------------
# Explanation
# ---------------------------------------------------------------------------


def explain(point: CusumPoint, reference: Reference) -> str:
    what = "positivity" if point.metric == "positivity" else "test-volume"
    if point.status == "REFERENCE_PERIOD":
        return f"Part of the historical reference period ({reference.first} to {reference.last}); not monitored."
    if point.status == "INSUFFICIENT_BASELINE":
        return (
            f"Not monitored: the reference period has {reference.days} days with data, "
            "too few to estimate a mean and standard deviation."
        )
    if point.status == "INSUFFICIENT_VARIANCE":
        return "Not monitored: the reference values do not vary, so no standardized deviation can be computed."
    if point.status == "NO_DATA":
        return "No eligible results this day; the cumulative sum is carried forward unchanged."
    if point.state == "STATISTICAL_ALERT":
        return (
            f"Recent {what} values have accumulated enough sustained upward deviation from the historical "
            "baseline to cross the CUSUM decision limit."
        )
    if point.value == 0:
        return f"No sustained upward deviation: the {what} cumulative sum is at zero."
    if point.approaching:
        return (
            f"The {what} cumulative sum is approaching the decision limit (an informational note, "
            "not an alarm)."
        )
    return f"Some upward deviation is accumulating in {what}, still below the decision limit."


# ---------------------------------------------------------------------------
# Three-method comparison
# ---------------------------------------------------------------------------


def three_method(
    composite: SurveillanceSignal | None, ewma_overall: AlertState | None, cusum_overall: CusumState | None
) -> dict:
    methods: dict[str, bool | None] = {
        "composite": None
        if composite is None or composite.calculation_status != "CALCULATED"
        else composite_signals(composite.severity),
        "ewma": None if ewma_overall is None else ewma_overall == "STATISTICAL_ALERT",
        "cusum": None if cusum_overall is None else cusum_overall == "STATISTICAL_ALERT",
    }
    available = [name for name, value in methods.items() if value is not None]
    signalling = [name for name in available if methods[name]]
    count = len(signalling)
    if not available:
        label = "NOT AVAILABLE"
    elif count == 0:
        label = "NO METHODS SIGNAL"
    elif len(available) == 3:
        label = f"{count} OF 3 METHODS SIGNAL"
    else:
        label = f"{count} OF {len(available)} AVAILABLE METHODS SIGNAL"
    names = {"composite": "the Composite Outbreak Signal", "ewma": "EWMA", "cusum": "CUSUM"}
    if not available:
        text = "No method has a result for this date."
    elif count == 0:
        text = "None of the available methods indicates abnormal activity."
    elif count == len(available):
        text = "Every available method independently indicates abnormal activity."
    else:
        quiet = [names[n] for n in available if not methods[n]]
        text = (
            f"{', '.join(names[n] for n in signalling)} {'signals' if count == 1 else 'signal'}; "
            f"{' and '.join(quiet)} {'does' if len(quiet) == 1 else 'do'} not."
        )
    return {"methods": methods, "signalling": count, "available": len(available), "label": label, "text": text}


# ---------------------------------------------------------------------------
# Detection timing, false alerts, sensitivity
# ---------------------------------------------------------------------------


def _first(days) -> date | None:
    days = list(days)
    return min(days) if days else None


def _iso(day: date | None) -> str | None:
    return None if day is None else day.isoformat()


def _lead(ours: date | None, theirs: date | None) -> int | None:
    """Positive: CUSUM first by that many days. Negative: after."""
    return None if ours is None or theirs is None else (theirs - ours).days


def cusum_first(run_points: dict[Metric, list[CusumPoint]], metric: Metric | None) -> date | None:
    metrics = METRICS if metric is None else (metric,)
    return _first(p.day for m in metrics for p in run_points[m] if p.state == "STATISTICAL_ALERT")


def detection_analysis(
    run: CusumRun,
    composite: dict[date, SurveillanceSignal],
    ewma_points: dict[Metric, list[EwmaPoint]] | None,
) -> dict:
    start = run.monitoring_from
    composite_first = {
        band: _first(
            day for day, s in composite.items()
            if day >= start and s.calculation_status == "CALCULATED" and _BAND_RANK[s.severity] >= _BAND_RANK[band]
        )
        for band in COMPOSITE_BANDS
    }
    ewma_first: dict[str, dict[str, date | None]] = {}
    if ewma_points:
        for metric in (*METRICS, None):
            ms = METRICS if metric is None else (metric,)
            ewma_first[metric or "overall"] = {
                "watch": _first(p.day for m in ms for p in ewma_points.get(m, []) if p.state in ("WATCH", "STATISTICAL_ALERT")),
                "alert": _first(p.day for m in ms for p in ewma_points.get(m, []) if p.state == "STATISTICAL_ALERT"),
            }
    cusum_dates = {
        "volume": cusum_first(run.points, "volume"),
        "positivity": cusum_first(run.points, "positivity"),
        "overall": cusum_first(run.points, None),
    }
    leads = {
        key: {
            "composite_high": _lead(day, composite_first["High"]),
            "composite_critical": _lead(day, composite_first["Critical"]),
            "ewma_alert": _lead(day, ewma_first.get(key, {}).get("alert")) if ewma_first else None,
        }
        for key, day in cusum_dates.items()
    }
    return {
        "evaluation_from": start.isoformat(),
        "evaluation_to": run.last.isoformat(),
        "composite_first": {band: _iso(day) for band, day in composite_first.items()},
        "ewma_first": {k: {lvl: _iso(d) for lvl, d in v.items()} for k, v in ewma_first.items()},
        "cusum_first": {k: _iso(d) for k, d in cusum_dates.items()},
        "lead_days": leads,
        "lead_note": (
            "Positive: CUSUM alerted that many days before the other method's level. Negative: after. "
            "EWMA is compared metric with metric (and overall with overall)."
        ),
        "reference_check": reference_check(run),
    }


def reference_check(run: CusumRun) -> dict:
    """In-sample alert days over the reference period (analysis only; optimistic by construction)."""
    return {
        metric: {
            "days": len([p for p in points if p.status == "CALCULATED"]),
            "alert_days": len([p for p in points if p.state == "STATISTICAL_ALERT"]),
            "max_cusum": None if not points else round(max((p.value or 0.0) for p in points), 4),
        }
        for metric, points in run.in_sample.items()
    }


def alerts_before(run: CusumRun, before: date) -> dict[str, int]:
    """Monitored alert days before ``before`` (e.g. the synthetic outbreak onset): false alerts."""
    return {
        metric: len([p for p in points if p.day < before and p.state == "STATISTICAL_ALERT"])
        for metric, points in run.points.items()
    }


def sensitivity(
    session: Session,
    syndrome: str,
    ks: tuple[float, ...],
    hs: tuple[float, ...],
    base: CusumConfig,
    onset: date | None = None,
) -> list[dict]:
    """DEVELOPMENT ANALYSIS ONLY (never persisted, never an alert)."""
    composite = dynamic_signals(session, syndrome)
    rows = []
    for k in ks:
        for h in hs:
            run = calculate(session, syndrome, replace(base, k=k, h=h))
            if run is None:
                continue
            volume, positivity = cusum_first(run.points, "volume"), cusum_first(run.points, "positivity")
            overall = cusum_first(run.points, None)
            high = _first(
                d for d, s in composite.items()
                if d >= run.monitoring_from and s.calculation_status == "CALCULATED" and s.severity in ("High", "Critical")
            )
            rows.append({
                "k": k,
                "h": h,
                "volume_alert": _iso(volume),
                "positivity_alert": _iso(positivity),
                "false_alerts_before_onset": alerts_before(run, onset) if onset else None,
                "reference_in_sample_alert_days": {m: v["alert_days"] for m, v in reference_check(run).items()},
                "overall_lead_vs_composite_high": _lead(overall, high),
            })
    return rows
