"""
Capstone presentation tooling: environment gating, the readiness checklist,
the demo reset and its safeguards, and GET /api/readiness.

Runs on SQLite here and on PostgreSQL through
tests/integration/test_demo_tooling_postgres.py. Synthetic data only; no
detector, parameter, frozen demonstration or evaluation artifact changes.
"""

import json
import shutil
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import Engine, delete, func, select, update
from sqlalchemy.orm import Session

from app.config import DEVELOPMENT_SALT, Settings
from app.demo import readiness
from app.demo import reset as reset_module
from app.demo.reset import ResetRefused, frozen_snapshot, plan, reset
from app.fhir.examples import EXAMPLES_BY_ID
from app.fhir.parser import parse_json
from app.models import AuditEvent, LabObservation, StatisticalSignal, SurveillanceSignal
from app.seed import dynamic_dataset
from app.services.fhir_ingestion import ingest_document
from app.statistics import cusum_persistence, cusum_service, persistence, service
from app.statistics.cusum import CusumConfig
from app.statistics.types import EwmaConfig
from app.surveillance.persistence import recalculate
from app.surveillance.types import DEFAULT_SYNDROME, EngineConfig
from tests.conftest import client_for

FIRST, LAST = date(2025, 11, 27), date(2026, 1, 20)
BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def demo_engine(seeded_engine: Engine) -> Iterator[Engine]:
    """The seeded database plus the dynamic dataset and all three detectors, as after `prepare`."""
    with Session(seeded_engine) as session, session.begin():
        dynamic_dataset.load(session)
        recalculate(session, DEFAULT_SYNDROME, FIRST, LAST, EngineConfig())
        persistence.upsert_run(session, service.calculate(session, DEFAULT_SYNDROME, EwmaConfig()))
        cusum_persistence.upsert_run(session, cusum_service.calculate(session, DEFAULT_SYNDROME, CusumConfig()))
    yield seeded_engine
    with Session(seeded_engine) as session, session.begin():
        session.execute(delete(StatisticalSignal))
        session.execute(delete(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic"))
        session.execute(delete(LabObservation).where(LabObservation.source_system.like("fhir:%")))


@pytest.fixture
def scratch(demo_engine: Engine) -> Iterator[Session]:
    """A session whose changes are always rolled back."""
    session = Session(demo_engine)
    session.begin()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def ingest(session: Session, example_id: str) -> None:
    document = parse_json(EXAMPLES_BY_ID[example_id].content().encode("utf-8"))
    ingest_document(session, document, salt=DEVELOPMENT_SALT)


def by_key(checks: list[readiness.Check]) -> dict[str, readiness.Check]:
    return {c.key: c for c in checks}


# --------------------------------------------------------------------------
# Environment gating
# --------------------------------------------------------------------------


def test_development_only_endpoints_by_environment() -> None:
    assert Settings(app_env="development").demo_endpoints_available
    assert not Settings(app_env="test").demo_endpoints_available
    assert not Settings(app_env="production").demo_endpoints_available
    assert not Settings(app_env="presentation").demo_endpoints_available
    presentation = Settings(app_env="presentation", demo_endpoints_enabled=True, fhir_pseudonym_salt="a-private-salt")
    assert presentation.demo_endpoints_available


def test_unsafe_demo_endpoint_configurations_are_rejected() -> None:
    with pytest.raises(ValidationError, match="not permitted with APP_ENV=production"):
        Settings(app_env="production", demo_endpoints_enabled=True)
    with pytest.raises(ValidationError, match="its own FHIR_PSEUDONYM_SALT"):
        Settings(app_env="presentation", demo_endpoints_enabled=True)


# --------------------------------------------------------------------------
# Readiness
# --------------------------------------------------------------------------


def test_readiness_checklist_on_a_prepared_database(scratch: Session) -> None:
    checks = readiness.run_checks(scratch, Settings())
    status = {c.key: c.status for c in checks}
    assert status == {
        "environment": "PASS", "database": "PASS", "migrations": "PASS", "seed": "PASS",
        "facilities": "PASS", "fhir": "PASS", "dynamic": "PASS", "ewma": "PASS", "cusum": "PASS",
        "evaluation": "PASS", "smart": "WARN",
    }
    assert readiness.overall(checks) == "READY"
    assert "0 / 24 / 50 / 74 / 87" in by_key(checks)["seed"].detail


def test_readiness_fhir_dry_run_leaves_nothing_behind(scratch: Session) -> None:
    before = scratch.scalar(select(func.count()).select_from(LabObservation))
    audits = scratch.scalar(select(func.count()).select_from(AuditEvent))
    assert readiness.check_fhir(scratch, Settings()).status == "PASS"
    assert scratch.scalar(select(func.count()).select_from(LabObservation)) == before
    assert scratch.scalar(select(func.count()).select_from(AuditEvent)) == audits


def test_readiness_reports_leftovers_and_problems(scratch: Session) -> None:
    ingest(scratch, "influenza-a-positive")
    dynamic = readiness.check_dynamic(scratch)
    assert dynamic.status == "WARN" and "1 FHIR observation(s) left" in dynamic.detail

    scratch.execute(delete(StatisticalSignal).where(StatisticalSignal.method == "CUSUM"))
    assert readiness.check_statistical(scratch, "CUSUM").status == "FAIL"

    scratch.execute(update(SurveillanceSignal).where(SurveillanceSignal.mode == "demo").values(composite_score=1))
    frozen = readiness.check_frozen_demo(scratch)
    assert frozen.status == "FAIL" and "python -m app.seed" in frozen.detail
    assert readiness.overall(readiness.run_checks(scratch, Settings())) == "NOT READY"


def test_readiness_output_holds_no_secrets(scratch: Session) -> None:
    settings = Settings(database_url="postgresql+psycopg://someone:hunter2@db.example:5432/labsentinel",
                        fhir_pseudonym_salt="a-private-salt")
    text = json.dumps(readiness.as_dict(readiness.run_checks(scratch, settings), settings))
    for secret in ("hunter2", "someone", "db.example", "a-private-salt", DEVELOPMENT_SALT, "postgresql"):
        assert secret not in text


def test_evaluation_artifacts_are_checked_for_drift(tmp_path: Path) -> None:
    source = BACKEND / "evaluation-results"
    assert readiness.check_evaluation(Settings()).status == "PASS"

    crlf = tmp_path / "crlf"
    crlf.mkdir()
    for name in readiness.EVALUATION_ARTIFACTS:
        text = (source / name).read_bytes().replace(b"\r\n", b"\n")
        (crlf / name).write_bytes(text.replace(b"\n", b"\r\n"))
    assert readiness.check_evaluation(Settings(evaluation_results_dir=str(crlf))).status == "PASS"

    drift = tmp_path / "drift"
    shutil.copytree(source, drift)
    report = drift / "evaluation-report.md"
    report.write_text(report.read_text(encoding="utf-8").replace("710/900", "720/900"), encoding="utf-8")
    check = readiness.check_evaluation(Settings(evaluation_results_dir=str(drift)))
    assert check.status == "FAIL" and "evaluation-report.md" in check.detail

    (drift / "evaluation-summary.csv").unlink()
    assert "Missing" in readiness.check_evaluation(Settings(evaluation_results_dir=str(drift))).detail


# --------------------------------------------------------------------------
# Reset
# --------------------------------------------------------------------------


def test_reset_restores_the_clean_presentation_state(scratch: Session) -> None:
    ingest(scratch, "influenza-a-positive")
    ingest(scratch, "respiratory-panel-bundle")
    frozen = frozen_snapshot(scratch)
    before = plan(scratch)
    assert before.demo_observations == 4
    assert before.dataset_observations == len(dynamic_dataset.planned_observations())

    report = reset(scratch)

    assert report.demo_observations_removed == 4
    assert report.dataset_removed == report.dataset_created == len(dynamic_dataset.planned_observations())
    assert report.dataset_rejected == 0
    assert frozen_snapshot(scratch) == frozen == ((0, 24, 50, 74, 87), 699, 5)
    assert plan(scratch).demo_observations == 0
    # The documented clean story (backend/README.md, dynamic dataset): Jan 15-20.
    scores = dict(scratch.execute(
        select(SurveillanceSignal.signal_date, SurveillanceSignal.composite_score)
        .where(SurveillanceSignal.mode == "dynamic", SurveillanceSignal.signal_date >= date(2026, 1, 15))
    ).all())
    assert [int(scores[date(2026, 1, d)]) for d in range(15, 21)] == [25, 54, 80, 85, 90, 90]
    assert report.ewma_results == report.cusum_results == 110
    assert scratch.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.event_type == "demo.reset")) == 1
    assert readiness.overall(readiness.run_checks(scratch, Settings())) == "READY"


