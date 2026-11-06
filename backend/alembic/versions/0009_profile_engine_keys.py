"""Give each surveillance profile an engine key.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-06

Additive. surveillance_profile.engine_key is the key a profile's dynamic
signals, EWMA and CUSUM results are calculated and stored under (the
``syndrome`` column of surveillance_signal and statistical_signal).
Respiratory Viral Syndrome keeps its legacy key, so every row stored before
this revision still belongs to it. The other profiles use their ids.

Influenza A, COVID-19 and RSV become available to the dynamic engine: their
tests are LOINC-mapped and ingested through FHIR, and the aggregator now
narrows eligible observations to a profile's tests. Cholera and
Gastrointestinal Syndrome stay unavailable: their demonstration codes are
never ingested.

The live-availability check now reads engine_key instead of
legacy_syndrome. No other table changes (the memberships are kept intact
through SQLite's table rebuild). Downgrade restores 0008 exactly.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENGINE_KEYS = {
    "respiratory-viral-syndrome": "Respiratory Viral Syndrome",
    "influenza-a": "influenza-a",
    "covid-19": "covid-19",
    "rsv": "rsv",
    "cholera": "cholera",
    "gastrointestinal-syndrome": "gastrointestinal-syndrome",
}
NEWLY_LIVE = ("influenza-a", "covid-19", "rsv")

membership = sa.table(
    "lab_test_profile_membership",
    sa.column("test_code", sa.String),
    sa.column("profile_id", sa.String),
    sa.column("code_system", sa.String),
    sa.column("test_name", sa.String),
)

profile = sa.table(
    "surveillance_profile",
    sa.column("id", sa.String),
    sa.column("engine_key", sa.String),
    sa.column("live_available", sa.Boolean),
)


def _memberships() -> list[dict]:
    if op.get_context().as_sql:  # offline SQL script: PostgreSQL alters in place, nothing to keep
        return []
    rows = op.get_bind().execute(
        sa.select(membership.c.test_code, membership.c.profile_id, membership.c.code_system, membership.c.test_name)
    )
    return [dict(row._mapping) for row in rows]


def _restore(saved: list[dict]) -> None:
    """
    SQLite's batch mode rebuilds surveillance_profile by copying and dropping
    it, and the drop cascades to lab_test_profile_membership. PostgreSQL
    alters the table in place and loses nothing. Either way the memberships
    are put back exactly as they were.
    """
    if not saved:
        return
    if op.get_bind().execute(sa.select(sa.func.count()).select_from(membership)).scalar() == len(saved):
        return
    op.execute(membership.delete())
    op.bulk_insert(membership, saved)


def upgrade() -> None:
    saved = _memberships()
    with op.batch_alter_table("surveillance_profile") as batch:
        batch.add_column(
            sa.Column(
                "engine_key",
                sa.String(length=100),
                nullable=True,
                comment="Key its dynamic, EWMA and CUSUM results are stored under (the signal tables' syndrome column).",
            )
        )
        batch.create_unique_constraint(op.f("uq_surveillance_profile_engine_key"), ["engine_key"])
        batch.drop_constraint(op.f("ck_surveillance_profile_live_needs_engine_key"), type_="check")
    for profile_id, key in ENGINE_KEYS.items():
        op.execute(profile.update().where(profile.c.id == profile_id).values(engine_key=key))
    op.execute(profile.update().where(profile.c.id.in_(NEWLY_LIVE)).values(live_available=True))
    with op.batch_alter_table("surveillance_profile") as batch:
        batch.create_check_constraint(
            op.f("ck_surveillance_profile_live_needs_engine_key"),
            "NOT live_available OR engine_key IS NOT NULL",
        )
    _restore(saved)


def downgrade() -> None:
    saved = _memberships()
    op.execute(profile.update().where(profile.c.id.in_(NEWLY_LIVE)).values(live_available=False))
    with op.batch_alter_table("surveillance_profile") as batch:
        batch.drop_constraint(op.f("ck_surveillance_profile_live_needs_engine_key"), type_="check")
        batch.drop_constraint(op.f("uq_surveillance_profile_engine_key"), type_="unique")
        batch.drop_column("engine_key")
    with op.batch_alter_table("surveillance_profile") as batch:
        batch.create_check_constraint(
            op.f("ck_surveillance_profile_live_needs_engine_key"),
            "NOT live_available OR legacy_syndrome IS NOT NULL",
        )
    _restore(saved)
