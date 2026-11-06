"""Add surveillance profiles and many-to-many test-to-profile membership.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-05

Purely additive. Two new tables; no existing table, column, constraint or
row changes:

- surveillance_profile: one row per surveillance target (a syndrome or a
  pathogen) with its display name, category, active flag, description,
  configuration references and replay / live availability.
  legacy_syndrome is the lab_observation.syndrome value the dynamic engine
  calculates the profile under; only Respiratory Viral Syndrome has one.
- lab_test_profile_membership: (test_code, profile_id). One test may count
  towards several profiles: an Influenza A RNA result counts towards both
  Influenza A and Respiratory Viral Syndrome.

The rows are the registry as of this revision (app/profiles/registry.json),
copied here so the migration never changes when the registry does. A test
checks that the two agree.

Downgrade drops both tables. Nothing else references them, so it loses only
the profile definitions, which this upgrade recreates.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LOINC = "http://loinc.org"
DEMO = "urn:labsentinel:demo-test-code"
CONFIG = "illustrative-defaults-v1"

PROFILES = [
    # id, display name, short name, category, description, legacy syndrome, replay, live, origin
    (
        "respiratory-viral-syndrome",
        "Respiratory Viral Syndrome",
        "Respiratory",
        "Syndrome",
        "Influenza A, SARS-CoV-2 and RSV RNA results together. The narrated five-day Scenario Replay.",
        "Respiratory Viral Syndrome",
        True,
        True,
        "replay-scenario",
    ),
    (
        "influenza-a",
        "Influenza A",
        "Influenza A",
        "Pathogen",
        "Influenza A RNA results only, from the same replay results as Respiratory Viral Syndrome.",
        None,
        False,
        False,
        "replay-derived",
    ),
    (
        "covid-19",
        "COVID-19",
        "COVID-19",
        "Pathogen",
        "SARS-CoV-2 RNA results only, from the same replay results as Respiratory Viral Syndrome.",
        None,
        False,
        False,
        "replay-derived",
    ),
    (
        "rsv",
        "RSV",
        "RSV",
        "Pathogen",
        "RSV RNA results only, from the same replay results as Respiratory Viral Syndrome.",
        None,
        False,
        False,
        "replay-derived",
    ),
    (
        "cholera",
        "Cholera",
        "Cholera",
        "Pathogen",
        "Vibrio cholerae results. Synthetic portfolio data: a few tests from the third replay day, none before.",
        None,
        False,
        False,
        "portfolio-fixture",
    ),
    (
        "gastrointestinal-syndrome",
        "Gastrointestinal Syndrome",
        "Gastrointestinal",
        "Syndrome",
        "Gastrointestinal pathogen panel and Vibrio cholerae results together. Synthetic portfolio data.",
        None,
        False,
        False,
        "portfolio-fixture",
    ),
]

MEMBERSHIPS = [
    # test code, system, test name, profile id
    ("92142-9", LOINC, "Influenza A RNA", "respiratory-viral-syndrome"),
    ("94500-6", LOINC, "SARS-CoV-2 RNA", "respiratory-viral-syndrome"),
    ("85479-4", LOINC, "RSV RNA", "respiratory-viral-syndrome"),
    ("92142-9", LOINC, "Influenza A RNA", "influenza-a"),
    ("94500-6", LOINC, "SARS-CoV-2 RNA", "covid-19"),
    ("85479-4", LOINC, "RSV RNA", "rsv"),
    ("DEMO-VCH", DEMO, "Vibrio cholerae nucleic acid (synthetic)", "cholera"),
    ("DEMO-GIP", DEMO, "Gastrointestinal pathogen panel (synthetic)", "gastrointestinal-syndrome"),
    ("DEMO-VCH", DEMO, "Vibrio cholerae nucleic acid (synthetic)", "gastrointestinal-syndrome"),
]


def upgrade() -> None:
    profile = op.create_table(
        "surveillance_profile",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("short_name", sa.String(length=60), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "legacy_syndrome",
            sa.String(length=100),
            nullable=True,
            comment="lab_observation.syndrome / engine key for this profile, if the engine calculates it.",
        ),
        sa.Column("baseline_config_ref", sa.String(length=64), nullable=False),
        sa.Column("signal_config_ref", sa.String(length=64), nullable=False),
        sa.Column("replay_available", sa.Boolean(), nullable=False, comment="Has the narrated Scenario Replay."),
        sa.Column(
            "live_available",
            sa.Boolean(),
            nullable=False,
            comment="The dynamic engine calculates it from ingested results.",
        ),
        sa.Column("data_origin", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("category IN ('Syndrome', 'Pathogen')", name=op.f("ck_surveillance_profile_category_valid")),
        sa.CheckConstraint(
            "data_origin IN ('replay-scenario', 'replay-derived', 'portfolio-fixture')",
            name=op.f("ck_surveillance_profile_data_origin_valid"),
        ),
        sa.CheckConstraint(
            "NOT live_available OR legacy_syndrome IS NOT NULL",
            name=op.f("ck_surveillance_profile_live_needs_engine_key"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_surveillance_profile")),
        sa.UniqueConstraint("display_name", name=op.f("uq_surveillance_profile_display_name")),
    )
    membership = op.create_table(
        "lab_test_profile_membership",
        sa.Column("test_code", sa.String(length=20), nullable=False),
        sa.Column("profile_id", sa.String(length=64), nullable=False),
        sa.Column("code_system", sa.String(length=100), nullable=False),
        sa.Column("test_name", sa.String(length=200), nullable=False),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["surveillance_profile.id"],
            name=op.f("fk_lab_test_profile_membership_profile_id_surveillance_profile"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("test_code", "profile_id", name=op.f("pk_lab_test_profile_membership")),
    )
    op.create_index(
        op.f("ix_lab_test_profile_membership_profile_id"), "lab_test_profile_membership", ["profile_id"], unique=False
    )

    op.bulk_insert(
        profile,
        [
            {
                "id": pid,
                "display_name": name,
                "short_name": short,
                "category": category,
                "active": True,
                "description": description,
                "legacy_syndrome": legacy,
                "baseline_config_ref": CONFIG,
                "signal_config_ref": CONFIG,
                "replay_available": replay,
                "live_available": live,
                "data_origin": origin,
            }
            for pid, name, short, category, description, legacy, replay, live, origin in PROFILES
        ],
    )
    op.bulk_insert(
        membership,
        [
            {"test_code": code, "code_system": system, "test_name": name, "profile_id": pid}
            for code, system, name, pid in MEMBERSHIPS
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lab_test_profile_membership_profile_id"), table_name="lab_test_profile_membership")
    op.drop_table("lab_test_profile_membership")
    op.drop_table("surveillance_profile")
