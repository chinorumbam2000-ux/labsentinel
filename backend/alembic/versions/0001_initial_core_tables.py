"""Initial core tables: facility, lab_observation, surveillance_signal, audit_event.

Revision ID: 0001
Revises:
Create Date: 2026-09-28

Controlled vocabularies are written out literally rather than imported from
app code, so this migration keeps describing the schema exactly as it was at
this revision even after the application's vocabularies evolve.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# BIGINT identity on PostgreSQL; plain INTEGER on SQLite so it auto-increments.
BIG_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def _timestamp(name: str) -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "facility",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "vendor",
            sa.String(length=100),
            nullable=False,
            comment=(
                "EHR/LIS platform label, descriptive only. Implies no ranking or "
                "comparison of vendor quality, maturity or reliability."
            ),
        ),
        sa.Column("facility_code", sa.String(length=50), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column(
            "region",
            sa.String(length=100),
            nullable=False,
            comment="State, province or equivalent first-level region.",
        ),
        sa.Column(
            "country_code",
            sa.String(length=2),
            nullable=False,
            comment="ISO 3166-1 alpha-2 country code.",
        ),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.CheckConstraint(
            "length(country_code) = 2", name=op.f("ck_facility_country_code_length")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_facility")),
        sa.UniqueConstraint("facility_code", name=op.f("uq_facility_facility_code")),
    )

    op.create_table(
        "lab_observation",
        sa.Column("id", BIG_PK, nullable=False),
        sa.Column(
            "source_observation_id",
            sa.String(length=128),
            nullable=False,
            comment="Identifier of the result in its source system.",
        ),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column(
            "patient_reference",
            sa.String(length=64),
            nullable=False,
            comment=(
                "Synthetic, de-identified reference only. Never a name, MRN or "
                "other direct identifier."
            ),
        ),
        sa.Column("syndrome", sa.String(length=100), nullable=False),
        sa.Column("test_name", sa.String(length=200), nullable=False),
        sa.Column("loinc_code", sa.String(length=20), nullable=False),
        sa.Column("result_type", sa.String(length=20), nullable=False),
        sa.Column("result_value", sa.String(length=255), nullable=True),
        sa.Column("result_unit", sa.String(length=50), nullable=True),
        sa.Column("effective_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "geographic_unit",
            sa.String(length=50),
            nullable=False,
            comment="Surveillance area code (for example a ZIP). Never a patient address.",
        ),
        sa.Column("source_system", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="final", nullable=False),
        _timestamp("created_at"),
        sa.CheckConstraint(
            "status IN ('registered', 'preliminary', 'final', 'amended', 'corrected', "
            "'cancelled', 'entered-in-error', 'unknown')",
            name=op.f("ck_lab_observation_status_valid"),
        ),
        sa.CheckConstraint(
            "result_type IN ('coded', 'quantity', 'string', 'boolean')",
            name=op.f("ck_lab_observation_result_type_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facility.id"],
            name=op.f("fk_lab_observation_facility_id_facility"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lab_observation")),
        sa.UniqueConstraint(
            "source_system",
            "source_observation_id",
            name="uq_lab_observation_source_record",
        ),
    )
    op.create_index(
        op.f("ix_lab_observation_facility_id"), "lab_observation", ["facility_id"]
    )
    op.create_index(op.f("ix_lab_observation_syndrome"), "lab_observation", ["syndrome"])
    op.create_index(
        op.f("ix_lab_observation_loinc_code"), "lab_observation", ["loinc_code"]
    )
    op.create_index(
        op.f("ix_lab_observation_effective_datetime"),
        "lab_observation",
        ["effective_datetime"],
    )

    op.create_table(
        "surveillance_signal",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("syndrome", sa.String(length=100), nullable=False),
        sa.Column("signal_date", sa.Date(), nullable=False),
        sa.Column("test_volume", sa.Integer(), nullable=False),
        sa.Column("baseline_volume", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("positive_count", sa.Integer(), nullable=False),
        sa.Column(
            "positivity_rate",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            comment="Percent, 0-100.",
        ),
        sa.Column(
            "baseline_positivity_rate",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            comment="Percent, 0-100.",
        ),
        sa.Column("affected_facilities", sa.Integer(), nullable=False),
        sa.Column(
            "affected_geographies",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=False,
            comment="Surveillance area codes contributing to the signal.",
        ),
        sa.Column("persistence_days", sa.Integer(), nullable=False),
        sa.Column("composite_score", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("data_confidence_score", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("data_confidence_level", sa.String(length=20), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="NEW", nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.CheckConstraint(
            "severity IN ('Low', 'Watch', 'Moderate', 'High', 'Critical')",
            name=op.f("ck_surveillance_signal_severity_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('NEW', 'UNDER REVIEW', 'MONITORING', 'ESCALATED', "
            "'DISMISSED', 'CONFIRMED CONCERN', 'CLOSED')",
            name=op.f("ck_surveillance_signal_status_valid"),
        ),
        sa.CheckConstraint(
            "data_confidence_level IS NULL OR "
            "data_confidence_level IN ('Very High', 'High', 'Moderate', 'Low')",
            name=op.f("ck_surveillance_signal_data_confidence_level_valid"),
        ),
        sa.CheckConstraint(
            "composite_score >= 0 AND composite_score <= 100",
            name=op.f("ck_surveillance_signal_composite_score_range"),
        ),
        sa.CheckConstraint(
            "data_confidence_score IS NULL OR "
            "(data_confidence_score >= 0 AND data_confidence_score <= 100)",
            name=op.f("ck_surveillance_signal_data_confidence_score_range"),
        ),
        sa.CheckConstraint(
            "positivity_rate >= 0 AND positivity_rate <= 100",
            name=op.f("ck_surveillance_signal_positivity_rate_range"),
        ),
        sa.CheckConstraint(
            "test_volume >= 0 AND positive_count >= 0 "
            "AND positive_count <= test_volume "
            "AND affected_facilities >= 0 AND persistence_days >= 0",
            name=op.f("ck_surveillance_signal_counts_valid"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_surveillance_signal")),
    )
    op.create_index(
        "ix_surveillance_signal_syndrome_date",
        "surveillance_signal",
        ["syndrome", "signal_date"],
    )

    op.create_table(
        "audit_event",
        sa.Column("id", BIG_PK, nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.String(length=100), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        _timestamp("created_at"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_event")),
    )
    op.create_index(op.f("ix_audit_event_event_type"), "audit_event", ["event_type"])
    op.create_index("ix_audit_event_entity", "audit_event", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_event_entity", table_name="audit_event")
    op.drop_index(op.f("ix_audit_event_event_type"), table_name="audit_event")
    op.drop_table("audit_event")

    op.drop_index("ix_surveillance_signal_syndrome_date", table_name="surveillance_signal")
    op.drop_table("surveillance_signal")

    op.drop_index(op.f("ix_lab_observation_effective_datetime"), table_name="lab_observation")
    op.drop_index(op.f("ix_lab_observation_loinc_code"), table_name="lab_observation")
    op.drop_index(op.f("ix_lab_observation_syndrome"), table_name="lab_observation")
    op.drop_index(op.f("ix_lab_observation_facility_id"), table_name="lab_observation")
    op.drop_table("lab_observation")

    op.drop_table("facility")
