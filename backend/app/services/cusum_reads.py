"""
Read access to stored CUSUM results and the three-method comparison, for the
API. Only CUSUM rows are read here; EWMA rows are read through
statistics_service; the Composite Outbreak Signal Score is looked up, never
changed.
"""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import StatisticalSignal
from app.services import statistics_service as ewma_reads
from app.statistics import cusum, cusum_service
from app.statistics.cusum import CusumConfig, CusumPoint
from app.statistics.cusum_persistence import CUSUM_ROWS
from app.statistics.cusum_service import CusumRun
from app.statistics.types import METRICS


def _float(value) -> float | None:
    return None if value is None else float(value)


def rows(
    session: Session,
    syndrome: str,
    metric: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[StatisticalSignal]:
    query = select(StatisticalSignal).where(*CUSUM_ROWS, StatisticalSignal.syndrome == syndrome)
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
            *CUSUM_ROWS, StatisticalSignal.syndrome == syndrome, StatisticalSignal.calculation_status == "CALCULATED"
        )
    )


def config_of(row: StatisticalSignal) -> CusumConfig:
    config = (row.calculation_metadata or {}).get("config", {})
    return CusumConfig(**config) if config else CusumConfig()


def point_of(row: StatisticalSignal) -> CusumPoint:
    metadata = row.calculation_metadata or {}
    config = config_of(row)
    return CusumPoint(
        day=row.signal_date,
        metric=row.metric,  # type: ignore[arg-type]
        status=row.calculation_status,  # type: ignore[arg-type]
        observed=_float(row.observed_value),
        z=_float(row.z_score),
        previous=_float(row.previous_cusum),
        value=_float(row.cusum_value),
        t=metadata.get("update", 0),
        state=row.alert_state,  # type: ignore[arg-type]
        k=_float(row.cusum_k),
        h=_float(row.cusum_h),
        approaching_fraction=config.approaching_fraction,
    )


def to_read(row: StatisticalSignal) -> dict:
    metadata = row.calculation_metadata or {}
    reference = ewma_reads.reference_of(row)
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
        "z_score": point.z,
        "increment": metadata.get("increment"),
        "previous_cusum": point.previous,
        "cusum_value": point.value,
        "k": _float(row.cusum_k),
        "h": _float(row.cusum_h),
        "distance_to_limit": metadata.get("distance_to_limit"),
        "alert_state": row.alert_state,
        "approaching_limit": bool(metadata.get("approaching_limit")),
        "update": point.t,
        "reference_first": reference.first,
        "reference_last": reference.last,
        "reference_days": reference.days,
        "explanation": cusum_service.explain(point, reference),
        "calculated_at": row.calculated_at,
        "calculation": metadata,
    }


def run_from_rows(syndrome: str, stored: list[StatisticalSignal]) -> CusumRun | None:
    if not stored:
        return None
    run = CusumRun(syndrome, config_of(stored[0]), min(r.signal_date for r in stored), max(r.signal_date for r in stored))
    for metric in METRICS:
        mine = [r for r in stored if r.metric == metric]
        run.points[metric] = [point_of(r) for r in mine]
        if mine:
            run.references[metric] = ewma_reads.reference_of(mine[0])
    return run


def day_view(session: Session, syndrome: str, day: date) -> dict | None:
    stored = {r.metric: r for r in rows(session, syndrome, date_from=day, date_to=day)}
    if not stored:
        return None
    overall = cusum.overall_state([stored[m].alert_state for m in METRICS if m in stored])
    return {
        "syndrome": syndrome,
        "signal_date": day,
        "volume": to_read(stored["volume"]) if "volume" in stored else None,
        "positivity": to_read(stored["positivity"]) if "positivity" in stored else None,
        "overall_state": overall,
        "overall_basis": [m for m in METRICS if m in stored and stored[m].alert_state is not None],
    }


def comparison(session: Session, syndrome: str, day: date) -> dict:
    """The three methods on one date, side by side, and how many signal."""
    composite = ewma_reads.composite_for(session, syndrome, day)
    ewma_day = ewma_reads.day_view(session, syndrome, day)
    cusum_day = day_view(session, syndrome, day)

    def states(view: dict | None) -> dict:
        if view is None:
            return {"volume": None, "positivity": None, "overall": None}
        return {
            "volume": view["volume"]["alert_state"] if view["volume"] else None,
            "positivity": view["positivity"]["alert_state"] if view["positivity"] else None,
            "overall": view["overall_state"],
        }

    ewma_states, cusum_states = states(ewma_day), states(cusum_day)
    agreement = cusum_service.three_method(composite, ewma_states["overall"], cusum_states["overall"])
    return {
        "syndrome": syndrome,
        "signal_date": day,
        "composite": None
        if composite is None
        else {
            "signal_id": composite.id,
            "calculation_status": composite.calculation_status,
            "composite_score": _float(composite.composite_score),
            "severity": composite.severity,
        },
        "ewma": ewma_states,
        "cusum": {
            **cusum_states,
            "approaching": {
                m: bool(cusum_day[m] and cusum_day[m]["approaching_limit"]) for m in METRICS
            } if cusum_day else {m: False for m in METRICS},
        },
        **agreement,
        "rule": cusum_service.SIGNAL_RULE,
    }
