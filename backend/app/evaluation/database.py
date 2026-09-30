"""
The evaluation database: a throwaway SQLite file per realization.

Evaluation never touches the application's PostgreSQL database, the frozen
demonstration, the dynamic development dataset, the FHIR fixtures or the SMART
sandbox facility. A template is built once (the real Alembic migrations plus
the three fictional EVAL facilities) and copied for every realization, which
is then deleted.
"""

import shutil
import tempfile
from pathlib import Path

from alembic.config import Config
from sqlalchemy import Engine, create_engine, event, insert
from sqlalchemy.orm import Session

from alembic import command
from app.evaluation.scenarios import STANDARD
from app.models import Facility

BACKEND_DIR = Path(__file__).resolve().parents[2]


def sqlite_engine(path: Path) -> Engine:
    engine = create_engine(f"sqlite:///{path.as_posix()}")

    @event.listens_for(engine, "connect")
    def _connect(dbapi_connection, _record) -> None:  # type: ignore[no-untyped-def]
        dbapi_connection.execute("PRAGMA foreign_keys = ON")
        dbapi_connection.isolation_level = None  # let SQLAlchemy manage transactions

    @event.listens_for(engine, "begin")
    def _begin(connection) -> None:  # type: ignore[no-untyped-def]
        connection.exec_driver_sql("BEGIN")

    return engine


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.attributes["configure_logger"] = False
    return config


def build_template(directory: Path) -> Path:
    """Migrate an empty SQLite database and add the EVAL facilities."""
    path = directory / "evaluation-template.db"
    engine = sqlite_engine(path)
    config = _alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    with Session(engine) as session, session.begin():
        insert_facilities(session)
    engine.dispose()
    return path


def insert_facilities(session: Session) -> None:
    """The three fictional evaluation facilities."""
    session.execute(insert(Facility), [
        {
            "facility_code": f.code,
            "name": f.name,
            "vendor": "Synthetic evaluation facility",
            "city": "Evaluation",
            "postal_code": f.postal_code,
            "subregion": "Evaluation County",
            "region": "Evaluation Region",
            "country_code": "ZZ",
            "active": True,
            "participation": "participating",
        }
        for f in STANDARD
    ])


class Workspace:
    """A temporary directory holding the template and per-realization copies."""

    def __init__(self) -> None:
        self._dir = tempfile.TemporaryDirectory(prefix="labsentinel-eval-")
        self.path = Path(self._dir.name)
        self.template = build_template(self.path)

    def fresh(self, name: str) -> Path:
        target = self.path / f"{name}.db"
        shutil.copyfile(self.template, target)
        return target

    def close(self) -> None:
        self._dir.cleanup()
