import pytest
from pydantic import ValidationError

from app.config import DEFAULT_DEV_ORIGINS, Settings, get_settings
from app.database import get_engine


def test_defaults_target_local_development_postgresql() -> None:
    settings = Settings()

    assert settings.app_env == "development"
    assert settings.api_host == "127.0.0.1"
    assert settings.api_port == 8000
    assert settings.database_url.get_secret_value() == (
        "postgresql+psycopg://labsentinel:labsentinel@127.0.0.1:5432/labsentinel"
    )
    assert settings.cors_origins == DEFAULT_DEV_ORIGINS


def test_environment_variables_override_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("API_PORT", "9000")
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+psycopg://someone:pw@db.internal:6543/other"
    )

    settings = Settings()

    assert settings.app_env == "test"
    assert settings.api_port == 9000
    assert settings.database_url.get_secret_value().endswith("@db.internal:6543/other")


def test_database_url_must_use_psycopg3(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://labsentinel:pw@localhost/labsentinel")

    with pytest.raises(ValidationError, match="psycopg 3"):
        Settings()


def test_database_url_is_hidden_from_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+psycopg://labsentinel:hunter2@localhost/labsentinel"
    )

    settings = Settings()

    assert "hunter2" not in repr(settings)
    assert "hunter2" not in str(settings.model_dump())


def test_cors_origins_parse_from_comma_separated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", " http://localhost:5173 , http://127.0.0.1:5173 ")

    assert Settings().cors_origins == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_wildcard_cors_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "*")

    with pytest.raises(ValidationError, match="Wildcard CORS"):
        Settings()


def test_engine_uses_psycopg_dialect_without_connecting() -> None:
    engine = get_engine()

    # Building the engine must not open a connection, so the API can start
    # while PostgreSQL is down.
    assert engine.dialect.name == "postgresql"
    assert engine.dialect.driver == "psycopg"
    assert engine.pool.checkedout() == 0
    assert get_settings().database_connect_timeout == 5
