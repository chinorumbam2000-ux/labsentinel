"""
``python -m app.seed.dynamic_dataset``: the synthetic dynamic-surveillance dataset.

DEVELOPMENT ONLY. Deterministic synthetic FHIR R4 laboratory Observations for
the dynamic surveillance engine, sent through the real FHIR ingestion
pipeline (validation, facility resolution, terminology, pseudonymisation,
duplicate detection), so every row is an ordinary FHIR-ingested observation.
Each is ingested with a simulated delivery time (``received_at``) a few
minutes after its effective time, as a laboratory feed would deliver it.

It is separate from the frozen five-day demonstration: different dates
(January 2026, outside Nov 3-7 2025), a different source system, and it never
changes the demonstration's 699 observations or signals.

The story, for Respiratory Viral Syndrome at the three participating
facilities (all synthetic):

    Jan 1-5    history begins; too little for a baseline (INSUFFICIENT_BASELINE)
    Jan 6-14   steady baseline: about 48 tests a day, about 8 % positive
    Jan 15     Worcester Central (HOSP-A) volume and positivity rise
    Jan 16     Central Mass Regional (HOSP-B) becomes abnormal too
    Jan 17-20  Shrewsbury Community (HOSP-C) joins; positivity keeps climbing

Shrewsbury Community also sends one SARS-CoV-2 result a day under a LOINC
code LabSentinel does not map (94309-2). It is stored as unmapped, never
counted, and shows up in Data Confidence as terminology mapping quality.

The engine calculates whatever follows from these data; nothing here sets a
score.

    python -m app.seed.dynamic_dataset                     all 20 days
    python -m app.seed.dynamic_dataset --phase baseline    Jan 1-14 only
    python -m app.seed.dynamic_dataset --phase outbreak    Jan 15-20 only
    python -m app.seed.dynamic_dataset --remove            remove these observations
"""

import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_session_factory
from app.models import AuditEvent, LabObservation
from app.services.fhir_ingestion import ingest_document

ZONE = ZoneInfo("America/New_York")
FIRST_DAY = date(2026, 1, 1)
OUTBREAK_START = date(2026, 1, 15)
LAST_DAY = date(2026, 1, 20)
IDENTIFIER_PREFIX = "urn:labsentinel:synthetic:dynamic-surveillance:"
SOURCE_PREFIX = "fhir:" + IDENTIFIER_PREFIX

# Tests and positive results per day, Jan 1 to Jan 20, per facility.
TESTS = {
    "HOSP-A": [20, 21, 19, 20, 21, 19, 20, 20, 21, 19, 20, 21, 19, 20, 26, 30, 34, 38, 42, 46],
    "HOSP-B": [16, 15, 17, 16, 16, 17, 15, 16, 17, 16, 15, 16, 17, 16, 16, 20, 24, 28, 32, 36],
    "HOSP-C": [12, 13, 12, 11, 12, 12, 13, 12, 11, 12, 13, 12, 12, 11, 12, 12, 15, 18, 21, 24],
}
POSITIVES = {
    "HOSP-A": [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 4, 7, 9, 11, 15, 19],
    "HOSP-B": [1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 3, 5, 7, 10, 13],
    "HOSP-C": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 4, 6, 8],
}
# Minutes from collection to delivery: base + (index * step) % spread.
DELAYS = {"HOSP-A": (12, 7, 18), "HOSP-B": (18, 11, 25), "HOSP-C": (25, 13, 30)}
FACILITY_DISPLAY = {
    "HOSP-A": "Worcester Central Medical Center (synthetic)",
    "HOSP-B": "Central Massachusetts Regional Hospital (synthetic)",
    "HOSP-C": "Shrewsbury Community Medical Center (synthetic)",
}
TESTS_BY_INDEX = (
    ("92142-9", "Influenza virus A RNA [Presence] in Respiratory system specimen by NAA with probe detection"),
    ("94500-6", "SARS-CoV-2 (COVID-19) RNA [Presence] in Respiratory system specimen by NAA with probe detection"),
    ("85479-4", "Respiratory syncytial virus RNA [Presence] in Respiratory system specimen by NAA with probe detection"),
)
UNMAPPED_TEST = ("94309-2", "SARS-CoV-2 (COVID-19) RNA [Presence] in Specimen by NAA with probe detection")
POSITIVE_RESULT = ("10828004", "Positive")
NEGATIVE_RESULT = ("260385009", "Negative")


def days() -> list[date]:
    return [FIRST_DAY + timedelta(days=i) for i in range((LAST_DAY - FIRST_DAY).days + 1)]


@dataclass(frozen=True)
class Planned:
    resource: dict
    received_at: datetime


