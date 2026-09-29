"""Distinguish participating facilities from development sources.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-30

facility.participation: 'participating' for the surveillance network's
facilities (every existing row), 'development' for fictional development
sources such as the SMART sandbox facility. Development facilities are never
listed as participating facilities and never counted in the demonstration.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("facility") as batch:
        batch.add_column(
            sa.Column(
                "participation",
                sa.String(length=20),
                server_default="participating",
                nullable=False,
                comment="participating (surveillance network) or development (fictional development source).",
            )
        )
        batch.create_check_constraint(
            op.f("ck_facility_participation_valid"),
            "participation IN ('participating', 'development')",
        )


def downgrade() -> None:
    with op.batch_alter_table("facility") as batch:
        batch.drop_constraint(op.f("ck_facility_participation_valid"), type_="check")
        batch.drop_column("participation")
