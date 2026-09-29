"""
PostgreSQL integration test fixtures.

These tests run only when LABSENTINEL_TEST_DATABASE_URL is set; otherwise they
are skipped, so the unit suite never depends on a running database.

The target must be a dedicated, disposable database whose name ends in
``_test``. The suite resets it with ``alembic downgrade base`` followed by
``alembic upgrade head``, which drops every table it manages.

    docker compose exec db createdb -U labsentinel labsentinel_test
    LABSENTINEL_TEST_DATABASE_URL=postgresql+psycopg://labsentinel:labsentinel@127.0.0.1:5432/labsentinel_test
"""

import os
from collections.abc import Iterator

import pytest
from alembic import command
from sqlalchemy import Engine, make_url, pool, text
from sqlalchemy.orm import Session, sessionmaker

from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app.database import build_engine
from app.seed import load_dataset, seed_demo_dataset
from tests.conftest import alembic_config, client_for

TEST_URL_VARIABLE = "LABSENTINEL_TEST_DATABASE_URL"
MANAGED_TABLES = (
    "audit_event",
    "demo_simulation_day",
    "surveillance_signal",
    "lab_observation",
    "facility",
)


def truncate_all(engine: Engine) -> None:
    present = set(inspect(engine).get_table_names())
    tables = [t for t in MANAGED_TABLES if t in present]
    if tables:
        with engine.begin() as connection:
            connection.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))


@pytest.fixture(scope="session")
def pg_url() -> str:
    url = os.environ.get(TEST_URL_VARIABLE)
    if not url:
        pytest.skip(f"{TEST_URL_VARIABLE} is not set; PostgreSQL integration tests skipped")

    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql" or parsed.drivername != "postgresql+psycopg":
        pytest.fail(f"{TEST_URL_VARIABLE} must be a postgresql+psycopg:// URL")
    if not (parsed.database or "").endswith("_test"):
        # This suite drops every table it manages. Refuse anything that is not
        # unmistakably a throwaway test database.
        pytest.fail(
            f"Refusing to run: database {parsed.database!r} does not end in '_test'"
        )
    return url


def migrate(connection_engine: Engine, revision: str, *, down: bool = False) -> None:
    config = alembic_config()
    with connection_engine.begin() as connection:
        config.attributes["connection"] = connection
        if down:
            command.downgrade(config, revision)
        else:
            command.upgrade(config, revision)


@pytest.fixture(scope="session")
def pg_engine(pg_url: str) -> Iterator[Engine]:
    engine = build_engine(pg_url, connect_timeout=5, poolclass=pool.NullPool)
    # Start from a known-empty schema built purely by the migrations. Rows
    # left by an interrupted run are cleared first: 0002's downgrade cannot
    # restore NOT NULL on received_datetime over rows that have none.
    truncate_all(engine)
    migrate(engine, "base", down=True)
    migrate(engine, "head")
    yield engine
    engine.dispose()


@pytest.fixture
def pg_session(pg_engine: Engine) -> Iterator[Session]:
    session = sessionmaker(bind=pg_engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        truncate_all(pg_engine)


# Same fixture names as tests/conftest.py, so the shared seed and API contract
# suites run against PostgreSQL unchanged.


@pytest.fixture
def empty_session(pg_session: Session) -> Session:
    truncate_all(pg_session.get_bind())
    return pg_session


@pytest.fixture(scope="module")
def seeded_client(pg_engine: Engine) -> Iterator[TestClient]:
    truncate_all(pg_engine)
    with Session(pg_engine) as session, session.begin():
        seed_demo_dataset(session, load_dataset())
    with client_for(pg_engine) as test_client:
        yield test_client
    truncate_all(pg_engine)
