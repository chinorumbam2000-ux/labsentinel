"""
Surveillance profiles: the registry, many-to-many test membership, the
migration that stores them, and the read-only API.
"""

import json
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from alembic import command
from app.fhir import terminology
from app.models import LabTestProfileMembership, SurveillanceProfile
from app.profiles import registry
from app.statistics.cusum import CusumConfig
from app.statistics.types import EwmaConfig
from app.surveillance.types import EngineConfig
from tests.conftest import alembic_config, sqlite_engine, upgrade

RVS = "respiratory-viral-syndrome"
EXPECTED_IDS = [RVS, "influenza-a", "covid-19", "rsv", "cholera", "gastrointestinal-syndrome"]


def test_registry_defines_the_six_initial_profiles_in_order() -> None:
    profiles = registry.profiles()
    assert [p.id for p in profiles] == EXPECTED_IDS
    assert [p.display_name for p in profiles] == [
        "Respiratory Viral Syndrome",
        "Influenza A",
        "COVID-19",
        "RSV",
        "Cholera",
        "Gastrointestinal Syndrome",
    ]
    assert registry.get_registry().default_profile_id == RVS
    assert all(p.active for p in profiles)
    assert {p.category for p in profiles} == {"Syndrome", "Pathogen"}


def test_membership_is_many_to_many() -> None:
    assert registry.profiles_for_test("92142-9") == [RVS, "influenza-a"]
    assert registry.profiles_for_test("94500-6") == [RVS, "covid-19"]
    assert registry.profiles_for_test("85479-4") == [RVS, "rsv"]
    assert registry.profiles_for_test("DEMO-VCH") == ["cholera", "gastrointestinal-syndrome"]
    assert registry.profiles_for_test("DEMO-GIP") == ["gastrointestinal-syndrome"]
    # An unmapped code routes nowhere: it is never given a guessed profile.
    assert registry.profiles_for_test("12345-6") == []
    assert registry.get_profile(RVS).test_codes == ("92142-9", "94500-6", "85479-4")


def test_registry_agrees_with_fhir_terminology_without_changing_it() -> None:
    loinc = [t for t in registry.get_registry().tests if t.system == registry.LOINC_SYSTEM]
    assert {t.code: t.name for t in loinc} == {
        code: mapping.test_name for code, mapping in terminology.LAB_TEST_MAPPINGS.items()
    }
    # Every mapped LOINC test is a Respiratory Viral Syndrome test, as the
    # single-valued lab_observation.syndrome says.
    for test in loinc:
        assert RVS in registry.profiles_for_test(test.code)
        assert terminology.lookup(test.code).syndrome == terminology.RESPIRATORY_VIRAL_SYNDROME
    # Demonstration codes are not LOINC and are not in the FHIR terminology.
    for test in registry.get_registry().tests:
        if test.system == registry.DEMO_TEST_CODE_SYSTEM:
            assert not terminology.is_valid_loinc(test.code)
            assert terminology.lookup(test.code) is None


def test_only_the_engine_backed_profile_is_live() -> None:
    live = [p for p in registry.profiles() if p.live_available]
    assert [p.id for p in live] == [RVS]
    assert live[0].legacy_syndrome == terminology.RESPIRATORY_VIRAL_SYNDROME
    assert [p.id for p in registry.profiles() if p.replay_available] == [RVS]
    assert all(p.legacy_syndrome is None for p in registry.profiles() if p.id != RVS)


def test_every_profile_inherits_the_current_configuration() -> None:
    engine, ewma, cusum = EngineConfig(), EwmaConfig(), CusumConfig()
    for profile in registry.profiles():
        settings = registry.settings_for(profile)
        assert settings["label"] == "Illustrative defaults"
        assert settings["engine"] == {
            "baselineWindowDays": engine.baseline_window_days,
            "minimumBaselineDays": engine.min_baseline_days,
            "facilityMinimumTests": engine.facility_min_tests,
            "volumeIncreasePercent": engine.abnormal_volume_increase_percent,
            "positivityIncreasePoints": engine.abnormal_positivity_increase_points,
            "timezone": engine.timezone,
        }
        assert settings["ewma"] == {
            "lambda": ewma.lam,
            "k": ewma.k,
            "warningFraction": ewma.warning_fraction,
            "referenceDays": ewma.reference_days,
            "minimumReferenceDays": ewma.min_reference_days,
        }
        assert settings["cusum"] == {"k": cusum.k, "h": cusum.h, "approachingFraction": cusum.approaching_fraction}
        assert settings["replay"]["minimumBaselineTests"] == engine.facility_min_tests


