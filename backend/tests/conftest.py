"""
Shared fixtures.

PostgreSQL is not required to run this suite. Database-level tests build their
schema by running the real Alembic migration against a throwaway SQLite file,
so the migration itself is exercised on every run. PostgreSQL-specific DDL is
checked separately by rendering the migration offline for the PostgreSQL
dialect (see test_migrations.py).
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.config import Settings, get_settings
from app.database import get_db, get_engine, get_session_factory
from app.main import create_app
from app.models import LabObservation
from app.seed import load_dataset, seed_demo_dataset

BACKEND_DIR = Path(__file__).resolve().parents[1]


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # Leave pytest's logging configuration alone.
    config.attributes["configure_logger"] = False
    return config


def sqlite_engine(path: Path) -> Engine:
    engine = create_engine(f"sqlite:///{path.as_posix()}")

    # SQLite ignores foreign keys unless asked, per connection.
    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record) -> None:  # type: ignore[no-untyped-def]
        dbapi_connection.execute("PRAGMA foreign_keys = ON")
        # pysqlite emits no BEGIN before a SAVEPOINT, so releasing one would
        # commit it. Let SQLAlchemy manage transactions instead (the recipe in
        # SQLAlchemy's SQLite dialect documentation), so a rolled-back test
        # transaction really is rolled back, savepoints included.
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _begin(connection) -> None:  # type: ignore[no-untyped-def]
        connection.exec_driver_sql("BEGIN")

    return engine


def upgrade(engine: Engine, revision: str = "head") -> None:
    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, revision)


@pytest.fixture(autouse=True)
def _isolated_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """
    Keep a developer's backend/.env and shell environment out of the tests, and
    drop cached settings/engines so each test sees its own configuration.
    """
    for name in ("APP_ENV", "API_HOST", "API_PORT", "DATABASE_URL", "CORS_ORIGINS"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", None)

    def clear() -> None:
        get_settings.cache_clear()
        get_engine.cache_clear()
        get_session_factory.cache_clear()

    clear()
    yield
    clear()


@pytest.fixture
def migrated_engine(tmp_path: Path) -> Iterator[Engine]:
    engine = sqlite_engine(tmp_path / "labsentinel-test.db")
    upgrade(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(migrated_engine: Engine) -> Iterator[Session]:
    session = sessionmaker(bind=migrated_engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client


# ---------------------------------------------------------------------------
# Seeded-dataset fixtures. tests/integration/conftest.py defines the same
# names against PostgreSQL, so the seed and API contract suites run unchanged
# on both databases.
# ---------------------------------------------------------------------------


@pytest.fixture
def empty_session(db_session: Session) -> Session:
    """A session on a freshly migrated, empty database."""
    return db_session


def client_for(engine: Engine) -> TestClient:
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override_get_db() -> Iterator[Session]:
        with factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


@pytest.fixture(scope="module")
def seeded_engine(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Engine]:
    """A migrated database seeded with the full dataset, shared by a module."""
    engine = sqlite_engine(tmp_path_factory.mktemp("seeded") / "seeded.db")
    upgrade(engine)
    with Session(engine) as session, session.begin():
        seed_demo_dataset(session, load_dataset())
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def seeded_client(seeded_engine: Engine) -> Iterator[TestClient]:
    """Read-only API client over the seeded database."""
    with client_for(seeded_engine) as test_client:
        yield test_client


@pytest.fixture
def fhir_env(seeded_engine: Engine) -> Iterator[tuple[TestClient, Engine]]:
    """
    A client for FHIR ingestion over the seeded database. Rows written by FHIR
    ingestion are removed afterwards; the seeded dataset is never touched.
    """
    with client_for(seeded_engine) as test_client:
        yield test_client, seeded_engine
    with seeded_engine.begin() as connection:
        connection.execute(
            LabObservation.__table__.delete().where(LabObservation.source_system.like("fhir:%"))
        )
