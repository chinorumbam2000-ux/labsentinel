from datetime import date
from decimal import Decimal

from sqlalchemy import JSON, CheckConstraint, Date, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.vocabulary import CONFIDENCE_LEVELS, SEVERITY_LEVELS, SIGNAL_STATUSES, sql_in
from app.database import Base
from app.models.mixins import TimestampMixin

# Scores and rates are stored as exact decimals on a 0-100 scale.
Score = Numeric(5, 2)


class SurveillanceSignal(TimestampMixin, Base):
    """
    A population-level signal for one syndrome on one date.

    The Composite Outbreak Signal Score (how concerning) and the Data
    Confidence Score (how trustworthy the data) are stored side by side and
    never combined, matching the prototype's model.
    """

    __tablename__ = "surveillance_signal"
    __table_args__ = (
        Index("ix_surveillance_signal_syndrome_date", "syndrome", "signal_date"),
        CheckConstraint(sql_in("severity", SEVERITY_LEVELS), name="severity_valid"),
        CheckConstraint(sql_in("status", SIGNAL_STATUSES), name="status_valid"),
        CheckConstraint(
            "data_confidence_level IS NULL OR "
            + sql_in("data_confidence_level", CONFIDENCE_LEVELS),
            name="data_confidence_level_valid",
        ),
        CheckConstraint(
            "composite_score >= 0 AND composite_score <= 100",
            name="composite_score_range",
        ),
        CheckConstraint(
            "data_confidence_score IS NULL OR "
            "(data_confidence_score >= 0 AND data_confidence_score <= 100)",
            name="data_confidence_score_range",
        ),
        CheckConstraint(
            "positivity_rate >= 0 AND positivity_rate <= 100",
            name="positivity_rate_range",
        ),
        CheckConstraint(
            "test_volume >= 0 AND positive_count >= 0 "
            "AND positive_count <= test_volume "
            "AND affected_facilities >= 0 AND persistence_days >= 0",
            name="counts_valid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    syndrome: Mapped[str] = mapped_column(String(100))
    signal_date: Mapped[date] = mapped_column(Date)

    test_volume: Mapped[int]
    baseline_volume: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    positive_count: Mapped[int]
    positivity_rate: Mapped[Decimal] = mapped_column(Score, comment="Percent, 0-100.")
    baseline_positivity_rate: Mapped[Decimal] = mapped_column(
        Score, comment="Percent, 0-100."
    )

    affected_facilities: Mapped[int]
    affected_geographies: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),
        default=list,
        comment="Surveillance area codes contributing to the signal.",
    )
    persistence_days: Mapped[int]

    composite_score: Mapped[Decimal] = mapped_column(Score)
    severity: Mapped[str] = mapped_column(String(20))

    # Nullable: when confidence cannot be assessed it is recorded as unknown,
    # never defaulted to a reassuring value.
    data_confidence_score: Mapped[Decimal | None] = mapped_column(Score)
    data_confidence_level: Mapped[str | None] = mapped_column(String(20))

    status: Mapped[str] = mapped_column(String(30), default="NEW", server_default="NEW")

    def __repr__(self) -> str:
        return (
            f"<SurveillanceSignal id={self.id} {self.syndrome!r} "
            f"{self.signal_date} {self.severity}>"
        )
