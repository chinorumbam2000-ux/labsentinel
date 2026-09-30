"""
The CUSUM detector against a database, beside EWMA and the composite.

The synthetic dynamic dataset is ingested through the FHIR pipeline; the
dynamic surveillance engine, EWMA and CUSUM run over it; selected dates are
checked against hand calculations. Runs on SQLite here and on PostgreSQL
through tests/integration/test_cusum_surveillance_postgres.py.
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
from app.statistics import cusum_persistence, cusum_service, persistence, service
from app.statistics import run as run_command
from app.statistics.cusum import CusumConfig
from app.statistics.types import EwmaConfig
from app.surveillance.persistence import recalculate
from app.surveillance.types import DEFAULT_SYNDROME, EngineConfig
from tests.conftest import client_for

SYNDROME = DEFAULT_SYNDROME
FIRST, LAST = date(2025, 11, 27), date(2026, 1, 20)
ONSET = date(2026, 1, 15)
SALT = "test-salt"


@pytest.fixture(scope="module")
def cusum_engine(seeded_engine: Engine) -> Iterator[Engine]:
    with Session(seeded_engine) as session, session.begin():
        dynamic_dataset.load(session, salt=SALT)
        recalculate(session, SYNDROME, FIRST, LAST, EngineConfig())
        persistence.upsert_run(session, service.calculate(session, SYNDROME, EwmaConfig()))
        cusum_persistence.upsert_run(session, cusum_service.calculate(session, SYNDROME, CusumConfig()))
    yield seeded_engine
    with Session(seeded_engine) as session, session.begin():
        session.execute(delete(StatisticalSignal))
        session.execute(delete(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic"))
        dynamic_dataset.remove(session)


@pytest.fixture(scope="module")
def cusum_client(cusum_engine: Engine) -> Iterator[TestClient]:
    with client_for(cusum_engine) as client:
        yield client


@pytest.fixture
def scratch(cusum_engine: Engine) -> Iterator[Session]:
    session = Session(cusum_engine)
    session.begin()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def row(session: Session, day: date, metric: str, method: str = "CUSUM") -> StatisticalSignal:
    return session.scalars(
        select(StatisticalSignal).where(
            StatisticalSignal.method == method, StatisticalSignal.signal_date == day, StatisticalSignal.metric == metric
        )
    ).one()


def f(value) -> float:
    return float(value)


# ---------------------------------------------------------------------------
# Hand-calculated validation
# ---------------------------------------------------------------------------


def test_baseline_is_shared_with_ewma(cusum_engine: Engine) -> None:
    with Session(cusum_engine) as session:
        for metric in ("volume", "positivity"):
            c, e = row(session, date(2026, 1, 15), metric), row(session, date(2026, 1, 15), metric, "EWMA")
            assert (c.baseline_mean, c.baseline_stddev) == (e.baseline_mean, e.baseline_stddev)
            assert c.calculation_metadata["reference"] == e.calculation_metadata["reference"]
        assert row(session, date(2025, 12, 10), "volume").calculation_status == "REFERENCE_PERIOD"
        assert row(session, date(2025, 12, 28), "volume").calculation_status == "NO_DATA"


def test_positivity_jan_13_to_17_hand_calculated(cusum_engine: Engine) -> None:
    """
    mean 7.487372 %, SD 4.213285 (reference Nov 27 - Dec 24, shared with EWMA); k 0.5, h 5
    Jan 13: y 5/48  = 10.416667 -> z 0.695252;  C = max(0, 0 + 0.695252 - 0.5)          = 0.195252  NORMAL (accumulating)
    Jan 14: y 3/47  =  6.382979 -> z -0.262122; C = max(0, 0.195252 - 0.262122 - 0.5)   = 0         NORMAL (reset)
    Jan 15: y 6/54  = 11.111111 -> z 0.860075;  C = 0 + 0.860075 - 0.5                  = 0.360075  NORMAL (accumulating)
    Jan 16: y 11/62 = 17.741935 -> z 2.433864;  C = 0.360075 + 2.433864 - 0.5           = 2.293939  NORMAL (accumulating)
    Jan 17: y 17/73 = 23.287671 -> z 3.750114;  C = 2.293939 + 3.750114 - 0.5           = 5.544053  >= 5: STATISTICAL ALERT
    """
    expected = {
        13: (10.4167, 0.6953, 0.0, 0.1953, "NORMAL"),
        14: (6.3830, -0.2621, 0.1953, 0.0, "NORMAL"),
        15: (11.1111, 0.8601, 0.0, 0.3601, "NORMAL"),
        16: (17.7419, 2.4339, 0.3601, 2.2939, "NORMAL"),
        17: (23.2877, 3.7501, 2.2939, 5.5441, "STATISTICAL_ALERT"),
    }
    with Session(cusum_engine) as session:
        for day, (observed, z, previous, value, state) in expected.items():
            r = row(session, date(2026, 1, day), "positivity")
            assert f(r.observed_value) == pytest.approx(observed, abs=1e-4), day
            assert f(r.z_score) == pytest.approx(z, abs=1e-4), day
            assert f(r.previous_cusum) == pytest.approx(previous, abs=1e-4), day
            assert f(r.cusum_value) == pytest.approx(value, abs=1e-4), day
            assert (r.alert_state, f(r.cusum_k), f(r.cusum_h)) == (state, 0.5, 5.0)
        jan17 = row(session, date(2026, 1, 17), "positivity").calculation_metadata
        assert jan17["increment"] == pytest.approx(3.2501, abs=1e-4)
        assert jan17["distance_to_limit"] == pytest.approx(-0.5441, abs=1e-4)


def test_volume_jan_15_to_18_hand_calculated(cusum_engine: Engine) -> None:
    """
    mean 49.785714, SD 7.987755
    Jan 15: y 54 -> z 0.527593; C = 0.027593         NORMAL
    Jan 16: y 62 -> z 1.529126; C = 1.056720         NORMAL
    Jan 17: y 73 -> z 2.906234; C = 3.462954         NORMAL (0.69 h: not yet "approaching")
    Jan 18: y 84 -> z 4.283342; C = 7.246296 >= 5   STATISTICAL ALERT
    """
    with Session(cusum_engine) as session:
        for day, (value, state) in {15: (0.0276, "NORMAL"), 16: (1.0567, "NORMAL"), 17: (3.4630, "NORMAL"),
                                    18: (7.2463, "STATISTICAL_ALERT")}.items():
            r = row(session, date(2026, 1, day), "volume")
            assert f(r.cusum_value) == pytest.approx(value, abs=1e-4)
            assert r.alert_state == state
        assert row(session, date(2026, 1, 17), "volume").calculation_metadata["approaching_limit"] is False


def test_no_false_alerts_in_control(cusum_engine: Engine, scratch: Session) -> None:
    with Session(cusum_engine) as session:
        early = session.scalar(
            select(func.count()).select_from(StatisticalSignal).where(
                StatisticalSignal.method == "CUSUM", StatisticalSignal.signal_date < ONSET,
                StatisticalSignal.alert_state == "STATISTICAL_ALERT",
            )
        )
    assert early == 0
    run = cusum_service.calculate(scratch, SYNDROME, CusumConfig())
    check = cusum_service.reference_check(run)
    # In-sample over the in-control history: the sums stay well below h.
    assert check["volume"] == {"days": 28, "alert_days": 0, "max_cusum": pytest.approx(1.6827, abs=1e-4)}
    assert check["positivity"] == {"days": 28, "alert_days": 0, "max_cusum": pytest.approx(2.9972, abs=1e-4)}


# ---------------------------------------------------------------------------
# Timing, sensitivity
# ---------------------------------------------------------------------------


def test_detection_timing_and_lead_lag(scratch: Session) -> None:
    run = cusum_service.calculate(scratch, SYNDROME, CusumConfig())
    ewma_run = service.calculate(scratch, SYNDROME, EwmaConfig())
    analysis = cusum_service.detection_analysis(run, service.dynamic_signals(scratch, SYNDROME), ewma_run.points)
    assert analysis["cusum_first"] == {"volume": "2026-01-18", "positivity": "2026-01-17", "overall": "2026-01-17"}
    assert analysis["composite_first"]["High"] == "2026-01-17" and analysis["composite_first"]["Critical"] == "2026-01-18"
    assert analysis["ewma_first"]["positivity"]["alert"] == "2026-01-17"
    assert analysis["lead_days"] == {
        "volume": {"composite_high": -1, "composite_critical": 0, "ewma_alert": 0},
        "positivity": {"composite_high": 0, "composite_critical": 1, "ewma_alert": 0},
        "overall": {"composite_high": 0, "composite_critical": 1, "ewma_alert": 0},
    }


def test_parameter_sensitivity_is_analysis_only(scratch: Session) -> None:
    before = scratch.scalar(select(func.count()).select_from(StatisticalSignal))
    rows = cusum_service.sensitivity(scratch, SYNDROME, (0.25, 0.5, 0.75), (4.0, 5.0, 6.0), CusumConfig(), ONSET)
    grid = {(r["k"], r["h"]): r for r in rows}
    assert len(rows) == 9
    assert (grid[(0.25, 4.0)]["volume_alert"], grid[(0.25, 4.0)]["positivity_alert"]) == ("2026-01-17", "2026-01-17")
    assert (grid[(0.5, 5.0)]["volume_alert"], grid[(0.5, 5.0)]["positivity_alert"]) == ("2026-01-18", "2026-01-17")
    assert grid[(0.75, 6.0)]["positivity_alert"] == "2026-01-18"
    assert all(r["false_alerts_before_onset"] == {"volume": 0, "positivity": 0} for r in rows)
    assert scratch.scalar(select(func.count()).select_from(StatisticalSignal)) == before


# ---------------------------------------------------------------------------
# Persistence, recalculation, audit, independence
# ---------------------------------------------------------------------------


def test_rerun_is_idempotent_and_leaves_ewma_alone(scratch: Session) -> None:
    ewma_before = {(r.signal_date, r.metric): r.ewma_value for r in scratch.scalars(
        select(StatisticalSignal).where(StatisticalSignal.method == "EWMA"))}
    audits = scratch.scalar(select(func.count()).select_from(AuditEvent))
    report = cusum_persistence.upsert_run(scratch, cusum_service.calculate(scratch, SYNDROME, CusumConfig()))
    assert (report.created, report.updated, report.removed, report.unchanged) == (0, 0, 0, 110)
    assert scratch.scalar(select(func.count()).select_from(AuditEvent)) == audits
    ewma_after = {(r.signal_date, r.metric): r.ewma_value for r in scratch.scalars(
        select(StatisticalSignal).where(StatisticalSignal.method == "EWMA"))}
    assert ewma_after == ewma_before and len(ewma_after) == 110


def test_fhir_driven_recalculation_updates_cusum_and_audits(scratch: Session) -> None:
    # Twenty more positive HOSP-A results on Jan 16 arrive through the FHIR pipeline.
    for n in range(20):
        item = dynamic_dataset._observation(
            "HOSP-A", date(2026, 1, 16), n, 20, dynamic_dataset.TESTS_BY_INDEX[0], True, True, suffix=f"SURGE{n:02d}"
        )
        ingest_document(scratch, item.resource, salt=SALT, received_at=item.received_at)
    report = cusum_persistence.upsert_run(scratch, cusum_service.calculate(scratch, SYNDROME, CusumConfig()))
    assert report.created == 0 and report.updated > 0
    # 31 / 82 = 37.804878 % -> z 7.195693; C = 0.360075 + 7.195693 - 0.5 = 7.055768 >= 5
    jan16 = row(scratch, date(2026, 1, 16), "positivity")
    assert f(jan16.cusum_value) == pytest.approx(7.0558, abs=1e-4) and jan16.alert_state == "STATISTICAL_ALERT"
    events = scratch.scalars(select(AuditEvent).where(AuditEvent.event_type.like("statistics.cusum.%"))).all()
    assert {"statistics.cusum.recalculated", "statistics.cusum.state_changed"} <= {e.event_type for e in events}
    changed = [e.description for e in events if e.event_type == "statistics.cusum.state_changed"]
    assert any("Positivity CUSUM" in d and "2026-01-16" in d and "from Normal to Statistical Alert" in d for d in changed)
    assert not any("FHIR-PT" in e.description or "Patient/" in e.description for e in events)


def test_alert_to_normal_is_audited(scratch: Session) -> None:
    """
    Remove Jan 17's 17 positive results (a correction, say): positivity that day is 0 / 56 = 0 %,
    z = (0 - 7.487372) / 4.213285 = -1.777087, C = max(0, 2.293939 - 1.777087 - 0.5) = 0.016852: NORMAL.
    Jan 18 (22/84 = 26.190476 %, z 4.439079) then only reaches 0.016852 + 4.439079 - 0.5 = 3.955931:
    NORMAL too. Both were STATISTICAL ALERT.
    """
    from app.models import LabObservation

    scratch.execute(delete(LabObservation).where(
        LabObservation.source_system.like(dynamic_dataset.SOURCE_PREFIX + "%"),
        LabObservation.source_observation_id.like("DYN-%-20260117-%"),
        LabObservation.result_value == "Positive",
    ))
    report = cusum_persistence.upsert_run(scratch, cusum_service.calculate(scratch, SYNDROME, CusumConfig()))
    assert report.created == 0 and report.removed == 0
    assert f(row(scratch, date(2026, 1, 17), "positivity").cusum_value) == pytest.approx(0.0168, abs=1e-4)
    assert f(row(scratch, date(2026, 1, 18), "positivity").cusum_value) == pytest.approx(3.9560, abs=1e-4)
    assert row(scratch, date(2026, 1, 17), "positivity").alert_state == "NORMAL"
    changes = [e.description for e in scratch.scalars(
        select(AuditEvent).where(AuditEvent.event_type == "statistics.cusum.state_changed"))]
    for day in ("2026-01-17", "2026-01-18"):
        assert any(f"Positivity CUSUM for {SYNDROME} on {day} changed from Statistical Alert to Normal" in d for d in changes)


def test_cusum_never_touches_composite_or_demo(cusum_client: TestClient, cusum_engine: Engine) -> None:
    with Session(cusum_engine) as session:
        scores = [int(s.composite_score) for s in session.scalars(
            select(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic", SurveillanceSignal.signal_date >= ONSET)
            .order_by(SurveillanceSignal.signal_date))]
    assert scores == [25, 54, 80, 85, 90, 90]
    assert [d["composite_score"] for d in cusum_client.get("/api/demo/days").json()] == [0, 24, 50, 74, 87]
    ewma = cusum_client.get("/api/statistics/ewma").json()
    assert ewma["result_count"] == 110 and ewma["detection"]["ewma_first"]["positivity"]["alert"] == "2026-01-17"


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


def test_summary(cusum_client: TestClient) -> None:
    body = cusum_client.get("/api/statistics/cusum").json()
    assert (body["method"], body["label"]) == ("CUSUM", "Experimental Statistical Surveillance")
    assert "has not been epidemiologically validated for production decision-making" in body["disclaimer"]
    assert body["config"] == {"k": 0.5, "h": 5.0, "approaching_fraction": 0.75}
    assert body["references"]["positivity"]["mean"] == pytest.approx(7.4874, abs=1e-4)
    assert (body["monitoring_from"], body["latest_date"], body["result_count"]) == ("2025-12-25", "2026-01-20", 110)
    assert body["detection"]["cusum_first"]["overall"] == "2026-01-17"
    assert body["detection"]["reference_check"]["volume"]["alert_days"] == 0
    assert len(body["detector_set"]) == 3


def test_current_and_history(cusum_client: TestClient) -> None:
    jan17 = cusum_client.get("/api/statistics/cusum/current", params={"date": "2026-01-17"}).json()
    assert (jan17["volume"]["alert_state"], jan17["positivity"]["alert_state"], jan17["overall_state"]) == (
        "NORMAL", "STATISTICAL_ALERT", "STATISTICAL_ALERT",
    )
    assert jan17["positivity"]["explanation"] == (
        "Recent positivity values have accumulated enough sustained upward deviation from the historical "
        "baseline to cross the CUSUM decision limit."
    )
    assert jan17["positivity"]["previous_cusum"] == pytest.approx(2.2939, abs=1e-4)
    rows = cusum_client.get("/api/statistics/cusum/history", params={"metric": "positivity"}).json()
    assert len(rows) == 55 and {r["method"] for r in rows} == {"CUSUM"}
    assert "FHIR-PT" not in json.dumps(rows)
    assert cusum_client.get("/api/statistics/cusum/current", params={"date": "2027-01-01"}).status_code == 404
    assert cusum_client.get("/api/statistics/cusum/history", params={"metric": "score"}).status_code == 422
    # The EWMA endpoints never return CUSUM rows.
    assert {r["method"] for r in cusum_client.get("/api/statistics/ewma/history").json()} == {"EWMA"}


def test_three_method_comparison(cusum_client: TestClient) -> None:
    jan17 = cusum_client.get("/api/statistics/comparison", params={"date": "2026-01-17"}).json()
    assert jan17["label"] == "3 OF 3 METHODS SIGNAL" and jan17["methods"] == {"composite": True, "ewma": True, "cusum": True}
    assert jan17["composite"]["composite_score"] == 80.0
    assert (jan17["ewma"]["volume"], jan17["ewma"]["positivity"]) == ("WATCH", "STATISTICAL_ALERT")
    assert (jan17["cusum"]["volume"], jan17["cusum"]["positivity"]) == ("NORMAL", "STATISTICAL_ALERT")
    jan16 = cusum_client.get("/api/statistics/comparison", params={"date": "2026-01-16"}).json()
    assert jan16["label"] == "NO METHODS SIGNAL"
    assert "not a score" in jan16["rule"]
    jan10 = cusum_client.get("/api/statistics/comparison", params={"date": "2026-01-10"}).json()
    assert jan10["label"] == "NO METHODS SIGNAL" and jan10["available"] == 3


def test_recalculate_endpoint(cusum_client: TestClient, cusum_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    body = cusum_client.post("/api/statistics/cusum/recalculate", json={}).json()
    assert (body["created"], body["updated"], body["unchanged"]) == (0, 0, 110)
    assert cusum_client.post("/api/statistics/cusum/recalculate", json={"h": 3}).status_code == 422
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    with client_for(cusum_engine) as production:
        assert production.post("/api/statistics/cusum/recalculate", json={}).status_code == 404
        assert production.get("/api/statistics/cusum").json()["recalculation_available"] is False


def test_run_command_method_selection(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        run_command.main(["--method", "bayes"])
    monkeypatch.setenv("APP_ENV", "production")
    assert run_command.main(["--method", "cusum"]) == 1
    assert "Refusing" in capsys.readouterr().out
