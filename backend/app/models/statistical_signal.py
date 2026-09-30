from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, CheckConstraint, Date, DateTime, Index, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.vocabulary import (
    STATISTICAL_ALERT_STATES,
    STATISTICAL_METHODS,
    STATISTICAL_METRICS,
    STATISTICAL_STATUSES,
    sql_in,
)
from app.database import Base
from app.models.mixins import TimestampMixin

# Values of the monitored metric: test counts or positivity percent.
Value = Numeric(12, 4)


class StatisticalSignal(TimestampMixin, Base):
    """
    One day of a secondary statistical detector (EWMA today) for one metric.

    EXPERIMENTAL STATISTICAL SURVEILLANCE: a prototype statistical detector,
    not clinically or epidemiologically validated. Stored apart from the
    Composite Outbreak Signal Score (surveillance_signal), which it never
    changes: the two are compared, never combined.
    """

    __tablename__ = "statistical_signal"
    __table_args__ = (
        UniqueConstraint(
            "mode", "method", "syndrome", "signal_date", "metric", name="uq_statistical_signal_key"
        ),
        Index("ix_statistical_signal_syndrome_date", "syndrome", "signal_date"),
        CheckConstraint("mode = 'dynamic'", name="mode_valid"),
        CheckConstraint(sql_in("method", STATISTICAL_METHODS), name="method_valid"),
        CheckConstraint(sql_in("metric", STATISTICAL_METRICS), name="metric_valid"),
        CheckConstraint(sql_in("calculation_status", STATISTICAL_STATUSES), name="calculation_status_valid"),
        CheckConstraint(
            "alert_state IS NULL OR " + sql_in("alert_state", STATISTICAL_ALERT_STATES), name="alert_state_valid"
        ),
        # A monitored day always has its EWMA, limits and state.
        CheckConstraint(
            "calculation_status <> 'CALCULATED' OR (observed_value IS NOT NULL AND ewma_value IS NOT NULL "
            "AND upper_control_limit IS NOT NULL AND warning_limit IS NOT NULL AND alert_state IS NOT NULL)",
            name="calculated_is_complete",
        ),
        CheckConstraint("lambda_value > 0 AND lambda_value <= 1", name="lambda_range"),
        CheckConstraint("k_value > 0", name="k_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    mode: Mapped[str] = mapped_column(String(20), default="dynamic", server_default="dynamic")
    method: Mapped[str] = mapped_column(String(20), default="EWMA", server_default="EWMA")
    syndrome: Mapped[str] = mapped_column(String(100))
    signal_date: Mapped[date] = mapped_column(Date)
    metric: Mapped[str] = mapped_column(String(20), comment="volume (tests a day) or positivity (percent).")
    calculation_status: Mapped[str] = mapped_column(String(30))

    observed_value: Mapped[Decimal | None] = mapped_column(Value)
    baseline_mean: Mapped[Decimal | None] = mapped_column(Value, comment="Reference-period mean.")
    baseline_stddev: Mapped[Decimal | None] = mapped_column(Value, comment="Reference-period sample SD.")
    previous_ewma: Mapped[Decimal | None] = mapped_column(Value)
    ewma_value: Mapped[Decimal | None] = mapped_column(Value)
    upper_control_limit: Mapped[Decimal | None] = mapped_column(Value)
    warning_limit: Mapped[Decimal | None] = mapped_column(Value)
    lambda_value: Mapped[Decimal] = mapped_column(Numeric(4, 3))
    k_value: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    alert_state: Mapped[str | None] = mapped_column(String(30))

    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    calculation_metadata: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),
        comment="Reference period, update count, limit factors and the configuration used.",
    )

    def __repr__(self) -> str:
        return f"<StatisticalSignal {self.method} {self.metric} {self.signal_date} {self.alert_state}>"