@pytest.mark.parametrize("environment", ["test", "production"])
def test_reset_refuses_other_environments(scratch: Session, monkeypatch: pytest.MonkeyPatch, environment: str) -> None:
    monkeypatch.setattr(reset_module, "get_settings", lambda: Settings(app_env=environment))
    with pytest.raises(ResetRefused, match=f"APP_ENV={environment}"):
        reset(scratch)


def test_reset_refuses_a_database_whose_frozen_demo_differs(scratch: Session) -> None:
    scratch.execute(update(SurveillanceSignal).where(SurveillanceSignal.mode == "demo").values(composite_score=1))
    rows = scratch.scalar(select(func.count()).select_from(LabObservation))
    with pytest.raises(ResetRefused, match="Frozen Day 1-5 demonstration"):
        reset(scratch)
    assert scratch.scalar(select(func.count()).select_from(LabObservation)) == rows


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------


def test_readiness_endpoint_development_only(demo_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    with client_for(demo_engine) as client:
        response = client.get("/api/readiness")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "READY" and body["environment"] == "development"
        assert [c["key"] for c in body["checks"]][:3] == ["environment", "database", "migrations"]
        assert client.post("/api/readiness").status_code == 405

        for settings in (Settings(app_env="production"), Settings(app_env="presentation"), Settings(app_env="test")):
            monkeypatch.setattr("app.api.readiness.get_settings", lambda s=settings: s)
            assert client.get("/api/readiness").status_code == 404


# --------------------------------------------------------------------------
# Presentation evaluation summary
# --------------------------------------------------------------------------


def test_evaluation_summary_document_matches_the_committed_artifact() -> None:
    from app.demo import evaluation_summary

    text = evaluation_summary.render(json.loads(evaluation_summary.ARTIFACT.read_text(encoding="utf-8")))
    committed = evaluation_summary.DOCUMENT.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert committed == text
    assert "710/900 = 78.9 % (76.1–81.4)" in text
    assert "the highest false-alert burden here (10.55 per 100 normal days)" in text
    assert "best" not in text.replace("no method is declared best", "")