def _observation(code: str, day: date, index: int, count: int, loinc: tuple[str, str],
                 positive: bool, with_specimen: bool, suffix: str | None = None) -> Planned:
    minutes = 7 * 60 + index * (13 * 60 // count)
    effective = datetime.combine(day, time.min, ZONE) + timedelta(minutes=minutes)
    base, step, spread = DELAYS[code]
    received = effective + timedelta(minutes=base + (index * step) % spread)
    ident = f"DYN-{code}-{day:%Y%m%d}-{suffix or f'{index:03d}'}"
    result_code, result_text = POSITIVE_RESULT if positive else NEGATIVE_RESULT
    resource: dict = {
        "resourceType": "Observation",
        "id": ident.lower(),
        "meta": {"tag": [{"system": "urn:labsentinel:data", "code": "synthetic", "display": "Synthetic capstone data"}]},
        "identifier": [{"system": IDENTIFIER_PREFIX + code.lower(), "value": ident}],
        "status": "final",
        "category": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
            "code": "laboratory",
            "display": "Laboratory",
        }]}],
        "code": {"coding": [{"system": "http://loinc.org", "code": loinc[0], "display": loinc[1]}], "text": loinc[1]},
        "subject": {"reference": f"Patient/dyn-{code.lower()}-{day:%Y%m%d}-{suffix or index}"},
        "effectiveDateTime": effective.isoformat(),
        "performer": [{
            "identifier": {"system": "urn:labsentinel:facility-code", "value": code},
            "display": FACILITY_DISPLAY[code],
        }],
        "valueCodeableConcept": {
            "coding": [{"system": "http://snomed.info/sct", "code": result_code, "display": result_text}],
            "text": result_text,
        },
    }
    if with_specimen:
        resource["contained"] = [{
            "resourceType": "Specimen",
            "id": "spec",
            "type": {
                "coding": [{"system": "http://snomed.info/sct", "code": "258500001", "display": "Nasopharyngeal swab"}],
                "text": "Nasopharyngeal swab",
            },
        }]
        resource["specimen"] = {"reference": "#spec"}
    return Planned(resource, received.astimezone(UTC))


def planned_observations(phase: str = "all") -> list[Planned]:
    """Every observation of the dataset (or one phase of it), in delivery order."""
    selected = [
        day for day in days()
        if phase == "all" or (phase == "baseline") == (day < OUTBREAK_START)
    ]
    planned: list[Planned] = []
    for day in selected:
        offset = (day - FIRST_DAY).days
        for code in TESTS:
            count, positives = TESTS[code][offset], POSITIVES[code][offset]
            # Positives go to the influenza A tests first: an influenza-led rise.
            order = sorted(range(count), key=lambda i: (i % 3 != 0, i))
            positive_indexes = set(order[:positives])
            for index in range(count):
                with_specimen = not (code == "HOSP-C" and index % 8 == 7)
                planned.append(_observation(
                    code, day, index, count, TESTS_BY_INDEX[index % 3], index in positive_indexes, with_specimen
                ))
            if code == "HOSP-C":
                planned.append(_observation(code, day, 0, count, UNMAPPED_TEST, False, True, suffix="U01"))
    return sorted(planned, key=lambda p: p.received_at)


@dataclass
class LoadReport:
    created: int = 0
    duplicates: int = 0
    rejected: int = 0


def load(session: Session, phase: str = "all", salt: str | None = None) -> LoadReport:
    """Ingest the dataset through the FHIR pipeline. The caller commits."""
    salt = salt or get_settings().fhir_pseudonym_salt.get_secret_value()
    report = LoadReport()
    for item in planned_observations(phase):
        result = ingest_document(session, item.resource, salt=salt, received_at=item.received_at)
        report.created += result.observations_created
        report.duplicates += result.duplicates
        report.rejected += result.rejected
    if report.created:
        session.add(AuditEvent(
            event_type="seed.dynamic_dataset",
            entity_type="dataset",
            entity_id="dynamic-surveillance",
            description=(
                f"Synthetic dynamic-surveillance dataset ({phase}) ingested through the FHIR pipeline: "
                f"{report.created} created, {report.duplicates} already present, {report.rejected} rejected."
            ),
        ))
    return report


def remove(session: Session) -> int:
    removed = session.execute(
        delete(LabObservation).where(LabObservation.source_system.like(SOURCE_PREFIX + "%"))
    ).rowcount
    if removed:
        session.add(AuditEvent(
            event_type="seed.dynamic_dataset.removed",
            entity_type="dataset",
            entity_id="dynamic-surveillance",
            description=f"Removed {removed} synthetic dynamic-surveillance observations.",
        ))
    return removed


def main(argv: list[str]) -> int:
    if get_settings().app_env == "production":
        print("Refusing to load a synthetic development dataset with APP_ENV=production.")
        return 1
    phase = "all"
    if "--phase" in argv:
        position = argv.index("--phase")
        phase = argv[position + 1] if position + 1 < len(argv) else ""
        if phase not in ("all", "baseline", "outbreak"):
            print("--phase must be all, baseline or outbreak.")
            return 2
    with get_session_factory()() as session, session.begin():
        if "--remove" in argv:
            print(f"Removed {remove(session)} dynamic-surveillance observation(s).")
            print("Recalculate with `python -m app.surveillance.run`, or clear with --clear.")
            return 0
        report = load(session, phase)
    print(
        f"Dynamic-surveillance dataset ({phase}): {report.created} created, "
        f"{report.duplicates} already present, {report.rejected} rejected."
    )
    print("Next: python -m app.surveillance.run")
    return 0 if report.rejected == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
