"""
The dynamic surveillance engine against a database.

Runs on SQLite here and on PostgreSQL through
tests/integration/test_dynamic_surveillance_postgres.py (same fixtures names).

The synthetic dynamic dataset (app/seed/dynamic_dataset.py) is ingested once
per module through the real FHIR pipeline, then the engine runs over every
date. Selected dates are checked against calculations done by hand from the
dataset's own table of tests and positives (the arithmetic is in the
docstrings).
"""

import json
from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session

from app.models import AuditEvent, DemoSimulationDay, Facility, LabObservation, SurveillanceSignal
from app.seed import DATASET_PATH, dynamic_dataset, load_dataset, seed_demo_dataset
from app.seed.parity import compare_with_frontend
from app.services.fhir_ingestion import ingest_document
from app.surveillance import run as run_command
from app.surveillance.engine import INSUFFICIENT_BASELINE_MESSAGE, calculate
from app.surveillance.persistence import get_dynamic_signal, recalculate
from app.surveillance.types import DEFAULT_SYNDROME, EngineConfig
from tests.conftest import client_for

SYNDROME = DEFAULT_SYNDROME
CONFIG = EngineConfig()
FIRST, LAST = date(2026, 1, 1), date(2026, 1, 20)
# Phase 8 added an in-control history (Nov 27 - Dec 24) before a Dec 25-31
# reporting gap. The gap keeps it out of every January baseline window, so
# the January hand calculations below are unchanged.
DATA_FIRST = date(2025, 11, 27)
DATASET_ROWS, DATASET_DAYS = 2589, 55
SALT = "test-salt"


