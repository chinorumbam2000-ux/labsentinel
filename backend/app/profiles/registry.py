"""
Surveillance profiles: what Signal by ProbeSyQ can watch.

A profile is a named surveillance target - a syndrome (Respiratory Viral
Syndrome) or a single pathogen (Influenza A). Profiles and the tests that
feed them are defined once, in ``registry.json`` beside this module, which
the frontend reads too (src/lib/profiles/registry.ts).

Test-to-profile membership is many-to-many: one Influenza A RNA result counts
towards both Influenza A and Respiratory Viral Syndrome. ``profiles_for_test``
is the routing rule an ingestion path uses so that one observation updates
every profile it belongs to.

What does NOT change here:
- ``lab_observation.syndrome`` and the engine's syndrome key keep working
  exactly as before. A profile's ``legacy_syndrome`` names the engine key it
  is calculated under; only Respiratory Viral Syndrome has one today, so it
  is the only profile the dynamic engine (and EWMA / CUSUM) calculates.
- FHIR terminology (app/fhir/terminology.py) is unchanged. The registry
  references its LOINC codes; a test pins that they agree.

Every setting is an illustrative default inherited from the current
configuration. None is validated for any profile.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

REGISTRY_PATH = Path(__file__).with_name("registry.json")

ProfileCategory = Literal["Syndrome", "Pathogen"]
DataOrigin = Literal["replay-scenario", "replay-derived", "portfolio-fixture"]

LOINC_SYSTEM = "http://loinc.org"
DEMO_TEST_CODE_SYSTEM = "urn:labsentinel:demo-test-code"


@dataclass(frozen=True)
class ProfileTest:
    code: str
    system: str
    name: str
    short_name: str
    specimen: str


@dataclass(frozen=True)
class SurveillanceProfileDefinition:
    id: str
    display_name: str
    short_name: str
    category: ProfileCategory
    active: bool
    description: str
    legacy_syndrome: str | None
    baseline_config_ref: str
    signal_config_ref: str
    replay_available: bool
    live_available: bool
    data_origin: DataOrigin
    test_codes: tuple[str, ...]


@dataclass(frozen=True)
class Registry:
    version: int
    default_profile_id: str
    configs: dict[str, dict]
    tests: tuple[ProfileTest, ...]
    profiles: tuple[SurveillanceProfileDefinition, ...]
    memberships: tuple[tuple[str, str], ...]  # (test_code, profile_id)


def _load(raw: dict) -> Registry:
    tests = tuple(
        ProfileTest(t["code"], t["system"], t["name"], t["shortName"], t["specimen"]) for t in raw["tests"]
    )
    memberships = tuple((m["testCode"], m["profileId"]) for m in raw["memberships"])
    profiles = tuple(
        SurveillanceProfileDefinition(
            id=p["id"],
            display_name=p["displayName"],
            short_name=p["shortName"],
            category=p["category"],
            active=p["active"],
            description=p["description"],
            legacy_syndrome=p["legacySyndrome"],
            baseline_config_ref=p["baselineConfigRef"],
            signal_config_ref=p["signalConfigRef"],
            replay_available=p["replayAvailable"],
            live_available=p["liveAvailable"],
            data_origin=p["dataOrigin"],
            test_codes=tuple(code for code, profile_id in memberships if profile_id == p["id"]),
        )
        for p in raw["profiles"]
    )
    registry = Registry(raw["version"], raw["defaultProfileId"], raw["configs"], tests, profiles, memberships)
    validate(registry)
    return registry


def validate(registry: Registry) -> None:
    """Refuses a registry that could route an observation ambiguously or nowhere."""
    ids = [p.id for p in registry.profiles]
    if len(set(ids)) != len(ids):
        raise ValueError("Profile ids must be unique.")
    codes = [t.code for t in registry.tests]
    if len(set(codes)) != len(codes):
        raise ValueError("Test codes must be unique.")
    if registry.default_profile_id not in ids:
        raise ValueError("The default profile must be defined.")
    if len(set(registry.memberships)) != len(registry.memberships):
        raise ValueError("A test may belong to a profile only once.")
    for code, profile_id in registry.memberships:
        if code not in codes or profile_id not in ids:
            raise ValueError(f"Membership {code} -> {profile_id} names an unknown test or profile.")
    for profile in registry.profiles:
        if not profile.test_codes:
            raise ValueError(f"Profile {profile.id} has no tests.")
        for ref in (profile.baseline_config_ref, profile.signal_config_ref):
            if ref not in registry.configs:
                raise ValueError(f"Profile {profile.id} references unknown configuration {ref}.")
        if profile.live_available and not profile.legacy_syndrome:
            raise ValueError(f"Profile {profile.id} cannot be live without an engine key.")


@lru_cache(maxsize=1)
def get_registry() -> Registry:
    return _load(json.loads(REGISTRY_PATH.read_text(encoding="utf-8")))


def profiles() -> tuple[SurveillanceProfileDefinition, ...]:
    return get_registry().profiles


def get_profile(profile_id: str) -> SurveillanceProfileDefinition | None:
    return next((p for p in profiles() if p.id == profile_id), None)


def profiles_for_test(code: str) -> list[str]:
    """Every profile one result for this test code updates (registry order)."""
    member_of = {profile_id for test_code, profile_id in get_registry().memberships if test_code == code}
    return [p.id for p in profiles() if p.id in member_of]


def settings_for(profile: SurveillanceProfileDefinition) -> dict:
    """The profile's resolved settings: its baseline and signal configuration."""
    configs = get_registry().configs
    baseline = configs[profile.baseline_config_ref]
    signal = configs[profile.signal_config_ref]
    return {
        "label": signal["label"],
        "note": signal["note"],
        "baseline_config_ref": profile.baseline_config_ref,
        "signal_config_ref": profile.signal_config_ref,
        "replay": baseline["replay"],
        "engine": baseline["engine"],
        "ewma": signal["ewma"],
        "cusum": signal["cusum"],
    }
