"""
Environment-based configuration.

Every setting is read from environment variables, or from ``backend/.env``
during local development. Nothing secret is hard-coded here: the defaults are
the throwaway development values that ``.env.example`` and the development
docker-compose service also use.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
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


DEVELOPMENT_SALT = "labsentinel-development-only-salt"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # development   local work: every development-only endpoint is available
    # test          automated tests: development-only endpoints answer 404
    # presentation  a private capstone presentation deployment: development-only
    #               endpoints answer 404 unless DEMO_ENDPOINTS_ENABLED=true
    # production    production-like: development-only endpoints always answer 404
    app_env: Literal["development", "test", "presentation", "production"] = "development"
    # Opt-in for a PRIVATE presentation deployment only (APP_ENV=presentation):
    # enables the FHIR ingestion demo, the recalculations, the evaluation reads
    # and the readiness checklist. Rejected with APP_ENV=production.
    demo_endpoints_enabled: bool = False
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

    # FHIR ingestion (development only). Patient references are replaced by a
    # salted one-way pseudonym before storage; change the salt per deployment.
    fhir_pseudonym_salt: SecretStr = SecretStr(DEVELOPMENT_SALT)
    # Largest request body POST /api/fhir/ingest accepts, in bytes.
    fhir_max_request_bytes: int = Field(default=5_000_000, ge=1_000, le=50_000_000)

    # Where `python -m app.evaluation.run` writes, and the development-only
    # /api/evaluation endpoints read, the capstone evaluation artifacts.
    # Relative paths are relative to backend/.
    evaluation_results_dir: str = "evaluation-results"

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

    @model_validator(mode="after")
    def _guard_demo_endpoints(self) -> "Settings":
        if self.demo_endpoints_enabled and self.app_env == "production":
            raise ValueError("DEMO_ENDPOINTS_ENABLED=true is not permitted with APP_ENV=production.")
        if (
            self.app_env == "presentation"
            and self.demo_endpoints_enabled
            and self.fhir_pseudonym_salt.get_secret_value() == DEVELOPMENT_SALT
        ):
            raise ValueError(
                "A presentation deployment with demo endpoints needs its own FHIR_PSEUDONYM_SALT, "
                "not the development default."
            )
        return self

    @property
    def demo_endpoints_available(self) -> bool:
        """
        Whether the development-only endpoints (FHIR ingestion, recalculations,
        evaluation reads, readiness) are served: always in development, in a
        private presentation deployment only when explicitly enabled, never in
        test or production.
        """
        return self.app_env == "development" or (
            self.app_env == "presentation" and self.demo_endpoints_enabled
        )

    @field_validator("database_url", mode="before")
    @classmethod
    def _use_psycopg3_driver(cls, value: object) -> object:
        # Managed PostgreSQL providers (Render's fromDatabase connectionString,
        # for example) hand out the driver-less "postgresql://" or legacy
        # "postgres://" form. Both mean the same database; pin them to the
        # psycopg 3 driver. Any other explicit driver is still rejected below.
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if isinstance(raw, str):
            for scheme in ("postgresql://", "postgres://"):
                if raw.startswith(scheme):
                    return "postgresql+psycopg://" + raw[len(scheme):]
        return value

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
