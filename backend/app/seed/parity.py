"""
Data parity between the database and the React prototype's dataset.

Compares what is persisted against the raw exported frontend values, field by
field. It deliberately reads the export's own field names rather than reusing
the seeder's mapping, so a mapping mistake in the seeder cannot hide itself.
"""

from collections import Counter
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.simulation import as_simulation_local
from app.models import DemoSimulationDay, Facility, LabObservation, SurveillanceSignal
from app.seed.dataset import to_decimal


def compare_with_frontend(session: Session, raw: dict[str, Any]) -> list[str]:
    """Return every difference found; an empty list means full parity."""
    problems: list[str] = []

    def check(label: str, stored: Any, expected: Any) -> None:
        if stored != expected:
            problems.append(f"{label}: database={stored!r} frontend={expected!r}")

    # Facilities and their vendor association.
    facilities = {
        f.facility_code: f
        for f in session.scalars(select(Facility).where(Facility.participation == "participating"))
    }
    check("facility codes", sorted(facilities), sorted(f["code"] for f in raw["facilities"]))
    for f in raw["facilities"]:
        stored = facilities.get(f["code"])
        if stored is None:
            continue
        for label, got, want in (
            ("name", stored.name, f["name"]),
            ("vendor", stored.vendor, f["vendor"]),
            ("city", stored.city, f["city"]),
            ("postal code", stored.postal_code, f["zipCode"]),
            ("subregion", stored.subregion, f["county"]),
            ("region", stored.region, f["state"]),
            ("country", stored.country_code, raw["countryCode"]),
        ):
            check(f"{f['code']} {label}", got, want)

    # Observations, one by one. Only the seeded records are the prototype's
    # dataset; observations from other sources (FHIR ingestion) coexist and
    # are deliberately not part of this comparison.
    seed_systems = [f["environmentLabel"] for f in raw["facilities"]]
    stored_obs = {
        o.source_observation_id: o
        for o in session.scalars(
            select(LabObservation)
            .where(LabObservation.source_system.in_(seed_systems))
            .options(selectinload(LabObservation.facility))
        )
    }
    check("observation count", len(stored_obs), len(raw["observations"]))
    for o in raw["observations"]:
        stored = stored_obs.get(o["id"])
        if stored is None:
            problems.append(f"{o['id']}: missing from database")
            continue
        local = as_simulation_local(stored.effective_datetime).strftime("%Y-%m-%dT%H:%M:%S")
        for label, got, want in (
            ("facility", stored.facility.facility_code, o["facilityCode"]),
            ("patient reference", stored.patient_reference, o["patientReference"]),
            ("syndrome", stored.syndrome, o["syndrome"]),
            ("test name", stored.test_name, o["testName"]),
            ("LOINC", stored.loinc_code, o["loincCode"]),
            ("result", stored.result_value, o["result"]),
            ("effective time", local, o["effectiveDateTime"]),
            ("geographic unit", stored.geographic_unit, o["zipCode"]),
            ("status", stored.status, o["status"]),
        ):
            check(f"{o['id']} {label}", got, want)

    check(
        "LOINC concepts",
        sorted({o.loinc_code for o in stored_obs.values()}),
        sorted(t["loincCode"] for t in raw["labTests"]),
    )
    check(
        "results",
        Counter(o.result_value for o in stored_obs.values()),
        Counter(o["result"] for o in raw["observations"]),
    )

    # Simulation days: signal values and narrative.
    demo_days = {
        d.day: d
        for d in session.scalars(select(DemoSimulationDay).options(selectinload(DemoSimulationDay.signal)))
    }
    check("simulation days", sorted(demo_days), [d["day"] for d in raw["days"]])
    signal_dates = {s.signal_date for s in session.scalars(select(SurveillanceSignal))}
    check("signal count", len(signal_dates), len(raw["days"]))

    for d in raw["days"]:
        demo_day = demo_days.get(d["day"])
        if demo_day is None:
            continue
        s = demo_day.signal
        prefix = f"day {d['day']}"
        for label, got, want in (
            ("date", s.signal_date, date.fromisoformat(d["simulationDate"])),
            ("stage", demo_day.stage, d["stage"]),
            ("syndrome", s.syndrome, raw["syndrome"]),
            ("tests", s.test_volume, d["totalTests"]),
            ("positives", s.positive_count, d["totalPositives"]),
            ("positivity %", Decimal(s.positivity_rate), to_decimal(d["positivityRate"])),
            ("baseline tests", Decimal(s.baseline_volume), to_decimal(raw["baseline"]["testVolume"])),
            ("baseline positivity %", Decimal(s.baseline_positivity_rate), to_decimal(raw["baseline"]["positivityRate"])),
            ("affected facilities", s.affected_facilities, len(d["affectedFacilityCodes"])),
            ("affected geographies", s.affected_geographies, d["affectedGeographies"]),
            ("persistence days", s.persistence_days, d["persistenceDays"]),
            ("composite score", Decimal(s.composite_score), to_decimal(d["compositeScore"])),
            ("severity", s.severity, d["severity"]),
            ("data confidence", Decimal(s.data_confidence_score), to_decimal(d["dataConfidenceScore"])),
            ("confidence level", s.data_confidence_level, d["dataConfidenceLevel"]),
        ):
            check(f"{prefix} {label}", got, want)

        todays = [o for o in stored_obs.values() if as_simulation_local(o.effective_datetime).date() == s.signal_date]
        check(f"{prefix} observations on date", len(todays), d["totalTests"])
        check(
            f"{prefix} positive observations on date",
            sum(1 for o in todays if o.result_value == "Positive"),
            d["totalPositives"],
        )

    return problems
