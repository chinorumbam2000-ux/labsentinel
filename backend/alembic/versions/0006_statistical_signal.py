"""Add statistical_signal for the EWMA statistical detector.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-30

One row per (mode, method, syndrome, signal_date, metric): the daily result of
a secondary statistical detector. EWMA is the only method so far, for two
metrics (test volume and positivity). The table is separate from
surveillance_signal so the Composite Outbreak Signal Score is never changed
by, or mixed with, a statistical detector; method is part of the key so a
later detector can sit beside EWMA.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VALUE = sa.Numeric(precision=12, scale=4)


def upgrade() -> None:
    op.create_table(
        "statistical_signal",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=20), server_default="dynamic", nullable=False),
        sa.Column("method", sa.String(length=20), server_default="EWMA", nullable=False),
        sa.Column("syndrome", sa.String(length=100), nullable=False),
        sa.Column("signal_date", sa.Date(), nullable=False),
        sa.Column("metric", sa.String(length=20), nullable=False, comment="volume (tests a day) or positivity (percent)."),
        sa.Column("calculation_status", sa.String(length=30), nullable=False),
        sa.Column("observed_value", VALUE, nullable=True),
        sa.Column("baseline_mean", VALUE, nullable=True, comment="Reference-period mean."),
        sa.Column("baseline_stddev", VALUE, nullable=True, comment="Reference-period sample SD."),
        sa.Column("previous_ewma", VALUE, nullable=True),
        sa.Column("ewma_value", VALUE, nullable=True),
        sa.Column("upper_control_limit", VALUE, nullable=True),
        sa.Column("warning_limit", VALUE, nullable=True),
        sa.Column("lambda_value", sa.Numeric(precision=4, scale=3), nullable=False),
        sa.Column("k_value", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("alert_state", sa.String(length=30), nullable=True),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "calculation_metadata",
            sa.JSON().with_variant(JSONB(), "postgresql"),
            nullable=True,
            comment="Reference period, update count, limit factors and the configuration used.",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("mode = 'dynamic'", name=op.f("ck_statistical_signal_mode_valid")),
        sa.CheckConstraint("method IN ('EWMA')", name=op.f("ck_statistical_signal_method_valid")),
        sa.CheckConstraint("metric IN ('volume', 'positivity')", name=op.f("ck_statistical_signal_metric_valid")),
        sa.CheckConstraint(
            "calculation_status IN ('CALCULATED', 'REFERENCE_PERIOD', 'INSUFFICIENT_BASELINE', "
            "'INSUFFICIENT_VARIANCE', 'NO_DATA')",
            name=op.f("ck_statistical_signal_calculation_status_valid"),
        ),
        sa.CheckConstraint(
            "alert_state IS NULL OR alert_state IN ('NORMAL', 'WATCH', 'STATISTICAL_ALERT')",
            name=op.f("ck_statistical_signal_alert_state_valid"),
        ),
        sa.CheckConstraint(
            "calculation_status <> 'CALCULATED' OR (observed_value IS NOT NULL AND ewma_value IS NOT NULL "
            "AND upper_control_limit IS NOT NULL AND warning_limit IS NOT NULL AND alert_state IS NOT NULL)",
            name=op.f("ck_statistical_signal_calculated_is_complete"),
        ),
        sa.CheckConstraint("lambda_value > 0 AND lambda_value <= 1", name=op.f("ck_statistical_signal_lambda_range")),
        sa.CheckConstraint("k_value > 0", name=op.f("ck_statistical_signal_k_positive")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_statistical_signal")),
        sa.UniqueConstraint(
            "mode", "method", "syndrome", "signal_date", "metric", name="uq_statistical_signal_key"
        ),
    )
    op.create_index("ix_statistical_signal_syndrome_date", "statistical_signal", ["syndrome", "signal_date"])


def downgrade() -> None:
    op.drop_index("ix_statistical_signal_syndrome_date", table_name="statistical_signal")
    op.drop_table("statistical_signal")
