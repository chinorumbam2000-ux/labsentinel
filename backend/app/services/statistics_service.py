"""
Read access to stored EWMA results, for the API. Only dynamic EWMA rows are
read; the Composite Outbreak Signal Score is looked up for comparison and
never changed.
"""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import StatisticalSignal, SurveillanceSignal
from app.statistics import ewma, service
from app.statistics.persistence import EWMA_ROWS
from app.statistics.service import EwmaRun
from app.statistics.types import METRICS, EwmaConfig, EwmaPoint, Reference


def _float(value) -> float | None:
    return None if value is None else float(value)


def rows(
    session: Session,
    syndrome: str,
    metric: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[StatisticalSignal]:
    query = select(StatisticalSignal).where(*EWMA_ROWS, StatisticalSignal.syndrome == syndrome)
    if metric is not None:
        query = query.where(StatisticalSignal.metric == metric)
    if date_from is not None:
        query = query.where(StatisticalSignal.signal_date >= date_from)
    if date_to is not None:
        query = query.where(StatisticalSignal.signal_date <= date_to)
    return list(session.scalars(query.order_by(StatisticalSignal.signal_date, StatisticalSignal.metric)))


def latest_monitored_date(session: Session, syndrome: str) -> date | None:
    return session.scalar(
        select(func.max(StatisticalSignal.signal_date)).where(
            *EWMA_ROWS,
            StatisticalSignal.syndrome == syndrome,
            StatisticalSignal.calculation_status == "CALCULATED",
        )
    )


def reference_of(row: StatisticalSignal) -> Reference:
    ref = (row.calculation_metadata or {}).get("reference", {})
    return Reference(
        date.fromisoformat(ref["first"]),
        date.fromisoformat(ref["last"]),
        ref["days"],
        ref["mean"],
        ref["stddev"],
        ref["status"],
    )


def point_of(row: StatisticalSignal) -> EwmaPoint:
    metadata = row.calculation_metadata or {}
    return EwmaPoint(
        day=row.signal_date,
        metric=row.metric,  # type: ignore[arg-type]
        status=row.calculation_status,  # type: ignore[arg-type]
        observed=_float(row.observed_value),
        previous_ewma=_float(row.previous_ewma),
        ewma=_float(row.ewma_value),
        t=metadata.get("update", 0),
        ucl=_float(row.upper_control_limit),
        warning_limit=_float(row.warning_limit),
        asymptotic_ucl=metadata.get("asymptotic_ucl"),
        state=row.alert_state,  # type: ignore[arg-type]
    )


def to_read(row: StatisticalSignal) -> dict:
    metadata = row.calculation_metadata or {}
    reference = reference_of(row)
    point = point_of(row)
    return {
        "id": row.id,
        "method": row.method,
        "metric": row.metric,
        "signal_date": row.signal_date,
        "calculation_status": row.calculation_status,
        "observed_value": point.observed,
        "baseline_mean": _float(row.baseline_mean),
        "baseline_stddev": _float(row.baseline_stddev),
        "previous_ewma": point.previous_ewma,
        "ewma_value": point.ewma,
        "upper_control_limit": point.ucl,
        "warning_limit": point.warning_limit,
        "distance_to_ucl": metadata.get("distance_to_ucl"),
        "alert_state": row.alert_state,
        "lambda_value": float(row.lambda_value),
        "k_value": float(row.k_value),
        "update": point.t,
        "reference_first": reference.first,
        "reference_last": reference.last,
        "reference_days": reference.days,
        "explanation": service.explain(point, reference),
        "calculated_at": row.calculated_at,
        "calculation": metadata,
    }


def run_from_rows(syndrome: str, stored: list[StatisticalSignal]) -> EwmaRun | None:
    """Rebuild the stored series (for the detection analysis) without recomputing it."""
    if not stored:
        return None
    metadata = stored[0].calculation_metadata or {}
    config = metadata.get("config", {})
    run = EwmaRun(
        syndrome,
        EwmaConfig(
            lam=config.get("lambda", 0.25),
            k=config.get("k", 3.0),
            warning_fraction=config.get("warning_fraction", 2 / 3),
            reference_days=config.get("reference_days", 28),
            min_reference_days=config.get("min_reference_days", 21),
        ),
        min(r.signal_date for r in stored),
        max(r.signal_date for r in stored),
    )
    for metric in METRICS:
        mine = [r for r in stored if r.metric == metric]
        run.points[metric] = [point_of(r) for r in mine]
        if mine:
            run.references[metric] = reference_of(mine[0])
    return run


def composite_for(session: Session, syndrome: str, day: date) -> SurveillanceSignal | None:
    return session.scalar(
        select(SurveillanceSignal).where(
            SurveillanceSignal.mode == "dynamic",
            SurveillanceSignal.syndrome == syndrome,
            SurveillanceSignal.signal_date == day,
        )
    )


def day_view(session: Session, syndrome: str, day: date) -> dict | None:
    """Both metrics on one date, the overall state and the comparison with the composite."""
    stored = {r.metric: r for r in rows(session, syndrome, date_from=day, date_to=day)}
    if not stored:
        return None
    states = [stored[m].alert_state for m in METRICS if m in stored]
    overall = ewma.overall_state(states)
    monitored = [m for m in METRICS if m in stored and stored[m].alert_state is not None]
    composite = composite_for(session, syndrome, day)
    agreement = service.agreement(composite, overall)
    return {
        "syndrome": syndrome,
        "signal_date": day,
        "volume": to_read(stored["volume"]) if "volume" in stored else None,
        "positivity": to_read(stored["positivity"]) if "positivity" in stored else None,
        "overall_state": overall,
        "overall_basis": monitored,
        "composite": None
        if composite is None
        else {
            "signal_id": composite.id,
            "calculation_status": composite.calculation_status,
            "composite_score": _float(composite.composite_score),
            "severity": composite.severity,
        },
        "composite_signals": None
        if composite is None or composite.calculation_status != "CALCULATED"
        else service.composite_signals(composite.severity),
        "ewma_signals": None if overall is None else overall == "STATISTICAL_ALERT",
        "agreement": agreement,
        "agreement_text": service.AGREEMENT_TEXT[agreement],
    }
