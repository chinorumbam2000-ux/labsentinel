"""
Migration validation.

These run without PostgreSQL. They prove that the migration applies and
reverses cleanly, that it matches the ORM models exactly, and that the DDL it
renders for PostgreSQL contains what the models declare.
"""

import io
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect

from alembic import command
from app.database import Base
from tests.conftest import alembic_config, sqlite_engine, upgrade

CORE_TABLES = {
    "statistical_signal",
    "facility",
    "lab_observation",
    "surveillance_signal",
    "audit_event",
    "demo_simulation_day",
}


def test_single_linear_head() -> None:
    script = ScriptDirectory.from_config(alembic_config())

    assert script.get_heads() == ["0007"]


def test_upgrade_head_creates_core_tables(tmp_path: Path) -> None:
    engine = sqlite_engine(tmp_path / "upgrade.db")
    upgrade(engine)

    tables = set(inspect(engine).get_table_names())
    assert CORE_TABLES <= tables
    assert "alembic_version" in tables
    engine.dispose()


def test_migration_matches_models(tmp_path: Path) -> None:
    engine = sqlite_engine(tmp_path / "compare.db")
    upgrade(engine)

    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection, opts={"compare_type": True}
        )
        differences = compare_metadata(context, Base.metadata)

    assert differences == []
    engine.dispose()


def test_downgrade_removes_core_tables(tmp_path: Path) -> None:
    engine = sqlite_engine(tmp_path / "downgrade.db")
    upgrade(engine)

    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "base")

    assert not CORE_TABLES & set(inspect(engine).get_table_names())
    engine.dispose()


def test_offline_postgresql_sql_matches_model_intent() -> None:
    config = alembic_config()
    config.set_main_option(
        "sqlalchemy.url", "postgresql+psycopg://user:pw@localhost/labsentinel"
    )
    buffer = io.StringIO()
    config.output_buffer = buffer

    command.upgrade(config, "head", sql=True)
    sql = buffer.getvalue()

    for table in CORE_TABLES:
        assert f"CREATE TABLE {table} (" in sql
    for fragment in (
        "id BIGSERIAL NOT NULL",
        "affected_geographies JSONB NOT NULL",
        "TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL",
        "fk_lab_observation_facility_id_facility FOREIGN KEY(facility_id) "
        "REFERENCES facility (id) ON DELETE RESTRICT",
        "uq_lab_observation_source_record UNIQUE (source_system, source_observation_id)",
        "ck_surveillance_signal_severity_valid",
        "UPDATE alembic_version SET version_num='0007'",
        "uq_surveillance_signal_mode_syndrome_date UNIQUE (mode, syndrome, signal_date)",
        "calculation_metadata JSONB",
    ):
        assert fragment in sql

    # Every named constraint and index the models declare appears in the DDL.
    for table in Base.metadata.sorted_tables:
        for constraint in table.constraints:
            assert str(constraint.name) in sql, constraint.name
        for index in table.indexes:
            assert str(index.name) in sql, index.name


def _signal_row(mode: str, status: str = "CALCULATED", scored: bool = True, day: str = "2026-01-01") -> str:
    score = "10, 'Low', 100, 8" if scored else "NULL, NULL, NULL, NULL"
    return (
        "INSERT INTO surveillance_signal (mode, calculation_status, syndrome, signal_date, test_volume, "
        "positive_count, positivity_rate, affected_facilities, affected_geographies, persistence_days, "
        "composite_score, severity, baseline_volume, baseline_positivity_rate) VALUES "
        f"('{mode}', '{status}', 'Respiratory Viral Syndrome', '{day}', 10, 1, 10, 0, '[]', 0, {score})"
    )


