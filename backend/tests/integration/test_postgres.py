"""
Schema and persistence behaviour on a real PostgreSQL database.

Complements the SQLite unit tests with what only PostgreSQL can show: JSONB,
BIGINT identities, timestamptz defaults, enforced VARCHAR lengths and the
exact PostgreSQL error raised for each violated constraint.
"""

import time
from datetime import date
from decimal import Decimal

import psycopg.errors
import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, inspect, make_url, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.database import Base
from app.main import create_app
from app.models import LabObservation, SurveillanceSignal
from tests.test_models import make_facility, make_observation, make_signal

pytestmark = pytest.mark.postgres


def test_migration_is_at_head(pg_engine: Engine) -> None:
    with pg_engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0001"


def test_schema_matches_models(pg_engine: Engine) -> None:
    with pg_engine.connect() as connection:
        context = MigrationContext.configure(
            connection, opts={"compare_type": True, "compare_server_default": True}
        )
        assert compare_metadata(context, Base.metadata) == []


def test_postgresql_specific_column_types(pg_engine: Engine) -> None:
    inspector = inspect(pg_engine)

    def column(table: str, name: str) -> dict:
        return next(c for c in inspector.get_columns(table) if c["name"] == name)

    assert isinstance(column("surveillance_signal", "affected_geographies")["type"], JSONB)
    assert column("lab_observation", "id")["type"].python_type is int
    assert str(column("lab_observation", "id")["type"]) == "BIGINT"
    assert column("facility", "created_at")["type"].timezone is True
    assert "now()" in column("facility", "created_at")["default"]


def test_facility_to_observation_round_trip(pg_session: Session) -> None:
    facility = make_facility()
    pg_session.add(make_observation(facility, "obs-001"))
    pg_session.commit()

    pg_session.expunge_all()
    observation = pg_session.scalars(select(LabObservation)).one()

    assert observation.facility.facility_code == "HOSP-A"
    assert [o.source_observation_id for o in observation.facility.observations] == ["obs-001"]
    assert observation.status == "final"
    assert observation.effective_datetime.tzinfo is not None
    assert observation.created_at.tzinfo is not None


def test_affected_geographies_is_queryable_jsonb(pg_session: Session) -> None:
    pg_session.add_all(
        [
            make_signal(affected_geographies=["01604", "01605"]),
            make_signal(signal_date=date(2025, 11, 6), affected_geographies=["01545"]),
        ]
    )
    pg_session.commit()

    matches = pg_session.scalar(
        select(func.count())
        .select_from(SurveillanceSignal)
        .where(SurveillanceSignal.affected_geographies.op("@>")(text("'[\"01604\"]'::jsonb")))
    )
    assert matches == 1


def test_updated_at_advances_on_update(pg_session: Session) -> None:
    facility = make_facility()
    pg_session.add(facility)
    pg_session.commit()
    before = facility.updated_at

    time.sleep(0.01)
    facility.city = "Shrewsbury"
    pg_session.commit()
    pg_session.refresh(facility)

    assert facility.updated_at > before
    assert facility.created_at <= before


def _assert_rejected(session: Session, error: type[Exception]) -> None:
    with pytest.raises(DBAPIError) as excinfo:
        session.commit()
    session.rollback()
    assert isinstance(excinfo.value.orig, error), type(excinfo.value.orig)


def test_duplicate_source_record_is_rejected(pg_session: Session) -> None:
    facility = make_facility()
    pg_session.add_all([make_observation(facility, "obs-001"), make_observation(facility, "obs-001")])
    _assert_rejected(pg_session, psycopg.errors.UniqueViolation)


def test_duplicate_facility_code_is_rejected(pg_session: Session) -> None:
    pg_session.add_all([make_facility("HOSP-A"), make_facility("HOSP-A", name="Other")])
    _assert_rejected(pg_session, psycopg.errors.UniqueViolation)


def test_observation_for_missing_facility_is_rejected(pg_session: Session) -> None:
    pg_session.add(make_observation(None, facility_id=999_999))
    _assert_rejected(pg_session, psycopg.errors.ForeignKeyViolation)


def test_facility_with_observations_cannot_be_deleted(pg_session: Session) -> None:
    facility = make_facility()
    pg_session.add(make_observation(facility))
    pg_session.commit()

    pg_session.delete(facility)
    # ON DELETE RESTRICT, not the ORM nulling facility_id.
    _assert_rejected(pg_session, psycopg.errors.ForeignKeyViolation)


@pytest.mark.parametrize(
    ("build", "error"),
    [
        (lambda: make_facility(country_code="U"), psycopg.errors.CheckViolation),
        # PostgreSQL enforces VARCHAR length before the CHECK is evaluated.
        (lambda: make_facility(country_code="USA"), psycopg.errors.StringDataRightTruncation),
        (lambda: make_observation(make_facility(), status="done"), psycopg.errors.CheckViolation),
        (lambda: make_observation(make_facility(), result_type="blob"), psycopg.errors.CheckViolation),
        (lambda: make_signal(severity="Severe"), psycopg.errors.CheckViolation),
        (lambda: make_signal(status="RESOLVED"), psycopg.errors.CheckViolation),
        (lambda: make_signal(data_confidence_level="Medium"), psycopg.errors.CheckViolation),
        (lambda: make_signal(composite_score=Decimal("150")), psycopg.errors.CheckViolation),
        (lambda: make_signal(data_confidence_score=Decimal("-1")), psycopg.errors.CheckViolation),
        (lambda: make_signal(positive_count=500, test_volume=420), psycopg.errors.CheckViolation),
    ],
    ids=[
        "country-code-too-short",
        "country-code-too-long",
        "observation-status",
        "observation-result-type",
        "signal-severity",
        "signal-status",
        "signal-confidence-level",
        "signal-composite-score-range",
        "signal-confidence-score-range",
        "signal-positives-exceed-volume",
    ],
)
def test_constraint_violations_are_rejected(
    pg_session: Session, build, error: type[Exception]
) -> None:
    pg_session.add(build())
    _assert_rejected(pg_session, error)


def test_database_health_endpoint_reports_connected(
    pg_url: str, pg_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", pg_url)

    with TestClient(create_app()) as client:
        response = client.get("/api/health/database")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "connected"}
    parsed = make_url(pg_url)
    for secret in (parsed.password, parsed.username, parsed.host):
        assert not secret or secret not in response.text


def test_live_observation_table_has_no_direct_identifier_columns(pg_engine: Engine) -> None:
    columns = {c["name"] for c in inspect(pg_engine).get_columns("lab_observation")}

    assert not columns & {"patient_name", "name", "address", "dob", "birth_date", "ssn", "mrn"}
