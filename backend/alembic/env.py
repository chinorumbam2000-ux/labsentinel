"""
Alembic migration environment.

The database URL comes from, in order of precedence:
  1. a connection handed in programmatically (``config.attributes["connection"]``),
     which the migration tests use;
  2. ``sqlalchemy.url`` set on the Alembic config at runtime;
  3. ``DATABASE_URL`` from the environment or backend/.env, via app.config.
"""

from logging.config import fileConfig

from sqlalchemy import Connection, pool

from alembic import context
from app.config import get_settings
from app.database import Base, build_engine

# Importing the package registers every table on Base.metadata.
import app.models  # noqa: F401

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url.get_secret_value()


def _configure(**kwargs: object) -> None:
    context.configure(
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        **kwargs,
    )


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of executing it (``alembic upgrade head --sql``)."""
    _configure(
        url=_database_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_with(connection: Connection) -> None:
    _configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run_with(connection)
        return

    # Migrations are one-shot; no reason to keep a pool around.
    engine = build_engine(_database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        _run_with(connection)
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
