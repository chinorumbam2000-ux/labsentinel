from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import CreatedAtMixin
from app.models.surveillance_signal import SurveillanceSignal


class DemoSimulationDay(CreatedAtMixin, Base):
    """
    CAPSTONE DEMONSTRATION ONLY: one day of the five-day synthetic simulation.

    Holds the narrative the prototype shows for each day (stage and
    description) and points at the surveillance signal persisted for that
    day. Kept in its own table so the demonstration's simulation-day concept
    never leaks into the production-shaped ``surveillance_signal`` table.
    """

    __tablename__ = "demo_simulation_day"
    __table_args__ = (CheckConstraint("day >= 1", name="day_positive"),)

    day: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    simulation_date: Mapped[date] = mapped_column(Date, unique=True)
    stage: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    signal_id: Mapped[int] = mapped_column(
        ForeignKey("surveillance_signal.id", ondelete="RESTRICT"), unique=True
    )

    signal: Mapped[SurveillanceSignal] = relationship()

    def __repr__(self) -> str:
        return f"<DemoSimulationDay day={self.day} {self.stage!r}>"