@pytest.fixture(scope="module")
def dynamic_engine(seeded_engine: Engine) -> Iterator[Engine]:
    with Session(seeded_engine) as session, session.begin():
        report = dynamic_dataset.load(session, salt=SALT)
        assert (report.created, report.rejected) == (DATASET_ROWS, 0)
        recalculate(session, SYNDROME, DATA_FIRST, LAST, CONFIG)
    yield seeded_engine
    with Session(seeded_engine) as session, session.begin():
        session.execute(delete(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic"))
        dynamic_dataset.remove(session)


@pytest.fixture(scope="module")
def dyn_client(dynamic_engine: Engine) -> Iterator[TestClient]:
    with client_for(dynamic_engine) as client:
        yield client


@pytest.fixture
def scratch(dynamic_engine: Engine) -> Iterator[Session]:
    """A session whose changes are rolled back, leaving the module's data intact."""
    session = Session(dynamic_engine)
    session.begin()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def signal(session: Session, day: date) -> SurveillanceSignal:
    found = get_dynamic_signal(session, SYNDROME, day)
    assert found is not None
    return found


def components(s: SurveillanceSignal) -> dict[str, dict]:
    return {c["key"]: c for c in s.calculation_metadata["components"]}


def statuses(s: SurveillanceSignal) -> dict[str, str]:
    return {f["facility_code"]: f["status"] for f in s.calculation_metadata["facilities"]}


def extra_observation(code: str, day: date, suffix: str, positive: bool = True) -> dynamic_dataset.Planned:
    return dynamic_dataset._observation(
        code, day, 3, 10, dynamic_dataset.TESTS_BY_INDEX[0], positive, True, suffix=suffix
    )


# ---------------------------------------------------------------------------
# The dataset
# ---------------------------------------------------------------------------


def test_dataset_is_ordinary_fhir_ingested_data(dynamic_engine: Engine) -> None:
    with Session(dynamic_engine) as session:
        rows = session.scalars(
            select(LabObservation).where(LabObservation.source_system.like(dynamic_dataset.SOURCE_PREFIX + "%"))
        ).all()
        assert len(rows) == DATASET_ROWS
        assert sum(r.terminology_status == "unmapped" for r in rows) == 48
        assert all(r.patient_reference.startswith("FHIR-PT-") for r in rows)
        assert all(r.received_datetime is not None for r in rows)
        # The frozen demonstration's observations are untouched.
        assert compare_with_frontend(session, json.loads(DATASET_PATH.read_text(encoding="utf-8"))) == []


def test_dataset_phases_partition_the_days() -> None:
    history = dynamic_dataset.planned_observations("history")
    baseline = dynamic_dataset.planned_observations("baseline")
    outbreak = dynamic_dataset.planned_observations("outbreak")
    assert len(history) + len(baseline) + len(outbreak) == len(dynamic_dataset.planned_observations()) == DATASET_ROWS
    assert max(p.resource["effectiveDateTime"] for p in history) < "2025-12-25"
    assert min(p.resource["effectiveDateTime"] for p in baseline) >= "2026-01-01"
    assert max(p.resource["effectiveDateTime"] for p in baseline) < "2026-01-15"
    assert min(p.resource["effectiveDateTime"] for p in outbreak) >= "2026-01-15"


# ---------------------------------------------------------------------------
# Hand-calculated dates
# ---------------------------------------------------------------------------


def test_first_days_have_insufficient_baseline(dynamic_engine: Engine) -> None:
    with Session(dynamic_engine) as session:
        for day in range(1, 6):
            s = signal(session, date(2026, 1, day))
            assert s.calculation_status == "INSUFFICIENT_BASELINE"
            assert s.composite_score is None and s.severity is None and s.baseline_volume is None
            assert s.volume_component_score is None
            assert s.calculation_metadata["message"] == INSUFFICIENT_BASELINE_MESSAGE
            assert s.calculation_metadata["baseline"]["observed_days"] == day - 1
            # Data Confidence is still assessed: it is about the data, not the baseline.
            assert s.data_confidence_score is not None


def test_jan_06_hand_calculated(dynamic_engine: Engine) -> None:
    """
    Window Dec 31-Jan 5: Dec 31 has no data, so 5 observed days (the minimum).
      tests 48 + 49 + 48 + 47 + 49 = 241 -> mean 48.2
      positives 4 + 3 + 5 + 3 + 4 = 19 -> 19/241 = 7.8838 %
    Jan 6: 19 + 17 + 12 = 48 tests, 1 + 2 + 1 = 4 positive -> 8.3333 %
      volume (48 - 48.2)/48.2 = -0.41 % -> 0
      positivity +0.4495 points -> 0.4495/15*100 = 2.9968 -> x0.30 = 0.8990
      no facility abnormal -> facilities 0, geography 0, persistence 0
      composite 0.899 -> 1, Low
    """
    with Session(dynamic_engine) as session:
        s = signal(session, date(2026, 1, 6))
        c = components(s)
        assert s.calculation_status == "CALCULATED"
        assert float(s.baseline_volume) == 48.2
        assert float(s.baseline_positivity_rate) == 7.88
        assert (s.test_volume, s.positive_count) == (48, 4)
        assert c["volume"]["normalized"] == 0.0
        assert c["positivity"]["normalized"] == pytest.approx(2.9968, abs=1e-4)
        assert (int(s.composite_score), s.severity, s.persistence_days) == (1, "Low", 0)
        assert statuses(s) == {"HOSP-A": "NORMAL", "HOSP-B": "NORMAL", "HOSP-C": "NORMAL"}


def test_jan_15_hand_calculated(dynamic_engine: Engine) -> None:
    """
    Window Jan 8-14 (7 days): tests 48+49+47+48+49+48+47 = 336 -> 48.0;
      positives 3+4+3+4+3+5+3 = 25 -> 25/336 = 7.4405 %
    Jan 15: 26 + 16 + 12 = 54 tests, 4 + 1 + 1 = 6 positive -> 11.1111 %
      volume (54-48)/48 = +12.5 %            -> 12.5    x0.25 = 3.1250
      positivity +3.6706 points /15          -> 24.4709 x0.30 = 7.3413
      HOSP-A: 26 vs 20.0 (+30 %), 4/26 = 15.38 % vs 10/140 = 7.14 % -> ABNORMAL
      HOSP-B: 16 vs 16.14, 6.25 % vs 7.08 % -> NORMAL; HOSP-C: 12 vs 11.86, 8.33 % vs 8.43 % -> NORMAL
      facilities 1/3                        -> 33.333  x0.20 = 6.6667
      geography 1/3 (01604)                 -> 33.333  x0.15 = 5.0000
      persistence 1 (Jan 14 not abnormal)   -> 25      x0.10 = 2.5000
      composite 24.633 -> 25, Watch
    """
    with Session(dynamic_engine) as session:
        s = signal(session, date(2026, 1, 15))
        c = components(s)
        assert float(s.baseline_volume) == 48.0
        assert float(s.baseline_positivity_rate) == 7.44
        assert (s.test_volume, s.positive_count, float(s.positivity_rate)) == (54, 6, 11.11)
        assert c["volume"]["raw"]["change_percent"] == 12.5
        assert c["positivity"]["normalized"] == pytest.approx(24.4709, abs=1e-4)
        assert c["facilities"]["raw"] == {"affected": 1, "participating": 3}
        assert c["geography"]["raw"] == {"affected": 1, "participating": 3}
        assert c["persistence"]["raw"]["days"] == 1
        assert s.calculation_metadata["composite"]["unrounded"] == pytest.approx(24.6329, abs=1e-4)
        assert (int(s.composite_score), s.severity) == (25, "Watch")
        assert statuses(s) == {"HOSP-A": "ABNORMAL", "HOSP-B": "NORMAL", "HOSP-C": "NORMAL"}
        assert s.affected_geographies == ["01604"]


def test_jan_17_hand_calculated(dynamic_engine: Engine) -> None:
    """
    Window Jan 10-16: tests 47+48+49+48+47+54+62 = 355 -> 50.7143;
      positives 3+4+3+5+3+6+11 = 35 -> 9.8592 %
    Jan 17: 34 + 24 + 15 = 73 tests, 9 + 5 + 3 = 17 positive -> 23.2877 %
      volume +43.9437 %                -> x0.25 = 10.9859
      positivity +13.4285 points /15   -> 89.5234 x0.30 = 26.8570
      HOSP-C: 15 tests vs 84/7 = 12.0 -> exactly +25.0 % (the threshold is >=), 3/15 = 20 % vs 8.33 %
      facilities 3/3 -> 20; geography 3/3 -> 15; persistence 3 (Jan 15, 16, 17) -> 75 x0.10 = 7.5
      composite 80.343 -> 80, High
    """
    with Session(dynamic_engine) as session:
        s = signal(session, date(2026, 1, 17))
        c = components(s)
        assert float(s.baseline_volume) == 50.71
        assert float(s.baseline_positivity_rate) == 9.86
        assert c["volume"]["normalized"] == pytest.approx(43.9437, abs=1e-4)
        assert c["positivity"]["normalized"] == pytest.approx(89.5234, abs=1e-4)
        assert (int(s.composite_score), s.severity, s.persistence_days) == (80, "High", 3)
        hosp_c = next(f for f in s.calculation_metadata["facilities"] if f["facility_code"] == "HOSP-C")
        assert hosp_c["volume_change_percent"] == 25.0
        assert hosp_c["status"] == "ABNORMAL"
        assert any(reason.startswith("volume +25.0%") for reason in hosp_c["reasons"])


def test_jan_20_hand_calculated(dynamic_engine: Engine) -> None:
    """
    Window Jan 13-19: tests 48+47+54+62+73+84+95 = 463 -> 66.1429;
      positives 5+3+6+11+17+22+31 = 95 -> 20.5184 %
    Jan 20: 46 + 36 + 24 = 106 tests, 19 + 13 + 8 = 40 positive -> 37.7358 %
      volume (106 - 66.1429)/66.1429 = +60.2592 % -> x0.25 = 15.0648
      positivity +17.2175 points -> 114.8, clamped to 100 -> x0.30 = 30
      facilities 3/3 -> 20; geography 3/3 -> 15; persistence 6 -> clamped 100 -> 10
      composite 90.065 -> 90, Critical
    """
    with Session(dynamic_engine) as session:
        s = signal(session, date(2026, 1, 20))
        c = components(s)
        assert float(s.baseline_volume) == 66.14
        assert float(s.baseline_positivity_rate) == 20.52
        assert (s.test_volume, s.positive_count) == (106, 40)
        assert c["volume"]["normalized"] == pytest.approx(60.2592, abs=1e-4)
        assert c["positivity"]["normalized"] == 100.0
        assert c["positivity"]["raw"]["change_points"] == pytest.approx(17.2175, abs=1e-4)
        assert (s.persistence_days, float(s.persistence_component_score)) == (6, 100.0)
        assert (int(s.composite_score), s.severity) == (90, "Critical")
        assert sorted(s.affected_geographies) == ["01545", "01604", "01605"]


def test_the_story_progresses_through_the_severity_bands(dynamic_engine: Engine) -> None:
    with Session(dynamic_engine) as session:
        history = session.scalars(
            select(SurveillanceSignal)
            .where(SurveillanceSignal.mode == "dynamic", SurveillanceSignal.signal_date >= FIRST)
            .order_by(SurveillanceSignal.signal_date)
        ).all()
        assert len(history) == 20
        scored = {s.signal_date.day: (int(s.composite_score), s.severity) for s in history if s.composite_score is not None}
        assert all(severity == "Low" for day, (_, severity) in scored.items() if day <= 14)
        assert [scored[d] for d in range(15, 21)] == [
            (25, "Watch"), (54, "Moderate"), (80, "High"), (85, "Critical"), (90, "Critical"), (90, "Critical"),
        ]
        assert [s.persistence_days for s in history][13:] == [0, 1, 2, 3, 4, 5, 6]


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------


def test_second_facility_is_abnormal_by_positivity_alone(dynamic_engine: Engine) -> None:
    """HOSP-B, Jan 16: 20 tests vs 113/7 = 16.14 (+23.9 %, under 25 %), 3/20 = 15 % vs 8/113 = 7.08 % (+7.9)."""
    with Session(dynamic_engine) as session:
        s = signal(session, date(2026, 1, 16))
        hosp_b = next(f for f in s.calculation_metadata["facilities"] if f["facility_code"] == "HOSP-B")
        assert hosp_b["status"] == "ABNORMAL"
        assert [reason.split()[0] for reason in hosp_b["reasons"]] == ["positivity"]
        assert s.affected_geographies == ["01604", "01605"]


def test_persistence_resets_without_an_abnormal_previous_day(scratch: Session) -> None:
    jan_17 = signal(scratch, date(2026, 1, 17))
    assert calculate(scratch, SYNDROME, date(2026, 1, 18), CONFIG, jan_17).values["persistence_days"] == 4
    assert calculate(scratch, SYNDROME, date(2026, 1, 18), CONFIG, None).values["persistence_days"] == 1
    # Jan 14 was scored but had no abnormal facility, so Jan 15 starts at 1.
    jan_14 = signal(scratch, date(2026, 1, 14))
    assert calculate(scratch, SYNDROME, date(2026, 1, 15), CONFIG, jan_14).values["persistence_days"] == 1


def test_baseline_does_not_see_later_observations(scratch: Session) -> None:
    before = calculate(scratch, SYNDROME, date(2026, 1, 14), CONFIG, signal(scratch, date(2026, 1, 13)))
    for n in range(30):
        item = extra_observation("HOSP-A", date(2026, 1, 16), f"LATE{n:02d}")
        ingest_document(scratch, item.resource, salt=SALT, received_at=item.received_at)
    after = calculate(scratch, SYNDROME, date(2026, 1, 14), CONFIG, signal(scratch, date(2026, 1, 13)))
    assert after.values == before.values


def test_development_and_demo_period_data_are_not_counted(scratch: Session) -> None:
    before = calculate(scratch, SYNDROME, date(2026, 1, 10), CONFIG, None).values
    scratch.add(Facility(
        facility_code="SMART-SANDBOX", name="Sandbox", vendor="x", city="x", postal_code="SANDBOX",
        region="x", country_code="ZZ", participation="development",
    ))
    scratch.flush()
    item = extra_observation("HOSP-A", date(2026, 1, 10), "DEV")
    item.resource["performer"] = []
    item.resource["meta"]["source"] = "https://launch.smarthealthit.org/v/r4/fhir"
    report = ingest_document(scratch, item.resource, salt=SALT, received_at=item.received_at)
    assert report.results[0].facility_code == "SMART-SANDBOX"
    assert calculate(scratch, SYNDROME, date(2026, 1, 10), CONFIG, None).values == before
    with pytest.raises(ValueError, match="demonstration period"):
        calculate(scratch, SYNDROME, date(2025, 11, 5), CONFIG, None)


def test_no_data_day_is_not_scored(scratch: Session) -> None:
    calc = calculate(scratch, SYNDROME, date(2026, 1, 25), CONFIG, None)
    assert calc.status == "NO_DATA"
    assert calc.values["composite_score"] is None
    assert "not evidence of normal activity" in calc.metadata["message"]
    # Facilities that reported in the window and then went silent: confidence says so.
    assert calc.values["data_confidence_level"] == "Low"


def test_data_confidence_is_separate_and_sees_unmapped_codes(dynamic_engine: Engine) -> None:
    with Session(dynamic_engine) as session:
        s = signal(session, date(2026, 1, 20))
        confidence = s.calculation_metadata["data_confidence"]
        assert [c["key"] for c in confidence["components"]] == [
            "freshness", "completeness", "terminology", "participation", "integrity",
        ]
        terminology = next(c for c in confidence["components"] if c["key"] == "terminology")
        # 106 mapped of 107 laboratory results (HOSP-C's unmapped SARS-CoV-2 code).
        assert terminology["score"] == pytest.approx(106 / 107 * 100, abs=1e-4)
        assert confidence["facilities_reporting"] == confidence["facilities_total"] == 3
        assert s.data_confidence_score == confidence["score"]
        assert "data_confidence" not in {c["key"] for c in s.calculation_metadata["components"]}


def test_explainability_metadata(dynamic_engine: Engine) -> None:
    with Session(dynamic_engine) as session:
        m = signal(session, date(2026, 1, 16)).calculation_metadata
        assert {"config", "method", "current", "baseline", "changes", "components", "composite",
                "facilities", "geography", "persistence", "data_confidence"} <= set(m)
        for component in m["components"]:
            assert {"raw", "normalized", "weighted", "points", "weight", "max_points"} <= set(component)
        assert m["config"]["baseline_window_days"] == 7
        # Aggregate provenance only: no patient references anywhere.
        assert "FHIR-PT" not in json.dumps(m)
        assert set(m["facilities"][0]) >= {"tests", "positive", "positivity_rate", "status", "reasons"}


# ---------------------------------------------------------------------------
# Persistence of signals: idempotency, recalculation, audit
# ---------------------------------------------------------------------------


def test_rerun_is_idempotent(scratch: Session) -> None:
    audits = scratch.scalar(select(func.count()).select_from(AuditEvent))
    report = recalculate(scratch, SYNDROME, FIRST, LAST, CONFIG)
    assert report.count("unchanged") == 20
    assert scratch.scalar(
        select(func.count()).select_from(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic")
    ) == DATASET_DAYS
    assert scratch.scalar(select(func.count()).select_from(AuditEvent)) == audits


def test_recalculation_updates_the_same_signal_and_is_audited(scratch: Session) -> None:
    jan_20 = signal(scratch, date(2026, 1, 20))
    signal_id, status = jan_20.id, "UNDER REVIEW"
    jan_20.status = status  # an analyst's review state must survive recalculation
    item = extra_observation("HOSP-B", date(2026, 1, 20), "EXTRA")
    ingest_document(scratch, item.resource, salt=SALT, received_at=item.received_at)

    report = recalculate(scratch, SYNDROME, date(2026, 1, 20), date(2026, 1, 20), CONFIG)
    assert [d.outcome for d in report.days] == ["updated"]
    updated = signal(scratch, date(2026, 1, 20))
    assert (updated.id, updated.test_volume, updated.positive_count, updated.status) == (signal_id, 107, 41, status)
    event = scratch.scalars(
        select(AuditEvent).where(AuditEvent.event_type == "surveillance.dynamic.recalculated")
    ).all()[-1]
    assert event.entity_id == str(signal_id)
    assert "107 tests" in event.description and "FHIR-PT" not in event.description


def test_severity_change_is_audited(scratch: Session) -> None:
    # Fifteen more positive HOSP-A results on Jan 14 make it an abnormal day.
    for n in range(15):
        item = extra_observation("HOSP-A", date(2026, 1, 14), f"SURGE{n:02d}")
        ingest_document(scratch, item.resource, salt=SALT, received_at=item.received_at)
    report = recalculate(scratch, SYNDROME, date(2026, 1, 14), date(2026, 1, 20), CONFIG)
    jan_14 = report.days[0]
    assert jan_14.previous_severity == "Low" and jan_14.severity != "Low"
    changes = scratch.scalars(
        select(AuditEvent).where(AuditEvent.event_type == "surveillance.dynamic.severity_changed")
    ).all()
    assert any(f"changed from Low (0) to {jan_14.severity}" in e.description for e in changes)
    assert signal(scratch, date(2026, 1, 14)).persistence_days == 1
    # The surge also enters Jan 15's baseline window, so HOSP-A's own baseline
    # rises and Jan 15 is no longer abnormal: persistence resets to 0 there.
    jan_15 = signal(scratch, date(2026, 1, 15))
    assert (jan_15.affected_facilities, jan_15.persistence_days) == (0, 0)


# ---------------------------------------------------------------------------
# Demonstration and dynamic signals stay apart
# ---------------------------------------------------------------------------


def test_demo_endpoints_return_only_the_frozen_demonstration(dyn_client: TestClient, dynamic_engine: Engine) -> None:
    signals = dyn_client.get("/api/signals").json()
    assert [s["signal_date"] for s in signals] == [f"2025-11-0{d}" for d in range(3, 8)]
    assert [d["composite_score"] for d in dyn_client.get("/api/demo/days").json()] == [0, 24, 50, 74, 87]
    with Session(dynamic_engine) as session:
        dynamic_id = signal(session, date(2026, 1, 20)).id
        demo_id = session.scalar(select(DemoSimulationDay.signal_id).where(DemoSimulationDay.day == 5))
    assert dyn_client.get(f"/api/signals/{dynamic_id}").status_code == 404
    assert dyn_client.get(f"/api/surveillance/dynamic/signals/{demo_id}").status_code == 404


def test_reseeding_the_demonstration_leaves_dynamic_signals_alone(scratch: Session) -> None:
    before = signal(scratch, date(2026, 1, 20)).composite_score
    report = seed_demo_dataset(scratch, load_dataset())
    assert not report.changed
    assert signal(scratch, date(2026, 1, 20)).composite_score == before


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


def test_signal_list_and_filters(dyn_client: TestClient) -> None:
    rows = dyn_client.get("/api/surveillance/dynamic/signals").json()
    assert len(rows) == DATASET_DAYS and {r["mode"] for r in rows} == {"dynamic"}
    # The reporting gap: no eligible observations, so no score.
    assert {r["calculation_status"] for r in rows if "2025-12-25" <= r["signal_date"] <= "2025-12-31"} == {"NO_DATA"}
    assert rows[0]["calculation_status"] == "INSUFFICIENT_BASELINE" and rows[0]["composite_score"] is None
    ranged = dyn_client.get("/api/surveillance/dynamic/signals", params={"date_from": "2026-01-15", "date_to": "2026-01-17"}).json()
    assert [r["composite_score"] for r in ranged] == [25, 54, 80]
    assert ranged[0]["participating_facilities"] == 3 and ranged[0]["participating_geographies"] == 3
    by_facility = dyn_client.get(
        "/api/surveillance/dynamic/signals", params={"facility": "HOSP-C", "date_from": "2026-01-01"}
    ).json()
    assert [r["signal_date"] for r in by_facility] == ["2026-01-17", "2026-01-18", "2026-01-19", "2026-01-20"]
    assert dyn_client.get("/api/surveillance/dynamic/signals", params={"date_from": "2026-01-10", "date_to": "2026-01-01"}).status_code == 422


def test_current_and_single_signal(dyn_client: TestClient) -> None:
    latest = dyn_client.get("/api/surveillance/dynamic/signals/current").json()
    assert (latest["signal_date"], latest["composite_score"], latest["severity"]) == ("2026-01-20", 90, "Critical")
    assert latest["calculation"]["components"][1]["key"] == "positivity"
    assert latest["positivity_component_score"] == 100.0
    jan_3 = dyn_client.get("/api/surveillance/dynamic/signals/current", params={"date": "2026-01-03"}).json()
    assert jan_3["message"] == INSUFFICIENT_BASELINE_MESSAGE
    assert dyn_client.get("/api/surveillance/dynamic/signals/current", params={"date": "2027-01-01"}).status_code == 404
    one = dyn_client.get(f"/api/surveillance/dynamic/signals/{latest['id']}").json()
    assert one["calculation"] == latest["calculation"]


def test_summary(dyn_client: TestClient) -> None:
    body = dyn_client.get("/api/surveillance/dynamic/summary").json()
    assert (body["mode"], body["signal_count"], body["first_date"], body["last_date"]) == (
        "dynamic", DATASET_DAYS, "2025-11-27", "2026-01-20",
    )
    assert body["latest"]["signal_date"] == "2026-01-20"
    assert body["method"]["weights"] == {"volume": 0.25, "positivity": 0.3, "facilities": 0.2, "geography": 0.15, "persistence": 0.1}
    assert "not epidemiologically validated" in body["disclaimer"]
    assert body["recalculation_available"] is True


def test_recalculate_endpoint(dyn_client: TestClient) -> None:
    body = dyn_client.post("/api/surveillance/dynamic/recalculate", json={}).json()
    assert (body["date_from"], body["date_to"], body["unchanged"], body["created"]) == (
        "2025-11-27", "2026-01-20", DATASET_DAYS, 0,
    )
    one = dyn_client.post(
        "/api/surveillance/dynamic/recalculate", json={"date_from": "2026-01-20", "date_to": "2026-01-20"}
    ).json()
    assert one["days"][0]["composite_score"] == 90
    assert dyn_client.post("/api/surveillance/dynamic/recalculate", json={"date_from": "2026-01-20"}).status_code == 422
    assert dyn_client.post("/api/surveillance/dynamic/recalculate", json={"composite_score": 99}).status_code == 422
    skipped = dyn_client.post(
        "/api/surveillance/dynamic/recalculate", json={"date_from": "2025-11-06", "date_to": "2025-11-08"}
    ).json()
    assert skipped["skipped"] == ["2025-11-06", "2025-11-07"] and [d["signal_date"] for d in skipped["days"]] == ["2025-11-08"]
    # There is no endpoint that writes a signal.
    assert dyn_client.put("/api/surveillance/dynamic/signals/1", json={}).status_code == 405


def test_recalculate_does_not_exist_outside_development(dynamic_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    with client_for(dynamic_engine) as client:
        assert client.post("/api/surveillance/dynamic/recalculate", json={}).status_code == 404
        summary = client.get("/api/surveillance/dynamic/summary").json()
        assert summary["recalculation_available"] is False


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def test_run_command_refuses_production(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    assert run_command.main([]) == 1
    assert "Refusing" in capsys.readouterr().out
    assert dynamic_dataset.main([]) == 1


def test_run_command_argument_rules() -> None:
    with pytest.raises(SystemExit):
        run_command.parse_args(["--date", "2026-01-01", "--from", "2026-01-01", "--to", "2026-01-02"])
    with pytest.raises(SystemExit):
        run_command.parse_args(["--from", "2026-01-01"])
    args = run_command.parse_args(["--date", "2026-01-20"])
    assert args.date == date(2026, 1, 20) and args.syndrome == SYNDROME
