"""
Environment-based configuration.

Every setting is read from environment variables, or from ``backend/.env``
during local development. Nothing secret is hard-coded here: the defaults are
the throwaway development values that ``.env.example`` and the development
docker-compose service also use.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# The Vite dev server (5173) and `vite preview` (4173), under both spellings of
# the loopback host. A browser treats localhost and 127.0.0.1 as different
# origins, so both are listed.
DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # SecretStr keeps the password out of reprs, logs and tracebacks.
    database_url: SecretStr = SecretStr(
        "postgresql+psycopg://labsentinel:labsentinel@127.0.0.1:5432/labsentinel"
    )
    # Seconds to wait for PostgreSQL before a connection attempt fails, so the
    # database health check answers promptly when the server is down.
    database_connect_timeout: int = Field(default=5, ge=1, le=60)
    database_echo: bool = False

    # Comma-separated in the environment, e.g.
    # CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: list(DEFAULT_DEV_ORIGINS)
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def _reject_wildcard(cls, origins: list[str]) -> list[str]:
        if "*" in origins:
            raise ValueError(
                "Wildcard CORS is not permitted; list each allowed origin explicitly."
            )
        return origins

    @field_validator("database_url")
    @classmethod
    def _require_postgresql(cls, url: SecretStr) -> SecretStr:
        # Tests build their own SQLite engines directly and never pass through
        # here, so the application itself only ever talks to PostgreSQL.
        if not url.get_secret_value().startswith("postgresql+psycopg://"):
            raise ValueError(
                "DATABASE_URL must use the psycopg 3 driver: postgresql+psycopg://..."
            )
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
