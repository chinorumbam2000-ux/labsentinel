"""
The EWMA detector against a database: the synthetic dynamic dataset is
ingested through the FHIR pipeline, the dynamic surveillance engine and EWMA
run over it, and selected dates are checked against hand calculations.

Runs on SQLite here and on PostgreSQL through
tests/integration/test_ewma_surveillance_postgres.py.
"""

import json
from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuditEvent, StatisticalSignal, SurveillanceSignal
from app.seed import dynamic_dataset
from app.services.fhir_ingestion import ingest_document
from app.statistics import persistence, service
from app.statistics import run as run_command
from app.statistics.types import EwmaConfig
from app.surveillance.persistence import recalculate
from app.surveillance.types import DEFAULT_SYNDROME, EngineConfig
from tests.conftest import client_for

SYNDROME = DEFAULT_SYNDROME
FIRST, LAST = date(2025, 11, 27), date(2026, 1, 20)
SALT = "test-salt"


@pytest.fixture(scope="module")
def ewma_engine(seeded_engine: Engine) -> Iterator[Engine]:
    with Session(seeded_engine) as session, session.begin():
        dynamic_dataset.load(session, salt=SALT)
        recalculate(session, SYNDROME, FIRST, LAST, EngineConfig())
        persistence.upsert_run(session, service.calculate(session, SYNDROME, EwmaConfig()))
    yield seeded_engine
    with Session(seeded_engine) as session, session.begin():
        session.execute(delete(StatisticalSignal))
        session.execute(delete(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic"))
        dynamic_dataset.remove(session)


@pytest.fixture(scope="module")
def ewma_client(ewma_engine: Engine) -> Iterator[TestClient]:
    with client_for(ewma_engine) as client:
        yield client


@pytest.fixture
def scratch(ewma_engine: Engine) -> Iterator[Session]:
    session = Session(ewma_engine)
    session.begin()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def row(session: Session, day: date, metric: str) -> StatisticalSignal:
    return session.scalars(
        select(StatisticalSignal).where(StatisticalSignal.signal_date == day, StatisticalSignal.metric == metric)
    ).one()


def f(value) -> float:
    return float(value)


# ---------------------------------------------------------------------------
# Hand-calculated validation
# ---------------------------------------------------------------------------


def test_reference_period_hand_calculated(ewma_engine: Engine) -> None:
    """
    Reference period Nov 27 - Dec 24 2025 (28 days, all with data), regional totals:
      volume      sum 1394 -> mean 1394/28 = 49.785714; sum of squared deviations 1722.7143
                  -> SD sqrt(1722.7143/27) = 7.987755
      positivity  sum of daily rates 209.6464 -> mean 7.487372 %; squared deviations 479.2977
                  -> SD sqrt(479.2977/27) = 4.213285
    """
    with Session(ewma_engine) as session:
        volume, positivity = row(session, date(2026, 1, 15), "volume"), row(session, date(2026, 1, 15), "positivity")
        assert f(volume.baseline_mean) == pytest.approx(49.7857, abs=1e-4)
        assert f(volume.baseline_stddev) == pytest.approx(7.9878, abs=1e-4)
        assert f(positivity.baseline_mean) == pytest.approx(7.4874, abs=1e-4)
        assert f(positivity.baseline_stddev) == pytest.approx(4.2133, abs=1e-4)
        reference = volume.calculation_metadata["reference"]
        assert (reference["first"], reference["last"], reference["days"]) == ("2025-11-27", "2025-12-24", 28)
        assert row(session, date(2025, 12, 10), "volume").calculation_status == "REFERENCE_PERIOD"


def test_positivity_jan_15_to_17_hand_calculated(ewma_engine: Engine) -> None:
    """
    lambda 0.25, k 3, warning 2/3; mean 7.487372, SD 4.213285; t = 15, 16, 17 updates
    (Jan 1-14 were updates 1-14; Dec 25-31 had no data).
    Jan 15: prev 7.627167, y 6/54 = 11.111111 -> 0.25 x 11.111111 + 0.75 x 7.627167 = 8.498153
            factor sqrt(0.25/1.75 x (1 - 0.75^30)) = 0.377931 -> sigma 1.592330
            UCL 7.487372 + 3 x 1.592330 = 12.264361; WL 7.487372 + 2 x 1.592330 = 10.672031 -> NORMAL
    Jan 16: prev 8.498153, y 11/62 = 17.741935 -> 4.435484 + 6.373615 = 10.809099
            UCL 12.264547, WL 10.672155 -> 10.809099 > WL: WATCH
    Jan 17: prev 10.809099, y 17/73 = 23.287671 -> 5.821918 + 8.106824 = 13.928742
            UCL 12.264652 -> 13.928742 > UCL: STATISTICAL ALERT
    """
    expected = {
        15: (7.6272, 11.1111, 8.4982, 12.2644, 10.6720, "NORMAL"),
        16: (8.4982, 17.7419, 10.8091, 12.2645, 10.6722, "WATCH"),
        17: (10.8091, 23.2877, 13.9287, 12.2647, 10.6722, "STATISTICAL_ALERT"),
    }
    with Session(ewma_engine) as session:
        for day, (previous, observed, value, ucl, warning, state) in expected.items():
            r = row(session, date(2026, 1, day), "positivity")
            assert f(r.previous_ewma) == pytest.approx(previous, abs=2e-4), day
            assert f(r.observed_value) == pytest.approx(observed, abs=1e-4), day
            assert f(r.ewma_value) == pytest.approx(value, abs=2e-4), day
            assert f(r.upper_control_limit) == pytest.approx(ucl, abs=1e-4), day
            assert f(r.warning_limit) == pytest.approx(warning, abs=1e-4), day
            assert (r.alert_state, r.calculation_metadata["update"]) == (state, day)


def test_volume_jan_16_to_18_hand_calculated(ewma_engine: Engine) -> None:
    """
    mean 49.785714, SD 7.987755
    Jan 16: prev 49.436459, y 62 -> 15.5 + 37.077344 = 52.577345; UCL 58.842522, WL 55.823586 -> NORMAL
    Jan 17: prev 52.577345, y 73 -> 18.25 + 39.433009 = 57.683008; UCL 58.842721, WL 55.823719 -> WATCH
    Jan 18: prev 57.683008, y 84 -> 21.0 + 43.262256 = 64.262256; UCL 58.842833 -> STATISTICAL ALERT
            distance to UCL 58.842833 - 64.262256 = -5.419423
    """
    with Session(ewma_engine) as session:
        for day, value, ucl, state in ((16, 52.5773, 58.8425, "NORMAL"), (17, 57.6830, 58.8427, "WATCH"),
                                       (18, 64.2623, 58.8428, "STATISTICAL_ALERT")):
            r = row(session, date(2026, 1, day), "volume")
            assert f(r.ewma_value) == pytest.approx(value, abs=1e-4)
            assert f(r.upper_control_limit) == pytest.approx(ucl, abs=1e-4)
            assert r.alert_state == state
        assert row(session, date(2026, 1, 18), "volume").calculation_metadata["distance_to_ucl"] == pytest.approx(
            -5.4194, abs=1e-4
        )


def test_reporting_gap_carries_the_ewma_forward(ewma_engine: Engine) -> None:
    with Session(ewma_engine) as session:
        gap = row(session, date(2025, 12, 28), "volume")
        assert gap.calculation_status == "NO_DATA" and gap.ewma_value is None
        assert f(gap.previous_ewma) == pytest.approx(49.7857, abs=1e-4)
        assert row(session, date(2026, 1, 1), "volume").calculation_metadata["update"] == 1


def test_in_control_january_is_normal(ewma_engine: Engine) -> None:
    with Session(ewma_engine) as session:
        for day in range(1, 15):
            for metric in ("volume", "positivity"):
                assert row(session, date(2026, 1, day), metric).alert_state == "NORMAL"


# ---------------------------------------------------------------------------
# Early detection and sensitivity
# ---------------------------------------------------------------------------


def test_early_detection_analysis(scratch: Session) -> None:
    run = service.calculate(scratch, SYNDROME, EwmaConfig())
    analysis = service.detection_analysis(run, service.dynamic_signals(scratch, SYNDROME))
    assert analysis["evaluation_from"] == "2025-12-25"
    assert analysis["composite_first"] == {
        "Watch": "2026-01-15", "Moderate": "2026-01-16", "High": "2026-01-17", "Critical": "2026-01-18",
    }
    assert analysis["ewma_first"] == {
        "volume": {"watch": "2026-01-17", "alert": "2026-01-18"},
        "positivity": {"watch": "2026-01-16", "alert": "2026-01-17"},
        "overall": {"watch": "2026-01-16", "alert": "2026-01-17"},
    }
    # EWMA's first alert: 2 days after composite Watch, same day as High, a day before Critical.
    assert analysis["lead_days"]["overall_alert"] == {"Watch": -2, "Moderate": -1, "High": 0, "Critical": 1}


def test_lambda_sensitivity_is_analysis_only(scratch: Session) -> None:
    before = scratch.scalar(select(func.count()).select_from(StatisticalSignal))
    rows = service.sensitivity(scratch, SYNDROME, (0.15, 0.20, 0.25, 0.30), EwmaConfig(), date(2026, 1, 15))
    by_lambda = {r["lambda"]: r for r in rows}
    assert by_lambda[0.15]["positivity_watch"] == "2026-01-17"  # heavier smoothing: later warning
    assert by_lambda[0.25]["positivity_watch"] == "2026-01-16"
    assert {r["positivity_alert"] for r in rows} == {"2026-01-17"}
    assert {r["volume_alert"] for r in rows} == {"2026-01-18"}
    assert all(r["positivity_stability"]["non_normal_days_before"] == 0 for r in rows)
    assert scratch.scalar(select(func.count()).select_from(StatisticalSignal)) == before  # nothing stored


# ---------------------------------------------------------------------------
# Persistence, recalculation, audit
# ---------------------------------------------------------------------------


def test_rerun_is_idempotent(scratch: Session) -> None:
    audits = scratch.scalar(select(func.count()).select_from(AuditEvent))
    report = persistence.upsert_run(scratch, service.calculate(scratch, SYNDROME, EwmaConfig()))
    assert (report.created, report.updated, report.removed, report.unchanged) == (0, 0, 0, 110)
    assert scratch.scalar(select(func.count()).select_from(StatisticalSignal)) == 110
    assert scratch.scalar(select(func.count()).select_from(AuditEvent)) == audits


def test_fhir_driven_recalculation_updates_ewma_and_audits(scratch: Session) -> None:
    # Twenty more positive HOSP-A results on Jan 16 arrive through the FHIR pipeline.
    for n in range(20):
        item = dynamic_dataset._observation(
            "HOSP-A", date(2026, 1, 16), n, 20, dynamic_dataset.TESTS_BY_INDEX[0], True, True, suffix=f"SURGE{n:02d}"
        )
        ingest_document(scratch, item.resource, salt=SALT, received_at=item.received_at)
    report = persistence.upsert_run(scratch, service.calculate(scratch, SYNDROME, EwmaConfig()))
    assert report.created == 0 and report.updated > 0
    jan16 = row(scratch, date(2026, 1, 16), "positivity")
    # 31 positives of 82: 37.80 % -> EWMA 0.25 x 37.804878 + 0.75 x 8.498153 = 15.824834 > UCL
    assert f(jan16.observed_value) == pytest.approx(37.8049, abs=1e-4)
    assert jan16.alert_state == "STATISTICAL_ALERT"
    events = scratch.scalars(select(AuditEvent).where(AuditEvent.event_type.like("statistics.ewma.%"))).all()
    kinds = {e.event_type for e in events}
    assert {"statistics.ewma.recalculated", "statistics.ewma.state_changed"} <= kinds
    changed = [e.description for e in events if e.event_type == "statistics.ewma.state_changed"]
    assert any("Positivity EWMA" in d and "2026-01-16" in d and "from Watch to Statistical Alert" in d for d in changed)
    assert not any("FHIR-PT" in e.description or "Patient/" in e.description for e in events)


def test_ewma_never_touches_the_composite(ewma_engine: Engine, ewma_client: TestClient) -> None:
    with Session(ewma_engine) as session:
        scores = [
            int(s.composite_score)
            for s in session.scalars(
                select(SurveillanceSignal)
                .where(SurveillanceSignal.mode == "dynamic", SurveillanceSignal.signal_date >= date(2026, 1, 15))
                .order_by(SurveillanceSignal.signal_date)
            )
        ]
    assert scores == [25, 54, 80, 85, 90, 90]
    assert [d["composite_score"] for d in ewma_client.get("/api/demo/days").json()] == [0, 24, 50, 74, 87]


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


def test_summary(ewma_client: TestClient) -> None:
    body = ewma_client.get("/api/statistics/ewma").json()
    assert (body["method"], body["label"]) == ("EWMA", "Experimental Statistical Surveillance")
    assert "has not been validated for production epidemiological decision-making" in body["disclaimer"]
    assert body["config"] == {"lambda": 0.25, "k": 3.0, "warning_fraction": pytest.approx(2 / 3),
                              "reference_days": 28, "min_reference_days": 21}
    assert (body["first_date"], body["monitoring_from"], body["latest_date"]) == ("2025-11-27", "2025-12-25", "2026-01-20")
    assert body["references"]["volume"]["mean"] == pytest.approx(49.7857, abs=1e-4)
    assert body["detection"]["ewma_first"]["positivity"]["alert"] == "2026-01-17"
    assert body["result_count"] == 110 and body["recalculation_available"] is True


def test_current_compares_without_combining(ewma_client: TestClient) -> None:
    latest = ewma_client.get("/api/statistics/ewma/current").json()
    assert latest["signal_date"] == "2026-01-20" and latest["overall_state"] == "STATISTICAL_ALERT"
    jan16 = ewma_client.get("/api/statistics/ewma/current", params={"date": "2026-01-16"}).json()
    assert (jan16["volume"]["alert_state"], jan16["positivity"]["alert_state"], jan16["overall_state"]) == (
        "NORMAL", "WATCH", "WATCH",
    )
    assert (jan16["composite"]["severity"], jan16["agreement"]) == ("Moderate", "NEITHER")
    jan17 = ewma_client.get("/api/statistics/ewma/current", params={"date": "2026-01-17"}).json()
    assert (jan17["composite"]["composite_score"], jan17["agreement"]) == (80.0, "BOTH_METHODS_SIGNAL")
    assert jan17["agreement_text"].startswith("LabSentinel's rule-based signal and EWMA independently")
    assert jan17["positivity"]["explanation"] == (
        "The exponentially weighted positivity signal exceeded its historical control limit."
    )
    assert "composite_score" not in jan17["positivity"]  # the two are never merged
    assert ewma_client.get("/api/statistics/ewma/current", params={"date": "2027-01-01"}).status_code == 404


def test_history_filters(ewma_client: TestClient) -> None:
    rows = ewma_client.get("/api/statistics/ewma/history", params={"metric": "volume"}).json()
    assert len(rows) == 55 and {r["metric"] for r in rows} == {"volume"}
    window = ewma_client.get(
        "/api/statistics/ewma/history", params={"date_from": "2026-01-17", "date_to": "2026-01-18"}
    ).json()
    assert [(r["signal_date"], r["metric"], r["alert_state"]) for r in window] == [
        ("2026-01-17", "positivity", "STATISTICAL_ALERT"), ("2026-01-17", "volume", "WATCH"),
        ("2026-01-18", "positivity", "STATISTICAL_ALERT"), ("2026-01-18", "volume", "STATISTICAL_ALERT"),
    ]
    assert "FHIR-PT" not in json.dumps(rows)
    assert ewma_client.get("/api/statistics/ewma/history", params={"metric": "score"}).status_code == 422
    assert ewma_client.get(
        "/api/statistics/ewma/history", params={"date_from": "2026-01-18", "date_to": "2026-01-01"}
    ).status_code == 422


def test_recalculate_endpoint(ewma_client: TestClient, ewma_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    body = ewma_client.post("/api/statistics/ewma/recalculate", json={}).json()
    assert (body["created"], body["updated"], body["unchanged"]) == (0, 0, 110)
    assert ewma_client.post("/api/statistics/ewma/recalculate", json={"lambda": 0.1}).status_code == 422
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()  # the request above cached the development settings
    with client_for(ewma_engine) as production:
        assert production.post("/api/statistics/ewma/recalculate", json={}).status_code == 404
        assert production.get("/api/statistics/ewma").json()["recalculation_available"] is False


def test_run_command_refuses_production(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    assert run_command.main([]) == 1
    assert "Refusing" in capsys.readouterr().out