def test_0005_keeps_demo_rows_and_refuses_to_drop_dynamic_ones(tmp_path: Path) -> None:
    import pytest
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    engine = sqlite_engine(tmp_path / "0005.db")
    upgrade(engine, "0004")
    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO surveillance_signal (syndrome, signal_date, test_volume, baseline_volume, positive_count, "
            "positivity_rate, baseline_positivity_rate, affected_facilities, affected_geographies, persistence_days, "
            "composite_score, severity) VALUES ('Respiratory Viral Syndrome', '2026-01-01', 10, 100, 1, 10, 8, 0, "
            "'[]', 0, 10, 'Low')"
        ))
    upgrade(engine)
    with engine.begin() as connection:
        # The existing row is a demonstration signal.
        assert connection.execute(text("SELECT mode, calculation_status FROM surveillance_signal")).one() == (
            "demo", "CALCULATED",
        )
        # Same syndrome and date in the other mode is allowed, and a dynamic
        # signal may be unscored.
        connection.execute(text(_signal_row("dynamic", "INSUFFICIENT_BASELINE", scored=False)))

    rejected = {
        "duplicate (mode, syndrome, date)": _signal_row("dynamic"),
        "unknown mode": _signal_row("other", day="2026-01-02"),
        "unknown calculation status": _signal_row("dynamic", "GUESSED", day="2026-01-03"),
        "CALCULATED without a score": _signal_row("dynamic", "CALCULATED", scored=False, day="2026-01-04"),
        "unscored demonstration signal": _signal_row("demo", "NO_DATA", scored=False, day="2026-01-05"),
    }
    for case, statement in rejected.items():
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text(statement))
            pytest.fail(f"accepted: {case}")

    config = alembic_config()
    with pytest.raises(RuntimeError, match="dynamic surveillance signal"), engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0004")
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM surveillance_signal WHERE mode = 'dynamic'"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0004")
    assert "mode" not in {c["name"] for c in inspect(engine).get_columns("surveillance_signal")}
    engine.dispose()


def test_0007_admits_cusum_rows_beside_ewma_and_guards_the_downgrade(tmp_path: Path) -> None:
    import pytest
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    engine = sqlite_engine(tmp_path / "0007.db")
    upgrade(engine)
    common = (
        "INSERT INTO statistical_signal (mode, method, syndrome, signal_date, metric, calculation_status, "
        "observed_value, alert_state, calculated_at, {cols}) VALUES ('dynamic', '{method}', 'R', '2026-01-17', "
        "'positivity', 'CALCULATED', 23.29, '{state}', '2026-01-17', {vals})"
    )
    ewma_row = common.format(method="EWMA", state="STATISTICAL_ALERT",
                             cols="ewma_value, upper_control_limit, warning_limit, lambda_value, k_value",
                             vals="13.93, 12.26, 10.67, 0.25, 3")
    cusum_row = common.format(method="CUSUM", state="STATISTICAL_ALERT",
                              cols="z_score, previous_cusum, cusum_value, cusum_k, cusum_h", vals="3.75, 2.29, 5.54, 0.5, 5")
    with engine.begin() as connection:
        connection.execute(text(ewma_row))
        connection.execute(text(cusum_row))  # same date and metric, different method
    rejected = {
        "CUSUM with a WATCH state": cusum_row.replace("'STATISTICAL_ALERT'", "'WATCH'").replace("2026-01-17'", "2026-01-18'", 1),
        "CUSUM without its value": cusum_row.replace("5.54, 0.5", "NULL, 0.5").replace("2026-01-17'", "2026-01-19'", 1),
        "negative CUSUM": cusum_row.replace("5.54, 0.5", "-1, 0.5").replace("2026-01-17'", "2026-01-20'", 1),
        "EWMA without lambda": ewma_row.replace("0.25, 3", "NULL, 3").replace("2026-01-17'", "2026-01-21'", 1),
        "unknown method": cusum_row.replace("'CUSUM'", "'SHEWHART'"),
    }
    for case, statement in rejected.items():
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text(statement))
            pytest.fail(f"accepted: {case}")

    config = alembic_config()
    with pytest.raises(RuntimeError, match="CUSUM result"), engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0006")
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM statistical_signal WHERE method = 'CUSUM'"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0006")
    assert "cusum_value" not in {c["name"] for c in inspect(engine).get_columns("statistical_signal")}
    engine.dispose()
