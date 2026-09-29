"""
Loading and mapping the prototype's exported synthetic dataset.

The dataset file is generated from the React prototype by
``scripts/export-demo-dataset.ts``. This module only reads it and maps its
fields onto the persistence model; it computes no surveillance value of its
own. Scores, severities and confidence values are taken as exported.
"""

import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

from app.core.simulation import (
    FIRST_DAY,
    LAST_DAY,
    SIMULATION_START_DATE,
    SIMULATION_TIMEZONE,
)

DATASET_PATH = Path(__file__).parent / "data" / "labsentinel_demo_dataset.json"

TWO_PLACES = Decimal("0.01")


class DatasetError(ValueError):
    """The dataset file is inconsistent and must not be seeded."""


@dataclass(frozen=True)
class FacilityRow:
    facility_code: str
    name: str
    vendor: str
    city: str
    postal_code: str
    subregion: str
    region: str
    country_code: str
    source_system: str


@dataclass(frozen=True)
class ObservationRow:
    source_observation_id: str
    facility_code: str
    patient_reference: str
    syndrome: str
    test_name: str
    loinc_code: str
    result_value: str
    effective_datetime: datetime
    geographic_unit: str
    source_system: str
    status: str


@dataclass(frozen=True)
class SignalRow:
    day: int
    stage: str
    description: str
    syndrome: str
    signal_date: date
    test_volume: int
    baseline_volume: Decimal
    positive_count: int
    positivity_rate: Decimal
    baseline_positivity_rate: Decimal
    affected_facilities: int
    affected_geographies: list[str]
    persistence_days: int
    composite_score: Decimal
    severity: str
    data_confidence_score: Decimal
    data_confidence_level: str


@dataclass(frozen=True)
class DemoDataset:
    facilities: list[FacilityRow]
    observations: list[ObservationRow]
    signals: list[SignalRow]
    raw: dict[str, Any]


def to_decimal(value: float | int) -> Decimal:
    """Round to the two decimal places the schema stores (half-up)."""
    return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def parse_local_timestamp(value: str) -> datetime:
    """Read the prototype's zone-less wall-clock time; return it in UTC."""
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is not None:
        raise DatasetError(f"Expected a zone-less simulation timestamp, got {value!r}")
    return parsed.replace(tzinfo=SIMULATION_TIMEZONE).astimezone(UTC)


def load_dataset(path: Path = DATASET_PATH) -> DemoDataset:
    raw = json.loads(path.read_text(encoding="utf-8"))

    if date.fromisoformat(raw["simulationStartDate"]) != SIMULATION_START_DATE:
        raise DatasetError("Dataset simulation start date does not match the backend calendar.")

    source_system_by_code = {f["code"]: f["environmentLabel"] for f in raw["facilities"]}
    facilities = [
        FacilityRow(
            facility_code=f["code"],
            name=f["name"],
            vendor=f["vendor"],
            city=f["city"],
            postal_code=f["zipCode"],
            subregion=f["county"],
            region=f["state"],
            country_code=raw["countryCode"],
            source_system=f["environmentLabel"],
        )
        for f in raw["facilities"]
    ]

    observations = []
    for o in raw["observations"]:
        if o["facilityCode"] not in source_system_by_code:
            raise DatasetError(f"{o['id']} references unknown facility {o['facilityCode']!r}")
        observations.append(
            ObservationRow(
                source_observation_id=o["id"],
                facility_code=o["facilityCode"],
                patient_reference=o["patientReference"],
                syndrome=o["syndrome"],
                test_name=o["testName"],
                loinc_code=o["loincCode"],
                result_value=o["result"],
                effective_datetime=parse_local_timestamp(o["effectiveDateTime"]),
                geographic_unit=o["zipCode"],
                source_system=source_system_by_code[o["facilityCode"]],
                status=o["status"],
            )
        )

    baseline = raw["baseline"]
    signals = [
        SignalRow(
            day=d["day"],
            stage=d["stage"],
            description=d["description"],
            syndrome=raw["syndrome"],
            signal_date=date.fromisoformat(d["simulationDate"]),
            test_volume=d["totalTests"],
            baseline_volume=to_decimal(baseline["testVolume"]),
            positive_count=d["totalPositives"],
            positivity_rate=to_decimal(d["positivityRate"]),
            baseline_positivity_rate=to_decimal(baseline["positivityRate"]),
            affected_facilities=len(d["affectedFacilityCodes"]),
            affected_geographies=list(d["affectedGeographies"]),
            persistence_days=d["persistenceDays"],
            composite_score=to_decimal(d["compositeScore"]),
            severity=d["severity"],
            data_confidence_score=to_decimal(d["dataConfidenceScore"]),
            data_confidence_level=d["dataConfidenceLevel"],
        )
        for d in raw["days"]
    ]

    days = [s.day for s in signals]
    if days != list(range(FIRST_DAY, LAST_DAY + 1)):
        raise DatasetError(f"Expected simulation days {FIRST_DAY}-{LAST_DAY}, got {days}")
    # Each day's observations must reconcile with its totals, exactly as the
    # prototype guarantees; a mismatch means the export is broken.
    for signal in signals:
        todays = [o for o in raw["observations"] if o["day"] == signal.day]
        positives = sum(1 for o in todays if o["result"] == "Positive")
        if (len(todays), positives) != (signal.test_volume, signal.positive_count):
            raise DatasetError(
                f"Day {signal.day}: {len(todays)} observations / {positives} positive "
                f"do not match totals {signal.test_volume} / {signal.positive_count}"
            )

    return DemoDataset(facilities=facilities, observations=observations, signals=signals, raw=raw)
