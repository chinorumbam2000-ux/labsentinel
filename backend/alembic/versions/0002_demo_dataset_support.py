"""Support persisting the prototype's synthetic dataset.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-29

- facility.postal_code, facility.subregion: the prototype's facilities carry a
  ZIP code and a county that the Phase 1 schema had nowhere to keep.
- lab_observation.received_datetime becomes nullable: the prototype records
  no receipt time, and an unknown time is stored as unknown, not invented.
- surveillance_signal: (syndrome, signal_date) becomes unique, replacing the
  plain index, so a date's regional signal cannot be stored twice.
- demo_simulation_day: capstone-demonstration-only narrative for each
  simulated day, kept apart from the production-shaped signal table.

Batch mode emits plain ALTER TABLE on PostgreSQL and a table rebuild on
SQLite (used only by the unit tests).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("facility") as batch:
        batch.add_column(
            sa.Column(
                "postal_code",
                sa.String(length=20),
                nullable=True,
                comment="Postal code of the facility's surveillance area (e.g. a ZIP).",
            )
        )
        batch.add_column(
            sa.Column(
                "subregion",
                sa.String(length=100),
                nullable=True,
                comment="County, district or equivalent second-level area.",
            )
        )

    with op.batch_alter_table("lab_observation") as batch:
        batch.alter_column(
            "received_datetime",
            existing_type=sa.DateTime(timezone=True),
            nullable=True,
        )

    with op.batch_alter_table("surveillance_signal") as batch:
        batch.drop_index("ix_surveillance_signal_syndrome_date")
        batch.create_unique_constraint(
            "uq_surveillance_signal_syndrome_date", ["syndrome", "signal_date"]
        )

    op.create_table(
        "demo_simulation_day",
        sa.Column("day", sa.SmallInteger(), autoincrement=False, nullable=False),
        sa.Column("simulation_date", sa.Date(), nullable=False),
        sa.Column("stage", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("signal_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("day >= 1", name=op.f("ck_demo_simulation_day_day_positive")),
        sa.ForeignKeyConstraint(
            ["signal_id"],
            ["surveillance_signal.id"],
            name=op.f("fk_demo_simulation_day_signal_id_surveillance_signal"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("day", name=op.f("pk_demo_simulation_day")),
        sa.UniqueConstraint(
            "simulation_date", name=op.f("uq_demo_simulation_day_simulation_date")
        ),
        sa.UniqueConstraint("signal_id", name=op.f("uq_demo_simulation_day_signal_id")),
    )


def downgrade() -> None:
    op.drop_table("demo_simulation_day")

    with op.batch_alter_table("surveillance_signal") as batch:
        batch.drop_constraint("uq_surveillance_signal_syndrome_date", type_="unique")
        batch.create_index(
            "ix_surveillance_signal_syndrome_date", ["syndrome", "signal_date"]
        )

    # Rows stored without a receipt time cannot satisfy NOT NULL again; the
    # downgrade fails loudly rather than inventing one.
    with op.batch_alter_table("lab_observation") as batch:
        batch.alter_column(
            "received_datetime",
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
        )

    with op.batch_alter_table("facility") as batch:
        batch.drop_column("subregion")
        batch.drop_column("postal_code")
