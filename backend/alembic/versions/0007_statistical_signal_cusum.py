"""Let statistical_signal hold CUSUM results beside EWMA.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-30

statistical_signal was keyed on (mode, method, syndrome, signal_date,
metric) so another method could share it, but its row rules were EWMA's:
method limited to 'EWMA', a CALCULATED row required an EWMA value and
limits, and lambda / k were NOT NULL. This migration keeps the table and the
key and makes the rules method-specific:

- method may be 'EWMA' or 'CUSUM';
- CUSUM columns: z_score, previous_cusum, cusum_value, cusum_k, cusum_h;
- lambda_value and k_value become nullable, but a check still requires them
  on every EWMA row (and cusum_k / cusum_h on every CUSUM row);
- a CALCULATED row must carry its own method's values;
- CUSUM has no WATCH state.

Existing EWMA rows are valid under the new rules unchanged. Downgrade is
refused while CUSUM rows exist.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VALUE = sa.Numeric(precision=12, scale=4)

OLD_CHECKS = {
    "method_valid": "method IN ('EWMA')",
    "calculated_is_complete": (
        "calculation_status <> 'CALCULATED' OR (observed_value IS NOT NULL AND ewma_value IS NOT NULL "
        "AND upper_control_limit IS NOT NULL AND warning_limit IS NOT NULL AND alert_state IS NOT NULL)"
    ),
    "lambda_range": "lambda_value > 0 AND lambda_value <= 1",
    "k_positive": "k_value > 0",
}
NEW_CHECKS = {
    "method_valid": "method IN ('EWMA', 'CUSUM')",
    "cusum_alert_state_valid": (
        "method <> 'CUSUM' OR alert_state IS NULL OR alert_state IN ('NORMAL', 'STATISTICAL_ALERT')"
    ),
    "calculated_is_complete": (
        "calculation_status <> 'CALCULATED' OR (observed_value IS NOT NULL AND alert_state IS NOT NULL AND ("
        "(method = 'EWMA' AND ewma_value IS NOT NULL AND upper_control_limit IS NOT NULL "
        "AND warning_limit IS NOT NULL) OR "
        "(method = 'CUSUM' AND z_score IS NOT NULL AND previous_cusum IS NOT NULL AND cusum_value IS NOT NULL)))"
    ),
    "parameters_present": (
        "(method <> 'EWMA' OR (lambda_value IS NOT NULL AND k_value IS NOT NULL)) AND "
        "(method <> 'CUSUM' OR (cusum_k IS NOT NULL AND cusum_h IS NOT NULL))"
    ),
    "lambda_range": "lambda_value IS NULL OR (lambda_value > 0 AND lambda_value <= 1)",
    "k_positive": "k_value IS NULL OR k_value > 0",
    "cusum_values_valid": (
        "(cusum_value IS NULL OR cusum_value >= 0) AND (previous_cusum IS NULL OR previous_cusum >= 0) "
        "AND (cusum_k IS NULL OR cusum_k >= 0) AND (cusum_h IS NULL OR cusum_h > 0)"
    ),
}
def cusum_columns() -> tuple[sa.Column, ...]:
    return (
        sa.Column("z_score", VALUE, nullable=True, comment="(observed - mean) / SD."),
        sa.Column("previous_cusum", VALUE, nullable=True),
        sa.Column("cusum_value", VALUE, nullable=True, comment="C_t = max(0, C_(t-1) + z_t - k)."),
        sa.Column("cusum_k", sa.Numeric(precision=5, scale=2), nullable=True, comment="CUSUM reference (slack) value k."),
        sa.Column("cusum_h", sa.Numeric(precision=6, scale=2), nullable=True, comment="CUSUM decision limit h."),
    )


def _name(check: str) -> str:
    return op.f(f"ck_statistical_signal_{check}")


def upgrade() -> None:
    with op.batch_alter_table("statistical_signal") as batch:
        for check in OLD_CHECKS:
            batch.drop_constraint(_name(check), type_="check")
        for column in cusum_columns():
            batch.add_column(column)
        batch.alter_column("lambda_value", existing_type=sa.Numeric(4, 3), nullable=True)
        batch.alter_column(
            "k_value", existing_type=sa.Numeric(5, 2), nullable=True, comment="EWMA control-limit multiplier."
        )
        for check, body in NEW_CHECKS.items():
            batch.create_check_constraint(_name(check), body)


def downgrade() -> None:
    cusum = op.get_bind().execute(
        sa.text("SELECT count(*) FROM statistical_signal WHERE method <> 'EWMA'")
    ).scalar_one()
    if cusum:
        raise RuntimeError(
            f"{cusum} CUSUM result(s) exist. Remove them first with "
            "`python -m app.statistics.run --method cusum --clear`."
        )
    with op.batch_alter_table("statistical_signal") as batch:
        for check in NEW_CHECKS:
            batch.drop_constraint(_name(check), type_="check")
        batch.alter_column("k_value", existing_type=sa.Numeric(5, 2), nullable=False, comment=None)
        batch.alter_column("lambda_value", existing_type=sa.Numeric(4, 3), nullable=False)
        for column in reversed(cusum_columns()):
            batch.drop_column(column.name)
        for check, body in OLD_CHECKS.items():
            batch.create_check_constraint(_name(check), body)
