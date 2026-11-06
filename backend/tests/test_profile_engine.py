"""
Running the one dynamic engine once per surveillance profile.

The synthetic dynamic dataset is ingested through the real FHIR pipeline.
Each profile's engine key narrows the eligible observations to its tests;
the engine, baseline, scorer, EWMA and CUSUM are unchanged and simply run
on that set. Respiratory Viral Syndrome's results are untouched (its key is
the legacy syndrome name; the existing engine tests pin its values).
"""

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session

from app.models import LabObservation, StatisticalSignal, SurveillanceSignal
from app.profiles import registry
from app.seed import dynamic_dataset
from app.statistics import cusum_service, service
from app.statistics.cusum import CusumConfig
from app.statistics.types import EwmaConfig
from app.surveillance.aggregator import aggregate, observed_date_range
from app.surveillance.persistence import recalculate
from app.surveillance.types import DEFAULT_SYNDROME, EngineConfig
from tests.conftest import client_for

CONFIG = EngineConfig()
FIRST, LAST = date(2025, 11, 27), date(2026, 1, 20)
PATHOGENS = {"influenza-a": "92142-9", "covid-19": "94500-6", "rsv": "85479-4"}


@pytest.fixture(scope="module")
def engine_with_data(seeded_engine: Engine) -> Iterator[Engine]:
    with Session(seeded_engine) as session, session.begin():
        dynamic_dataset.load(session, salt="profile-salt")
    yield seeded_engine
    with Session(seeded_engine) as session, session.begin():
        session.execute(delete(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic"))
        session.execute(delete(StatisticalSignal))
        dynamic_dataset.remove(session)


@pytest.fixture
def scratch(engine_with_data: Engine) -> Iterator[Session]:
    session = Session(engine_with_data)
    session.begin()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _tests_by_day(session: Session, key: str) -> dict[tuple[str, date], tuple[int, int]]:
    data = aggregate(session, key, FIRST, LAST, CONFIG)
    out = {}
    for code in data.facilities:
        for day, fd in data.facility_daily(code).items():
            out[(code, day)] = (fd.tests, fd.positive)
    return out


def test_each_observation_counts_towards_every_profile_it_belongs_to(scratch: Session) -> None:
    rvs = _tests_by_day(scratch, DEFAULT_SYNDROME)
    parts = [_tests_by_day(scratch, key) for key in PATHOGENS]
    assert sum(t for t, _ in rvs.values()) > 0
    for cell, (tests, positives) in rvs.items():
        # The syndrome is exactly the sum of its three pathogen profiles, day by day, facility by facility.
        assert tests == sum(p.get(cell, (0, 0))[0] for p in parts), cell
        assert positives == sum(p.get(cell, (0, 0))[1] for p in parts), cell


def test_a_pathogen_profile_counts_only_its_own_test(scratch: Session) -> None:
    flu = sum(t for t, _ in _tests_by_day(scratch, "influenza-a").values())
    expected = scratch.scalar(
        select(func.count())
        .select_from(LabObservation)
        .where(
            LabObservation.loinc_code == "92142-9",
            LabObservation.terminology_status == "mapped",
            LabObservation.source_system.like(dynamic_dataset.SOURCE_PREFIX + "%"),
            LabObservation.status.in_(("final", "amended", "corrected")),
        )
    )
    assert 0 < flu <= expected


def test_the_legacy_key_selects_exactly_what_it_always_did(scratch: Session) -> None:
    scope = registry.scope_for_key(DEFAULT_SYNDROME)
    assert (scope.syndrome, scope.test_codes) == (DEFAULT_SYNDROME, None)
    assert observed_date_range(scratch, DEFAULT_SYNDROME, CONFIG) == observed_date_range(
        scratch, registry.get_profile("respiratory-viral-syndrome").engine_key, CONFIG
    )


def test_portfolio_profiles_cover_no_ingested_observation(scratch: Session) -> None:
    for key in ("cholera", "gastrointestinal-syndrome"):
        assert registry.scope_for_key(key).syndrome is None
        assert observed_date_range(scratch, key, CONFIG) is None
        # Unmapped observations are still read for mapping quality, but none counts as a test.
        assert sum(t for t, _ in _tests_by_day(scratch, key).values()) == 0


def test_the_engine_runs_per_profile_and_persists_under_the_profile_key(scratch: Session) -> None:
    report = recalculate(scratch, "influenza-a", date(2026, 1, 1), date(2026, 1, 20), CONFIG)
    assert len(report.days) == 20
    stored = scratch.scalars(
        select(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic", SurveillanceSignal.syndrome == "influenza-a")
    ).all()
    assert len(stored) == 20
    scored = [s for s in stored if s.composite_score is not None]
    assert scored, "the influenza-led rise is scored for Influenza A"
    # The same severity bands: a stored severity always matches its score.
    bands = [(20, "Low"), (40, "Watch"), (65, "Moderate"), (85, "High"), (101, "Critical")]
    for s in scored:
        assert s.severity == next(label for limit, label in bands if float(s.composite_score) < limit)
    # Nothing is stored under the syndrome key by this run.
    assert not scratch.scalars(
        select(SurveillanceSignal).where(
            SurveillanceSignal.mode == "dynamic", SurveillanceSignal.syndrome == DEFAULT_SYNDROME
        )
    ).all()


def test_ewma_and_cusum_run_per_profile_with_the_28_day_reference_rule(scratch: Session) -> None:
    run = service.calculate(scratch, "influenza-a", EwmaConfig())
    assert run is not None
    assert run.first == FIRST
    # Monitoring only begins after the full reference period.
    assert run.monitoring_from == date(2025, 12, 25)
    cusum = cusum_service.calculate(scratch, "influenza-a", CusumConfig())
    assert cusum is not None


def test_no_history_never_produces_a_statistical_result(scratch: Session) -> None:
    for key in ("cholera", "gastrointestinal-syndrome"):
        assert service.calculate(scratch, key, EwmaConfig()) is None
        assert cusum_service.calculate(scratch, key, CusumConfig()) is None


def test_endpoints_accept_a_profile_and_default_to_respiratory_viral_syndrome(engine_with_data: Engine) -> None:
    with client_for(engine_with_data) as client:
        default = client.get("/api/surveillance/dynamic/summary").json()
        by_profile = client.get("/api/surveillance/dynamic/summary", params={"profile": "respiratory-viral-syndrome"}).json()
        assert default["syndrome"] == DEFAULT_SYNDROME
        assert by_profile == default
        flu = client.get("/api/surveillance/dynamic/summary", params={"profile": "influenza-a"})
        assert flu.status_code == 200 and flu.json()["syndrome"] == "influenza-a"
        assert client.get("/api/statistics/ewma", params={"profile": "covid-19"}).json()["syndrome"] == "covid-19"
        assert client.get("/api/statistics/cusum", params={"profile": "rsv"}).json()["syndrome"] == "rsv"
        assert client.get("/api/surveillance/dynamic/summary", params={"profile": "plague"}).status_code == 404
        clash = client.get(
            "/api/surveillance/dynamic/summary", params={"profile": "rsv", "syndrome": DEFAULT_SYNDROME}
        )
        assert clash.status_code == 422
        # The older parameter still works on its own.
        assert client.get("/api/statistics/ewma", params={"syndrome": DEFAULT_SYNDROME}).json()["syndrome"] == DEFAULT_SYNDROME


def test_recalculation_requests_accept_a_profile() -> None:
    from pydantic import ValidationError

    from app.schemas.cusum import CusumRecalculateRequest
    from app.schemas.dynamic_surveillance import RecalculateRequest
    from app.schemas.statistics import EwmaRecalculateRequest

    for model in (RecalculateRequest, EwmaRecalculateRequest, CusumRecalculateRequest):
        assert model().syndrome == DEFAULT_SYNDROME
        assert model(profile="influenza-a").syndrome == "influenza-a"
        with pytest.raises(ValidationError):
            model(profile="plague")
        with pytest.raises(ValidationError):
            model(profile="rsv", syndrome=DEFAULT_SYNDROME)
    _ = TestClient  # imported for symmetry with the other API tests
