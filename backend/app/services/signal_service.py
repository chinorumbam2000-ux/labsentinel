from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import DemoSimulationDay, SurveillanceSignal


def list_signals(session: Session) -> list[SurveillanceSignal]:
    """Signal history, oldest first."""
    return list(
        session.scalars(
            select(SurveillanceSignal).order_by(
                SurveillanceSignal.signal_date, SurveillanceSignal.id
            )
        )
    )


def get_signal(session: Session, signal_id: int) -> SurveillanceSignal | None:
    return session.get(SurveillanceSignal, signal_id)


def get_demo_day(session: Session, day: int) -> DemoSimulationDay | None:
    """CAPSTONE DEMONSTRATION: a simulated day with its persisted signal."""
    return session.scalar(
        select(DemoSimulationDay)
        .options(joinedload(DemoSimulationDay.signal))
        .where(DemoSimulationDay.day == day)
    )
