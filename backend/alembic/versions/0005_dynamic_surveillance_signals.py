"""Store dynamic surveillance signals beside the frozen demonstration.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-30

surveillance_signal.mode: 'demo' for the frozen five-day classroom
simulation (every existing row), 'dynamic' for signals calculated by the
dynamic surveillance engine. The natural key becomes (mode, syndrome,
signal_date), so a dynamic signal can never collide with, or replace, a demo
one.

A dynamic signal that cannot be scored (INSUFFICIENT_BASELINE, NO_DATA) has
no score, severity or baseline, so those columns become nullable. A check
constraint still requires them on every CALCULATED signal, and every demo
signal is CALCULATED, so the demonstration rows are unaffected.

The component scores and calculation_metadata hold the explainability of a
dynamic signal. Demo rows leave them null.

Downgrade is refused while dynamic signals exist: restoring NOT NULL would
need values that were never calculated. Clear them first with
``python -m app.surveillance.run --clear``.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COMPONENT_COLUMNS = (
    "volume_component_score",
    "positivity_component_score",
    "facility_component_score",
    "geography_component_score",
    "persistence_component_score",
)


def upgrade() -> None:
    with op.batch_alter_table("surveillance_signal") as batch:
        batch.add_column(
            sa.Column(
                "mode",
                sa.String(length=20),
                server_default="demo",
                nullable=False,
                comment="demo (frozen classroom simulation) or dynamic (surveillance engine).",
            )
        )
        batch.add_column(
            sa.Column(
                "calculation_status",
                sa.String(length=30),
                server_default="CALCULATED",
                nullable=False,
            )
        )
        for index, column in enumerate(COMPONENT_COLUMNS):
            batch.add_column(
                sa.Column(
                    column,
                    sa.Numeric(precision=5, scale=2),
                    nullable=True,
                    comment="Normalized 0-100, before weighting." if index == 0 else None,
                )
            )
        batch.add_column(
            sa.Column(
                "calculation_metadata",
                sa.JSON().with_variant(JSONB(), "postgresql"),
                nullable=True,
                comment=(
                    "Dynamic explainability: baselines, current values, components, facility "
                    "provenance, data-confidence inputs and the engine configuration used."
                ),
            )
        )
        batch.add_column(sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=True))

        batch.alter_column("composite_score", existing_type=sa.Numeric(5, 2), nullable=True)
        batch.alter_column("severity", existing_type=sa.String(length=20), nullable=True)
        batch.alter_column("baseline_volume", existing_type=sa.Numeric(10, 2), nullable=True)
        batch.alter_column("baseline_positivity_rate", existing_type=sa.Numeric(5, 2), nullable=True)

        batch.drop_constraint("uq_surveillance_signal_syndrome_date", type_="unique")
        batch.create_unique_constraint(
            "uq_surveillance_signal_mode_syndrome_date", ["mode", "syndrome", "signal_date"]
        )
        batch.create_check_constraint(
            op.f("ck_surveillance_signal_mode_valid"), "mode IN ('demo', 'dynamic')"
        )
        batch.create_check_constraint(
            op.f("ck_surveillance_signal_calculation_status_valid"),
            "calculation_status IN ('CALCULATED', 'INSUFFICIENT_BASELINE', 'NO_DATA')",
        )
        batch.create_check_constraint(
            op.f("ck_surveillance_signal_calculated_has_score"),
            "calculation_status <> 'CALCULATED' OR (composite_score IS NOT NULL "
            "AND severity IS NOT NULL AND baseline_volume IS NOT NULL "
            "AND baseline_positivity_rate IS NOT NULL)",
        )
        batch.create_check_constraint(
            op.f("ck_surveillance_signal_demo_is_calculated"),
            "mode <> 'demo' OR calculation_status = 'CALCULATED'",
        )
        batch.create_check_constraint(
            op.f("ck_surveillance_signal_component_scores_range"),
            " AND ".join(
                f"({column} IS NULL OR ({column} >= 0 AND {column} <= 100))"
                for column in COMPONENT_COLUMNS
            ),
        )


def downgrade() -> None:
    dynamic = op.get_bind().execute(
        sa.text("SELECT count(*) FROM surveillance_signal WHERE mode <> 'demo'")
    ).scalar_one()
    if dynamic:
        raise RuntimeError(
            f"{dynamic} dynamic surveillance signal(s) exist. Remove them first with "
            "`python -m app.surveillance.run --clear`; restoring NOT NULL columns would need "
            "values that were never calculated."
        )
    with op.batch_alter_table("surveillance_signal") as batch:
        for name in (
            "component_scores_range",
            "demo_is_calculated",
            "calculated_has_score",
            "calculation_status_valid",
            "mode_valid",
        ):
            batch.drop_constraint(op.f(f"ck_surveillance_signal_{name}"), type_="check")
        batch.drop_constraint("uq_surveillance_signal_mode_syndrome_date", type_="unique")
        batch.create_unique_constraint(
            "uq_surveillance_signal_syndrome_date", ["syndrome", "signal_date"]
        )
        batch.alter_column("baseline_positivity_rate", existing_type=sa.Numeric(5, 2), nullable=False)
        batch.alter_column("baseline_volume", existing_type=sa.Numeric(10, 2), nullable=False)
        batch.alter_column("severity", existing_type=sa.String(length=20), nullable=False)
        batch.alter_column("composite_score", existing_type=sa.Numeric(5, 2), nullable=False)
        for column in ("calculated_at", "calculation_metadata", *reversed(COMPONENT_COLUMNS)):
            batch.drop_column(column)
        batch.drop_column("calculation_status")
        batch.drop_column("mode")
