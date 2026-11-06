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

Engine keys. Each profile has an ``engine_key``: the key its dynamic
signals, EWMA and CUSUM results are calculated and stored under (the
``syndrome`` column of surveillance_signal and statistical_signal).
Respiratory Viral Syndrome's key is its legacy syndrome name, so everything
stored before profiles existed still belongs to it. ``scope_for_key`` turns
a key into the observations it covers: the engine itself is unchanged and
simply receives each profile's key (see app/surveillance/aggregator.py).

What does NOT change here:
- ``lab_observation.syndrome`` stays single-valued and unchanged.
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
    engine_key: str | None
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
            engine_key=p["engineKey"],
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
        if profile.live_available and not profile.engine_key:
            raise ValueError(f"Profile {profile.id} cannot be live without an engine key.")
    keys = [p.engine_key for p in registry.profiles if p.engine_key]
    if len(set(keys)) != len(keys):
        raise ValueError("Engine keys must be unique.")


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


@dataclass(frozen=True)
class ObservationScope:
    """
    Which mapped observations an engine key covers.

    ``syndrome`` is the lab_observation.syndrome value they carry;
    ``test_codes`` narrows them to the profile's tests, or is None for every
    test of that syndrome (the legacy behaviour, unchanged).
    """

    key: str
    syndrome: str | None
    test_codes: tuple[str, ...] | None


def scope_for_key(key: str) -> ObservationScope:
    """
    The observations an engine key covers.

    - A legacy syndrome name (Respiratory Viral Syndrome's key, or any other
      syndrome string a caller passes) covers every mapped test of that
      syndrome, exactly as before profiles existed.
    - A profile's own key covers that profile's tests only. Their syndrome is
      read from the FHIR terminology; tests with no terminology mapping (the
      demonstration codes) are never ingested, so such a profile covers no
      observations and the engine produces nothing for it.
    """
    from app.fhir import terminology  # local: keeps the registry importable on its own

    profile = next((p for p in profiles() if p.engine_key == key), None)
    if profile is None or profile.engine_key == profile.legacy_syndrome:
        return ObservationScope(key, key, None)
    syndromes = {m.syndrome for code in profile.test_codes if (m := terminology.lookup(code)) is not None}
    if len(syndromes) != 1:
        return ObservationScope(key, None, profile.test_codes)
    return ObservationScope(key, syndromes.pop(), profile.test_codes)


def resolve_engine_key(syndrome: str | None, profile_id: str | None, default: str) -> str:
    """
    The engine key a request means. ``profile`` names a surveillance profile;
    ``syndrome`` is the older parameter and keeps working. With neither, the
    default (Respiratory Viral Syndrome). Raises LookupError for an unknown
    profile and ValueError when the two disagree or the profile has no key.
    """
    if profile_id is None:
        return syndrome or default
    definition = get_profile(profile_id)
    if definition is None:
        raise LookupError(f"Unknown surveillance profile {profile_id!r}.")
    if not definition.engine_key:
        raise ValueError(f"Profile {profile_id!r} has no engine key.")
    if syndrome is not None and syndrome != definition.engine_key:
        raise ValueError(f"syndrome {syndrome!r} does not match profile {profile_id!r}.")
    return definition.engine_key


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