def test_registry_validation_refuses_ambiguous_definitions() -> None:
    good = registry.get_registry()
    with pytest.raises(ValueError, match="unique"):
        registry.validate(replace(good, profiles=good.profiles + good.profiles[:1]))
    with pytest.raises(ValueError, match="unknown"):
        registry.validate(replace(good, memberships=good.memberships + (("99999-9", RVS),)))
    with pytest.raises(ValueError, match="only once"):
        registry.validate(replace(good, memberships=good.memberships + good.memberships[:1]))
    flu = replace(good.profiles[1], live_available=True)
    with pytest.raises(ValueError, match="engine key"):
        registry.validate(replace(good, profiles=(good.profiles[0], flu) + good.profiles[2:]))
    empty = replace(good.profiles[1], test_codes=())
    with pytest.raises(ValueError, match="no tests"):
        registry.validate(replace(good, profiles=(good.profiles[0], empty) + good.profiles[2:]))


def test_migration_0008_stores_exactly_the_registry(db_session: Session) -> None:
    stored = {p.id: p for p in db_session.scalars(select(SurveillanceProfile))}
    assert sorted(stored) == sorted(EXPECTED_IDS)
    for definition in registry.profiles():
        row = stored[definition.id]
        assert (
            row.display_name,
            row.short_name,
            row.category,
            row.active,
            row.description,
            row.legacy_syndrome,
            row.baseline_config_ref,
            row.signal_config_ref,
            row.replay_available,
            row.live_available,
            row.data_origin,
        ) == (
            definition.display_name,
            definition.short_name,
            definition.category,
            definition.active,
            definition.description,
            definition.legacy_syndrome,
            definition.baseline_config_ref,
            definition.signal_config_ref,
            definition.replay_available,
            definition.live_available,
            definition.data_origin,
        )
    tests = {t.code: t for t in registry.get_registry().tests}
    members = db_session.scalars(select(LabTestProfileMembership)).all()
    assert sorted((m.test_code, m.profile_id) for m in members) == sorted(registry.get_registry().memberships)
    for member in members:
        assert (member.code_system, member.test_name) == (tests[member.test_code].system, tests[member.test_code].name)


def test_migration_0008_is_additive_and_reversible(tmp_path: Path) -> None:
    engine = sqlite_engine(tmp_path / "0008.db")
    upgrade(engine, "0007")
    before = set(inspect(engine).get_table_names())
    upgrade(engine, "0008")
    after = set(inspect(engine).get_table_names())
    assert after - before == {"surveillance_profile", "lab_test_profile_membership"}

    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0007")
    assert set(inspect(engine).get_table_names()) == before
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0007"

    upgrade(engine, "0008")
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM lab_test_profile_membership")).scalar() == 9
    engine.dispose()


def test_profile_constraints_hold(db_session: Session) -> None:
    from sqlalchemy.exc import IntegrityError

    db_session.add(
        SurveillanceProfile(
            id="bad",
            display_name="Bad",
            short_name="Bad",
            category="Pathogen",
            active=True,
            description="x",
            legacy_syndrome=None,
            baseline_config_ref="c",
            signal_config_ref="c",
            replay_available=False,
            live_available=True,
            data_origin="portfolio-fixture",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_profiles_api(seeded_client: TestClient) -> None:
    response = seeded_client.get("/api/profiles")
    assert response.status_code == 200
    body = response.json()
    assert [p["id"] for p in body] == EXPECTED_IDS
    rvs = body[0]
    assert [t["code"] for t in rvs["tests"]] == ["85479-4", "92142-9", "94500-6"]
    assert rvs["live_available"] is True and rvs["legacy_syndrome"] == "Respiratory Viral Syndrome"
    assert rvs["settings"]["label"] == "Illustrative defaults"
    assert rvs["settings"]["ewma"]["referenceDays"] == 28

    assert seeded_client.get("/api/profiles/covid-19").json()["tests"] == [
        {"code": "94500-6", "system": "http://loinc.org", "name": "SARS-CoV-2 RNA"}
    ]
    assert seeded_client.get("/api/profiles/plague").status_code == 404
    assert seeded_client.get("/api/profiles/test-routing", params={"code": "92142-9"}).json() == {
        "test_code": "92142-9",
        "profile_ids": [RVS, "influenza-a"],
    }
    assert seeded_client.get("/api/profiles/test-routing", params={"code": "00000-0"}).json()["profile_ids"] == []


def test_registry_file_is_the_frontends_too() -> None:
    raw = json.loads(registry.REGISTRY_PATH.read_text(encoding="utf-8"))
    frontend = Path(__file__).resolve().parents[2] / "src" / "lib" / "profiles" / "registry.ts"
    if frontend.exists():  # absent in the backend-only container image
        assert "backend/app/profiles/registry.json" in frontend.read_text(encoding="utf-8")
    assert raw["defaultProfileId"] == RVS
