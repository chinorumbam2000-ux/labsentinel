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
    "facility",
    "lab_observation",
    "surveillance_signal",
    "audit_event",
    "demo_simulation_day",
}


def test_single_linear_head() -> None:
    script = ScriptDirectory.from_config(alembic_config())

    assert script.get_heads() == ["0003"]


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
        "UPDATE alembic_version SET version_num='0003'",
    ):
        assert fragment in sql

    # Every named constraint and index the models declare appears in the DDL.
    for table in Base.metadata.sorted_tables:
        for constraint in table.constraints:
            assert str(constraint.name) in sql, constraint.name
        for index in table.indexes:
            assert str(index.name) in sql, index.name
