"""
Live Surveillance parity: the browser engine and the backend engine agree.

tests/fixtures/live_parity.json is written by the frontend
(scripts/export-live-parity.ts) from the browser's Live Surveillance
simulation: every synthetic result the three simulated sources send, and the
signal the browser engine calculated for every closed day and live profile.

Here the same results are ingested through the real FHIR pipeline, the
unchanged backend engine runs once per profile engine key, and every day's
volume, positivity, baseline, affected facilities and areas, persistence,
component values, composite score and severity must match.
"""

import json
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session

from app.models import LabObservation, StatisticalSignal, SurveillanceSignal
from app.services.fhir_ingestion import ingest_document
from app.statistics import cusum_service, service
from app.statistics.cusum import CusumConfig
from app.statistics.types import EwmaConfig
from app.surveillance.persistence import get_dynamic_signal, recalculate
from app.surveillance.types import EngineConfig

FIXTURE = Path(__file__).parent / "fixtures" / "live_parity.json"
ZONE = ZoneInfo("America/New_York")
PREFIX = "urn:labsentinel:synthetic:live-surveillance:"
NAMES = {
    "92142-9": "Influenza A RNA",
    "94500-6": "SARS-CoV-2 RNA",
    "85479-4": "RSV RNA",
    "94309-2": "SARS-CoV-2 RNA (specimen unspecified)",
}


def _fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _local(day: str, hhmm: str) -> datetime:
    hour, minute = (int(x) for x in hhmm.split(":"))
    return datetime.combine(date.fromisoformat(day), datetime.min.time(), ZONE) + timedelta(hours=hour, minutes=minute)


def _resource(r: dict) -> dict:
    """The fixture's result as a FHIR R4 Observation (the backend's ingestion format)."""
    result_code, result_text = ("10828004", "Positive") if r["positive"] else ("260385009", "Negative")
    resource = {
        "resourceType": "Observation",
        "id": r["id"].lower(),
        "identifier": [{"system": PREFIX + r["facility"].lower(), "value": r["id"]}],
        "status": "final",
        "category": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
            "code": "laboratory",
        }]}],
        "code": {"coding": [{"system": "http://loinc.org", "code": r["loinc"], "display": NAMES[r["loinc"]]}]},
        "subject": {"reference": f"Patient/{r['patient']}"},
        "effectiveDateTime": _local(r["date"], r["collected"]).isoformat(),
        "performer": [{"identifier": {"system": "urn:labsentinel:facility-code", "value": r["facility"]}}],
        "valueCodeableConcept": {"coding": [{"system": "http://snomed.info/sct", "code": result_code, "display": result_text}]},
    }
    if r["specimen"]:
        resource["contained"] = [{
            "resourceType": "Specimen",
            "id": "spec",
            "type": {"coding": [{"system": "http://snomed.info/sct", "code": "258500001", "display": "Nasopharyngeal swab"}]},
        }]
        resource["specimen"] = {"reference": "#spec"}
    return resource


@pytest.fixture(scope="module")
def live_engine(seeded_engine: Engine) -> Iterator[Engine]:
    fixture = _fixture()
    with Session(seeded_engine) as session, session.begin():
        created = rejected = 0
        for r in fixture["results"]:
            received = _local(r["date"], r["delivered"]).astimezone(UTC)
            outcome = ingest_document(session, _resource(r), salt="live-parity-salt", received_at=received)
            created += outcome.observations_created
            rejected += outcome.rejected
        assert (created, rejected) == (len(fixture["results"]), 0)
        first = date.fromisoformat(fixture["results"][0]["date"])
        last = date.fromisoformat(fixture["results"][-1]["date"])
        for key in fixture["signals"]:
            recalculate(session, key, first, last, EngineConfig())
    yield seeded_engine
    with Session(seeded_engine) as session, session.begin():
        session.execute(delete(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic"))
        session.execute(delete(StatisticalSignal))
        session.execute(delete(LabObservation).where(LabObservation.source_system.like("fhir:" + PREFIX + "%")))


def _metadata_components(signal: SurveillanceSignal) -> dict:
    return {c["key"]: c for c in (signal.calculation_metadata or {}).get("components", [])}


@pytest.mark.parametrize("key", ["Respiratory Viral Syndrome", "influenza-a", "covid-19", "rsv"])
def test_backend_engine_matches_the_browser_engine(live_engine: Engine, key: str) -> None:
    expected = _fixture()["signals"][key]
    assert len(expected) == 17
    with Session(live_engine) as session:
        for browser in expected:
            day = date.fromisoformat(browser["date"])
            backend = get_dynamic_signal(session, key, day)
            assert backend is not None, (key, day)
            where = f"{key} {day}"
            assert backend.calculation_status == browser["status"], where
            assert backend.test_volume == browser["tests"], where
            assert backend.positive_count == browser["positives"], where
            meta = backend.calculation_metadata or {}
            assert meta["baseline"]["observed_days"] == browser["baselineObservedDays"], where
            if browser["baselineMeanTests"] is not None:
                assert meta["baseline"]["mean_tests"] == pytest.approx(browser["baselineMeanTests"], abs=1e-4), where
                assert meta["baseline"]["positivity_rate"] == pytest.approx(browser["baselinePositivity"], abs=1e-4), where
            assert backend.affected_facilities == len(browser["affectedFacilities"]), where
            assert sorted(backend.affected_geographies) == sorted(browser["affectedAreas"]), where
            assert backend.persistence_days == browser["persistenceDays"], where
            if browser["composite"] is None:
                assert backend.composite_score is None, where
                continue
            assert int(backend.composite_score) == browser["composite"], where
            assert backend.severity == browser["severity"], where
            components = _metadata_components(backend)
            for name, values in browser["components"].items():
                assert components[name]["points"] == values["points"], (where, name)
                assert components[name]["normalized"] == pytest.approx(values["normalized"], abs=1e-3), (where, name)
            affected = {f["facility_code"] for f in meta["facilities"] if f["status"] == "ABNORMAL"}
            assert affected == set(browser["affectedFacilities"]), where


def test_seventeen_days_never_produce_a_statistical_result(live_engine: Engine) -> None:
    """The live simulation keeps 7 days of history: EWMA and CUSUM need 28. Nothing is fabricated."""
    with Session(live_engine) as session:
        for key in _fixture()["signals"]:
            ewma = service.calculate(session, key, EwmaConfig())
            assert ewma is not None
            assert all(p.status != "CALCULATED" for points in ewma.points.values() for p in points), key
            cusum = cusum_service.calculate(session, key, CusumConfig())
            assert cusum is not None
            assert all(p.status != "CALCULATED" for points in cusum.points.values() for p in points), key
        assert not session.scalars(select(StatisticalSignal)).all()
