from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, CheckConstraint, Date, DateTime, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.vocabulary import (
    CALCULATION_STATUSES,
    CONFIDENCE_LEVELS,
    SEVERITY_LEVELS,
    SIGNAL_MODES,
    SIGNAL_STATUSES,
    sql_in,
)
from app.database import Base
from app.models.mixins import TimestampMixin

# Scores and rates are stored as exact decimals on a 0-100 scale.
Score = Numeric(5, 2)

ComponentScores = (
    "volume_component_score",
    "positivity_component_score",
    "facility_component_score",
    "geography_component_score",
    "persistence_component_score",
)


class SurveillanceSignal(TimestampMixin, Base):
    """
    A population-level signal for one syndrome on one date.

    The Composite Outbreak Signal Score (how concerning) and the Data
    Confidence Score (how trustworthy the data) are stored side by side and
    never combined, matching the prototype's model.

    ``mode`` keeps two kinds of signal apart: ``demo`` rows are the frozen
    five-day classroom simulation, seeded and never recalculated; ``dynamic``
    rows are calculated by the dynamic surveillance engine from persisted
    observations. Every query filters on it, so the two are never mixed.

    A dynamic signal that cannot be scored (``calculation_status`` other than
    CALCULATED) has no score, severity or baseline: none is invented.
    """

    __tablename__ = "surveillance_signal"
    __table_args__ = (
        # One regional signal per mode, syndrome and date. Also the natural key
        # the demo seed and the dynamic engine upsert on.
        UniqueConstraint(
            "mode", "syndrome", "signal_date", name="uq_surveillance_signal_mode_syndrome_date"
        ),
        CheckConstraint(sql_in("mode", SIGNAL_MODES), name="mode_valid"),
        CheckConstraint(
            sql_in("calculation_status", CALCULATION_STATUSES), name="calculation_status_valid"
        ),
        # A scored signal always has its score, severity and baseline; the
        # frozen demonstration is always scored.
        CheckConstraint(
            "calculation_status <> 'CALCULATED' OR (composite_score IS NOT NULL "
            "AND severity IS NOT NULL AND baseline_volume IS NOT NULL "
            "AND baseline_positivity_rate IS NOT NULL)",
            name="calculated_has_score",
        ),
        CheckConstraint(
            "mode <> 'demo' OR calculation_status = 'CALCULATED'", name="demo_is_calculated"
        ),
        CheckConstraint(
            " AND ".join(
                f"({column} IS NULL OR ({column} >= 0 AND {column} <= 100))"
                for column in ComponentScores
            ),
            name="component_scores_range",
        ),
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
    mode: Mapped[str] = mapped_column(
        String(20),
        default="demo",
        server_default="demo",
        comment="demo (frozen classroom simulation) or dynamic (surveillance engine).",
    )
    syndrome: Mapped[str] = mapped_column(String(100))
    signal_date: Mapped[date] = mapped_column(Date)

    test_volume: Mapped[int]
    baseline_volume: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    positive_count: Mapped[int]
    positivity_rate: Mapped[Decimal] = mapped_column(Score, comment="Percent, 0-100.")
    baseline_positivity_rate: Mapped[Decimal | None] = mapped_column(
        Score, comment="Percent, 0-100."
    )

    affected_facilities: Mapped[int]
    affected_geographies: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),
        default=list,
        comment="Surveillance area codes contributing to the signal.",
    )
    persistence_days: Mapped[int]

    composite_score: Mapped[Decimal | None] = mapped_column(Score)
    severity: Mapped[str | None] = mapped_column(String(20))

    # Nullable: when confidence cannot be assessed it is recorded as unknown,
    # never defaulted to a reassuring value.
    data_confidence_score: Mapped[Decimal | None] = mapped_column(Score)
    data_confidence_level: Mapped[str | None] = mapped_column(String(20))

    status: Mapped[str] = mapped_column(String(30), default="NEW", server_default="NEW")

    # Dynamic surveillance. Demo rows are always CALCULATED and leave the rest null.
    calculation_status: Mapped[str] = mapped_column(
        String(30), default="CALCULATED", server_default="CALCULATED"
    )
    volume_component_score: Mapped[Decimal | None] = mapped_column(
        Score, comment="Normalized 0-100, before weighting."
    )
    positivity_component_score: Mapped[Decimal | None] = mapped_column(Score)
    facility_component_score: Mapped[Decimal | None] = mapped_column(Score)
    geography_component_score: Mapped[Decimal | None] = mapped_column(Score)
    persistence_component_score: Mapped[Decimal | None] = mapped_column(Score)
    calculation_metadata: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),
        comment=(
            "Dynamic explainability: baselines, current values, components, facility "
            "provenance, data-confidence inputs and the engine configuration used."
        ),
    )
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return (
            f"<SurveillanceSignal id={self.id} {self.syndrome!r} "
            f"{self.signal_date} {self.severity}>"
        )
