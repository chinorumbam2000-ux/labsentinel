"""Fields needed to persist normalized FHIR R4 laboratory Observations.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-29

- terminology_status: whether the LOINC code maps to a LabSentinel test and
  syndrome. syndrome becomes nullable, but only for unmapped codes (CHECK),
  so an unrecognized code is preserved without a guessed syndrome.
- code_display: the source's display text for the LOINC code.
- result_numeric / result_unit_system / result_unit_code: FHIR Quantity
  results (value, UCUM system and code), so numeric lab results fit later.
- result_code_system / result_code: the coding behind a coded result.
- source_report_id / specimen_type: DiagnosticReport and Specimen context.

Existing rows keep their values; every new column is nullable except
terminology_status, which defaults to 'mapped' (all seeded tests are mapped).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("lab_observation") as batch:
        batch.add_column(
            sa.Column(
                "terminology_status",
                sa.String(length=20),
                server_default="mapped",
                nullable=False,
                comment="mapped: the LOINC code maps to a LabSentinel test and syndrome.",
            )
        )
        batch.add_column(
            sa.Column(
                "code_display",
                sa.String(length=255),
                nullable=True,
                comment="The source's own display text for the LOINC code.",
            )
        )
        batch.add_column(sa.Column("result_numeric", sa.Numeric(precision=18, scale=6), nullable=True))
        batch.add_column(
            sa.Column(
                "result_unit_system",
                sa.String(length=100),
                nullable=True,
                comment="Unit code system, e.g. http://unitsofmeasure.org (UCUM).",
            )
        )
        batch.add_column(sa.Column("result_unit_code", sa.String(length=50), nullable=True))
        batch.add_column(
            sa.Column(
                "result_code_system",
                sa.String(length=100),
                nullable=True,
                comment="Code system of a coded result, e.g. SNOMED CT.",
            )
        )
        batch.add_column(sa.Column("result_code", sa.String(length=50), nullable=True))
        batch.add_column(
            sa.Column(
                "source_report_id",
                sa.String(length=128),
                nullable=True,
                comment="Source DiagnosticReport that grouped this result, if any.",
            )
        )
        batch.add_column(sa.Column("specimen_type", sa.String(length=100), nullable=True))
        batch.alter_column("syndrome", existing_type=sa.String(length=100), nullable=True)
        batch.create_check_constraint(
            op.f("ck_lab_observation_terminology_status_valid"),
            "terminology_status IN ('mapped', 'unmapped')",
        )
        batch.create_check_constraint(
            op.f("ck_lab_observation_syndrome_matches_terminology"),
            "(terminology_status = 'mapped' AND syndrome IS NOT NULL) OR "
            "(terminology_status = 'unmapped' AND syndrome IS NULL)",
        )
        batch.create_check_constraint(
            op.f("ck_lab_observation_quantity_has_number"),
            "result_type <> 'quantity' OR result_numeric IS NOT NULL",
        )


def downgrade() -> None:
    # Unmapped rows have no syndrome and cannot satisfy NOT NULL again; the
    # downgrade fails loudly rather than inventing one.
    with op.batch_alter_table("lab_observation") as batch:
        batch.drop_constraint(op.f("ck_lab_observation_quantity_has_number"), type_="check")
        batch.drop_constraint(op.f("ck_lab_observation_syndrome_matches_terminology"), type_="check")
        batch.drop_constraint(op.f("ck_lab_observation_terminology_status_valid"), type_="check")
        batch.alter_column("syndrome", existing_type=sa.String(length=100), nullable=False)
        for column in (
            "specimen_type",
            "source_report_id",
            "result_code",
            "result_code_system",
            "result_unit_code",
            "result_unit_system",
            "result_numeric",
            "code_display",
            "terminology_status",
        ):
            batch.drop_column(column)
