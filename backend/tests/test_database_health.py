from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import get_db
from app.main import create_app

# Port 1 on loopback refuses immediately, so this exercises psycopg against a
# genuinely unreachable PostgreSQL without waiting for a timeout.
UNREACHABLE_URL = "postgresql+psycopg://labsentinel:not-a-real-secret@127.0.0.1:1/labsentinel"


def test_database_health_reports_connected(migrated_engine: Engine) -> None:
    factory = sessionmaker(bind=migrated_engine)

    def override_get_db() -> Iterator[Session]:
        with factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        response = client.get("/api/health/database")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "connected"}


def test_database_health_returns_503_when_postgresql_is_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", UNREACHABLE_URL)
    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "2")

    with TestClient(create_app()) as client:
        response = client.get("/api/health/database")

    assert response.status_code == 503
    assert response.json() == {"status": "unhealthy", "database": "unavailable"}


def test_database_health_failure_leaks_no_connection_details(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("DATABASE_URL", UNREACHABLE_URL)
    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "2")

    with TestClient(create_app()) as client:
        body = client.get("/api/health/database").text

    for fragment in ("not-a-real-secret", "127.0.0.1", "labsentinel:", "psycopg"):
        assert fragment not in body
        assert fragment not in caplog.text
