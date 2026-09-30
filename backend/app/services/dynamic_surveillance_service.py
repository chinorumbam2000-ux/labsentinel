"""
Read access to dynamic surveillance signals, for the API.

Every query here filters on mode = 'dynamic'; the frozen demonstration's
signals are never returned (and dynamic ones never reach /api/signals).
"""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import SurveillanceSignal
from app.schemas.dynamic_surveillance import DynamicSignalRead, DynamicSignalSummary
from app.surveillance.persistence import DYNAMIC


def _float(value) -> float | None:
    return None if value is None else float(value)


def _common(signal: SurveillanceSignal) -> dict:
    metadata = signal.calculation_metadata or {}
    return {
        "id": signal.id,
        "mode": "dynamic",
        "syndrome": signal.syndrome,
        "signal_date": signal.signal_date,
        "calculation_status": signal.calculation_status,
        "test_volume": signal.test_volume,
        "positive_count": signal.positive_count,
        "positivity_rate": float(signal.positivity_rate),
        "baseline_volume": _float(signal.baseline_volume),
        "baseline_positivity_rate": _float(signal.baseline_positivity_rate),
        "affected_facilities": signal.affected_facilities,
        "participating_facilities": len(metadata.get("facilities", [])),
        "affected_geographies": list(signal.affected_geographies or []),
        "participating_geographies": len(metadata.get("geography", {}).get("participating", [])),
        "persistence_days": signal.persistence_days,
        "composite_score": _float(signal.composite_score),
        "severity": signal.severity,
        "data_confidence_score": _float(signal.data_confidence_score),
        "data_confidence_level": signal.data_confidence_level,
        "status": signal.status,
        "calculated_at": signal.calculated_at,
    }


def to_summary(signal: SurveillanceSignal) -> DynamicSignalSummary:
    return DynamicSignalSummary(**_common(signal))


def to_read(signal: SurveillanceSignal) -> DynamicSignalRead:
    metadata = signal.calculation_metadata or {}
    return DynamicSignalRead(
        **_common(signal),
        volume_component_score=_float(signal.volume_component_score),
        positivity_component_score=_float(signal.positivity_component_score),
        facility_component_score=_float(signal.facility_component_score),
        geography_component_score=_float(signal.geography_component_score),
        persistence_component_score=_float(signal.persistence_component_score),
        message=metadata.get("message"),
        calculation=metadata,
    )


def list_signals(
    session: Session,
    syndrome: str,
    date_from: date | None = None,
    date_to: date | None = None,
    facility: str | None = None,
) -> list[SurveillanceSignal]:
    """Dynamic signal history, oldest first. ``facility``: signals it contributed abnormal activity to."""
    query = select(SurveillanceSignal).where(DYNAMIC, SurveillanceSignal.syndrome == syndrome)
    if date_from is not None:
        query = query.where(SurveillanceSignal.signal_date >= date_from)
    if date_to is not None:
        query = query.where(SurveillanceSignal.signal_date <= date_to)
    signals = list(session.scalars(query.order_by(SurveillanceSignal.signal_date)))
    if facility is not None:
        signals = [
            s for s in signals
            if any(
                f.get("facility_code") == facility and f.get("status") == "ABNORMAL"
                for f in (s.calculation_metadata or {}).get("facilities", [])
            )
        ]
    return signals


def get_signal(session: Session, signal_id: int) -> SurveillanceSignal | None:
    return session.scalar(select(SurveillanceSignal).where(DYNAMIC, SurveillanceSignal.id == signal_id))


def current_signal(session: Session, syndrome: str, day: date | None = None) -> SurveillanceSignal | None:
    """The signal for ``day``, or the most recent dynamic signal."""
    query = select(SurveillanceSignal).where(DYNAMIC, SurveillanceSignal.syndrome == syndrome)
    if day is not None:
        return session.scalar(query.where(SurveillanceSignal.signal_date == day))
    return session.scalar(query.order_by(SurveillanceSignal.signal_date.desc()).limit(1))


def date_span(session: Session, syndrome: str) -> tuple[int, date | None, date | None]:
    count, first, last = session.execute(
        select(
            func.count(SurveillanceSignal.id),
            func.min(SurveillanceSignal.signal_date),
            func.max(SurveillanceSignal.signal_date),
        ).where(DYNAMIC, SurveillanceSignal.syndrome == syndrome)
    ).one()
    return count, first, last
