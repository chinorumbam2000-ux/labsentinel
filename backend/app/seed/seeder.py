"""
Idempotent development seed of the synthetic demonstration dataset.

Every row is matched on the natural key the database already enforces:

    facility              facility_code
    lab_observation       (source_system, source_observation_id)
    surveillance_signal   (mode = 'demo', syndrome, signal_date)
    demo_simulation_day   day

A row that exists and matches is left alone; one that differs is updated to
the dataset's values; a missing one is inserted. Running the seed twice
therefore inserts nothing and changes nothing the second time.

A signal's review ``status`` is never overwritten: it belongs to analysts,
not to the seed.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    DemoSimulationDay,
    Facility,
    LabObservation,
    SurveillanceSignal,
)
from app.seed.dataset import DemoDataset


@dataclass
class TableCounts:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0

    def __str__(self) -> str:
        return f"{self.inserted} inserted, {self.updated} updated, {self.unchanged} unchanged"


@dataclass
class SeedReport:
    facilities: TableCounts = field(default_factory=TableCounts)
    observations: TableCounts = field(default_factory=TableCounts)
    signals: TableCounts = field(default_factory=TableCounts)
    demo_days: TableCounts = field(default_factory=TableCounts)

    @property
    def changed(self) -> bool:
        return any(
            counts.inserted or counts.updated
            for counts in (self.facilities, self.observations, self.signals, self.demo_days)
        )

    def lines(self) -> list[str]:
        return [
            f"facility             {self.facilities}",
            f"lab_observation      {self.observations}",
            f"surveillance_signal  {self.signals}",
            f"demo_simulation_day  {self.demo_days}",
        ]


def _same(current: Any, wanted: Any) -> bool:
    # SQLite (unit tests only) hands back naive datetimes; everything is
    # written in UTC, so compare on that basis.
    if isinstance(current, datetime) and current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    return current == wanted


def _apply(instance: Any, values: dict[str, Any], counts: TableCounts) -> None:
    changed = False
    for name, wanted in values.items():
        if not _same(getattr(instance, name), wanted):
            setattr(instance, name, wanted)
            changed = True
    if changed:
        counts.updated += 1
    else:
        counts.unchanged += 1


def seed_demo_dataset(session: Session, dataset: DemoDataset) -> SeedReport:
    """Upsert the dataset. The caller owns the transaction (commit/rollback)."""
    report = SeedReport()

    facilities = {f.facility_code: f for f in session.scalars(select(Facility))}
    for row in dataset.facilities:
        values = {
            "name": row.name,
            "vendor": row.vendor,
            "city": row.city,
            "postal_code": row.postal_code,
            "subregion": row.subregion,
            "region": row.region,
            "country_code": row.country_code,
            "active": True,
        }
        existing = facilities.get(row.facility_code)
        if existing is None:
            facilities[row.facility_code] = Facility(facility_code=row.facility_code, **values)
            session.add(facilities[row.facility_code])
            report.facilities.inserted += 1
        else:
            _apply(existing, values, report.facilities)
    session.flush()

    observations = {
        (o.source_system, o.source_observation_id): o
        for o in session.scalars(select(LabObservation))
    }
    for row in dataset.observations:
        values = {
            "facility_id": facilities[row.facility_code].id,
            "patient_reference": row.patient_reference,
            "syndrome": row.syndrome,
            "test_name": row.test_name,
            "loinc_code": row.loinc_code,
            "result_type": "coded",
            "result_value": row.result_value,
            "result_unit": None,
            "effective_datetime": row.effective_datetime,
            # The prototype records no receipt time; unknown stays unknown.
            "received_datetime": None,
            "geographic_unit": row.geographic_unit,
            "status": row.status,
        }
        key = (row.source_system, row.source_observation_id)
        existing = observations.get(key)
        if existing is None:
            session.add(
                LabObservation(
                    source_system=row.source_system,
                    source_observation_id=row.source_observation_id,
                    **values,
                )
            )
            report.observations.inserted += 1
        else:
            _apply(existing, values, report.observations)
    session.flush()

    # Only the frozen demonstration's signals: dynamic signals are the engine's.
    signals = {
        (s.syndrome, s.signal_date): s
        for s in session.scalars(select(SurveillanceSignal).where(SurveillanceSignal.mode == "demo"))
    }
    demo_days = {d.day: d for d in session.scalars(select(DemoSimulationDay))}
    for row in dataset.signals:
        values = {
            "test_volume": row.test_volume,
            "baseline_volume": row.baseline_volume,
            "positive_count": row.positive_count,
            "positivity_rate": row.positivity_rate,
            "baseline_positivity_rate": row.baseline_positivity_rate,
            "affected_facilities": row.affected_facilities,
            "affected_geographies": row.affected_geographies,
            "persistence_days": row.persistence_days,
            "composite_score": row.composite_score,
            "severity": row.severity,
            "data_confidence_score": row.data_confidence_score,
            "data_confidence_level": row.data_confidence_level,
        }
        signal = signals.get((row.syndrome, row.signal_date))
        if signal is None:
            signal = SurveillanceSignal(
                mode="demo", syndrome=row.syndrome, signal_date=row.signal_date, **values
            )
            session.add(signal)
            report.signals.inserted += 1
        else:
            _apply(signal, values, report.signals)
        session.flush()

        day_values = {
            "simulation_date": row.signal_date,
            "stage": row.stage,
            "description": row.description,
            "signal_id": signal.id,
        }
        demo_day = demo_days.get(row.day)
        if demo_day is None:
            session.add(DemoSimulationDay(day=row.day, **day_values))
            report.demo_days.inserted += 1
        else:
            _apply(demo_day, day_values, report.demo_days)
    session.flush()

    if report.changed:
        session.add(
            AuditEvent(
                event_type="seed.demo_dataset",
                entity_type="dataset",
                entity_id="labsentinel_demo_dataset",
                description="Synthetic demonstration dataset seeded. " + "; ".join(report.lines()),
            )
        )
        session.flush()

    return report
