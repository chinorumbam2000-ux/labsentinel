"""
``python -m app.serve``: start the API on a hosting platform (Render).

    PORT=10000 MIGRATE_ON_START=true python -m app.serve

1. If ``MIGRATE_ON_START`` is true, bring the schema to the Alembic head —
   once, before the server binds, so no request is ever served by a
   half-migrated database. Alembic is idempotent: at head it does nothing.
2. Serve ``app.main:app`` with uvicorn on ``0.0.0.0:$PORT`` (default 8000),
   trusting the platform's HTTPS proxy headers.

It never seeds, resets or prepares data: that is the explicit one-time
``python -m app.seed`` / ``python -m app.demo.prepare`` step (docs/deployment.md).
Plain ``uvicorn`` (the Dockerfile's default CMD) is unchanged and never migrates.
"""

import logging
import os
from pathlib import Path

TRUE = {"1", "true", "yes", "on"}
BACKEND_DIR = Path(__file__).resolve().parents[1]

logger = logging.getLogger("app.serve")


def env_flag(name: str, environ: dict[str, str] | None = None) -> bool:
    return (environ if environ is not None else os.environ).get(name, "").strip().lower() in TRUE


def server_options(environ: dict[str, str] | None = None) -> dict:
    environ = environ if environ is not None else dict(os.environ)
    port = int(environ.get("PORT", "8000"))
    if not 1 <= port <= 65535:
        raise ValueError(f"PORT must be 1-65535, got {port}")
    return {
        "host": "0.0.0.0",
        "port": port,
        # HTTPS is terminated by the platform's load balancer.
        "proxy_headers": True,
        "forwarded_allow_ips": "*",
    }


def migrate() -> str | None:
    """Upgrade to the Alembic head; returns the resulting revision."""
    from alembic.config import Config

    from alembic import command

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")

    from alembic.script import ScriptDirectory

    return ScriptDirectory.from_config(config).get_current_head()


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s: %(message)s")
    options = server_options()
    if env_flag("MIGRATE_ON_START"):
        logger.info("MIGRATE_ON_START: upgrading the database schema before serving")
        logger.info("Schema at Alembic head %s", migrate())
    else:
        logger.info("MIGRATE_ON_START not set: skipping migrations (run alembic upgrade head as a release step)")
    uvicorn.run("app.main:app", **options)


if __name__ == "__main__":
    main()
