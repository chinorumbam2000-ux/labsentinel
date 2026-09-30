"""
EWMA over the dynamic surveillance series, and its comparison with the
Composite Outbreak Signal Score.

The series come from the dynamic surveillance engine's own aggregation
(app/surveillance/aggregator.py), with the same eligibility rules:
persisted observations -> daily regional counts -> EWMA. Nothing is read
from the browser, and the Composite Outbreak Signal Score is only read,
never changed.
"""

from dataclasses import dataclass, field, replace
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SurveillanceSignal
from app.statistics import ewma
from app.statistics.types import (
    METRIC_LABEL,
    METRICS,
    Agreement,
    AlertState,
    EwmaConfig,
    EwmaPoint,
    Metric,
    Reference,
)
from app.surveillance.aggregator import aggregate, observed_date_range
from app.surveillance.types import EngineConfig

#: The composite "signals" at High or Critical, as EWMA "signals" only above
#: its UCL: each method's own alert level. Watch/Moderate and WATCH are early
#: warnings, shown but not counted as a signal.
COMPOSITE_SIGNAL_SEVERITIES = ("High", "Critical")
COMPOSITE_BANDS = ("Watch", "Moderate", "High", "Critical")
_BAND_RANK = {band: rank for rank, band in enumerate(("Low", *COMPOSITE_BANDS))}

AGREEMENT_TEXT: dict[Agreement, str] = {
    "BOTH_METHODS_SIGNAL": (
        "LabSentinel's rule-based signal and EWMA independently indicate abnormal activity."
    ),
    "COMPOSITE_ONLY": (
        "The multi-factor LabSentinel score is elevated, while the EWMA time-series detector has "
        "not crossed its control limit."
    ),
    "EWMA_ONLY": (
        "EWMA detected a sustained statistical shift before the Composite Outbreak Signal reached "
        "a high severity."
    ),
    "NEITHER": "Neither the Composite Outbreak Signal nor EWMA indicates abnormal activity.",
    "NOT_AVAILABLE": (
        "A comparison is not available for this date: one of the two methods has no result."
    ),
}
AGREEMENT_RULE = (
    "The Composite Outbreak Signal signals at High or Critical severity; EWMA signals when either "
    "metric's EWMA is above its upper control limit. The agreement only describes whether the two "
    "methods concur. It is not a score."
)


def daily_series(
    session: Session, syndrome: str, first: date, last: date
) -> dict[Metric, dict[date, float | None]]:
    """Daily regional test volume and positivity (percent), None on days without results."""
    regional = aggregate(session, syndrome, first, last, EngineConfig()).regional_daily()
    volume: dict[date, float | None] = {}
    positivity: dict[date, float | None] = {}
    day = first
    while day <= last:
        counts = regional.get(day)
        volume[day] = float(counts.tests) if counts and counts.tests > 0 else None
        rate = counts.positivity() if counts else None
        positivity[day] = rate
        day += timedelta(days=1)
    return {"volume": volume, "positivity": positivity}


@dataclass
class EwmaRun:
    syndrome: str
    config: EwmaConfig
    first: date
    last: date
    references: dict[Metric, Reference] = field(default_factory=dict)
    points: dict[Metric, list[EwmaPoint]] = field(default_factory=dict)

    @property
    def monitoring_from(self) -> date:
        return self.first + timedelta(days=self.config.reference_days)

    def point(self, metric: Metric, day: date) -> EwmaPoint | None:
        return next((p for p in self.points[metric] if p.day == day), None)


def calculate(session: Session, syndrome: str, config: EwmaConfig) -> EwmaRun | None:
    """EWMA for both metrics over every date with eligible history. None when there is none."""
    span = observed_date_range(session, syndrome, EngineConfig())
    if span is None:
        return None
    first, last = span
    series = daily_series(session, syndrome, first, last)
    result = EwmaRun(syndrome, config, first, last)
    for metric in METRICS:
        reference, points = ewma.run(metric, series[metric], first, last, config)
        result.references[metric] = reference
        result.points[metric] = points
    return result


# ---------------------------------------------------------------------------
# Explanation and agreement
# ---------------------------------------------------------------------------


def _value(metric: Metric, value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:.1f}%" if metric == "positivity" else f"{value:.1f} tests"


def explain(point: EwmaPoint, reference: Reference) -> str:
    """Plain-language interpretation of one day's result."""
    what = "positivity" if point.metric == "positivity" else "test-volume"
    if point.status == "REFERENCE_PERIOD":
        return f"Part of the historical reference period ({reference.first} to {reference.last}); not monitored."
    if point.status == "INSUFFICIENT_BASELINE":
        return (
            f"Not monitored: the reference period has {reference.days} days with data, "
            "too few to estimate a mean and standard deviation."
        )
    if point.status == "INSUFFICIENT_VARIANCE":
        return "Not monitored: the reference values do not vary, so no control limit can be set."
    if point.status == "NO_DATA":
        return "No eligible results this day; the EWMA is carried forward unchanged."
    if point.state == "STATISTICAL_ALERT":
        return f"The exponentially weighted {what} signal exceeded its historical control limit."
    if point.state == "WATCH":
        return (
            f"The exponentially weighted {what} signal is above its warning limit and approaching "
            "its historical control limit."
        )
    return f"The exponentially weighted {what} signal is within its historical control limits."


def composite_signals(severity: str | None) -> bool:
    return severity in COMPOSITE_SIGNAL_SEVERITIES


def agreement(composite: SurveillanceSignal | None, overall: AlertState | None) -> Agreement:
    if composite is None or composite.calculation_status != "CALCULATED" or overall is None:
        return "NOT_AVAILABLE"
    by_composite = composite_signals(composite.severity)
    by_ewma = overall == "STATISTICAL_ALERT"
    if by_composite and by_ewma:
        return "BOTH_METHODS_SIGNAL"
    if by_composite:
        return "COMPOSITE_ONLY"
    if by_ewma:
        return "EWMA_ONLY"
    return "NEITHER"


# ---------------------------------------------------------------------------
# Early detection analysis
# ---------------------------------------------------------------------------


def dynamic_signals(session: Session, syndrome: str) -> dict[date, SurveillanceSignal]:
    rows = session.scalars(
        select(SurveillanceSignal).where(
            SurveillanceSignal.mode == "dynamic", SurveillanceSignal.syndrome == syndrome
        )
    )
    return {s.signal_date: s for s in rows}


def _first(days: list[date]) -> date | None:
    return min(days) if days else None


def detection_analysis(run: EwmaRun, composite: dict[date, SurveillanceSignal]) -> dict:
    """
    First dates, within the EWMA monitoring period, on which each method
    reaches each level, and EWMA's lead (+) or lag (-) in days against each
    composite band. Only dates both methods could assess are compared.
    """
    start = run.monitoring_from
    composite_first: dict[str, date | None] = {}
    for band in COMPOSITE_BANDS:
        composite_first[band] = _first([
            day for day, s in composite.items()
            if day >= start and s.calculation_status == "CALCULATED" and _BAND_RANK[s.severity] >= _BAND_RANK[band]
        ])

    def first_state(metric: Metric | None, level: AlertState) -> date | None:
        metrics = METRICS if metric is None else (metric,)
        wanted = ("WATCH", "STATISTICAL_ALERT") if level == "WATCH" else ("STATISTICAL_ALERT",)
        return _first([p.day for m in metrics for p in run.points[m] if p.state in wanted])

    ewma_first = {
        "volume": {"watch": first_state("volume", "WATCH"), "alert": first_state("volume", "STATISTICAL_ALERT")},
        "positivity": {
            "watch": first_state("positivity", "WATCH"),
            "alert": first_state("positivity", "STATISTICAL_ALERT"),
        },
        "overall": {"watch": first_state(None, "WATCH"), "alert": first_state(None, "STATISTICAL_ALERT")},
    }

    def lead(ewma_day: date | None, composite_day: date | None) -> int | None:
        return None if ewma_day is None or composite_day is None else (composite_day - ewma_day).days

    leads = {
        f"{metric}_{level}": {band: lead(ewma_first[metric][level], composite_first[band]) for band in COMPOSITE_BANDS}
        for metric in ("volume", "positivity", "overall")
        for level in ("watch", "alert")
    }
    return {
        "evaluation_from": start.isoformat(),
        "evaluation_to": run.last.isoformat(),
        "composite_first": {band: _iso(day) for band, day in composite_first.items()},
        "ewma_first": {m: {lvl: _iso(day) for lvl, day in levels.items()} for m, levels in ewma_first.items()},
        "lead_days": leads,
        "lead_note": "Positive: EWMA reached its level that many days before the composite band. Negative: after.",
    }


def _iso(day: date | None) -> str | None:
    return None if day is None else day.isoformat()


def stability(points: list[EwmaPoint], before: date | None = None) -> dict:
    """How often the state changed, and how many days signalled before ``before`` (e.g. a known onset)."""
    monitored = [p for p in points if p.state is not None]
    changes = sum(1 for a, b in zip(monitored, monitored[1:]) if a.state != b.state)
    early = [p for p in monitored if before is not None and p.day < before and p.state != "NORMAL"]
    return {"state_changes": changes, "non_normal_days_before": len(early) if before else None}


def sensitivity(
    session: Session, syndrome: str, lambdas: tuple[float, ...], base: EwmaConfig, onset: date | None = None
) -> list[dict]:
    """
    DEVELOPMENT ANALYSIS ONLY (never persisted, never an alert): how the
    choice of lambda moves detection timing and stability.
    """
    composite = dynamic_signals(session, syndrome)
    rows = []
    for lam in lambdas:
        run = calculate(session, syndrome, replace(base, lam=lam))
        if run is None:
            continue
        analysis = detection_analysis(run, composite)
        rows.append({
            "lambda": lam,
            "volume_watch": analysis["ewma_first"]["volume"]["watch"],
            "volume_alert": analysis["ewma_first"]["volume"]["alert"],
            "positivity_watch": analysis["ewma_first"]["positivity"]["watch"],
            "positivity_alert": analysis["ewma_first"]["positivity"]["alert"],
            "overall_alert_lead_vs_high": analysis["lead_days"]["overall_alert"]["High"],
            "volume_stability": stability(run.points["volume"], onset),
            "positivity_stability": stability(run.points["positivity"], onset),
        })
    return rows


def metric_label(metric: Metric) -> str:
    return METRIC_LABEL[metric]
