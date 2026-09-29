"""
Seed contract: exact counts, idempotency and frontend parity.

Runs on SQLite here and, via tests/integration/test_seed_postgres.py, on
PostgreSQL with the same test bodies.
"""

import json
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    DemoSimulationDay,
    Facility,
    LabObservation,
    SurveillanceSignal,
)
from app.seed import DATASET_PATH, load_dataset, seed_demo_dataset
from app.seed.dataset import DatasetError
from app.seed.parity import compare_with_frontend

# The prototype's dataset as inspected: 3 facilities, 699 observations
# (99 positive), five simulation days.
EXPECTED_FACILITIES = 3
EXPECTED_OBSERVATIONS = 699
EXPECTED_POSITIVES = 99
EXPECTED_DAYS = 5


def count(session: Session, model: type) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def seed(session: Session):
    report = seed_demo_dataset(session, load_dataset())
    session.commit()
    return report


def test_fixture_matches_the_inspected_prototype_dataset() -> None:
    raw = json.loads(DATASET_PATH.read_text(encoding="utf-8"))

    assert [(f["code"], f["name"], f["vendor"], f["zipCode"]) for f in raw["facilities"]] == [
        ("HOSP-A", "Worcester Central Medical Center", "Epic", "01604"),
        ("HOSP-B", "Central Massachusetts Regional Hospital", "Oracle Health", "01605"),
        ("HOSP-C", "Shrewsbury Community Medical Center", "MEDITECH", "01545"),
    ]
    assert [t["loincCode"] for t in raw["labTests"]] == ["92142-9", "94500-6", "85479-4"]
    assert len(raw["observations"]) == EXPECTED_OBSERVATIONS
    assert [
        (d["totalTests"], d["totalPositives"], d["compositeScore"], d["severity"])
        for d in raw["days"]
    ] == [
        (100, 8, 0, "Low"),
        (124, 12, 24, "Watch"),
        (141, 19, 50, "Moderate"),
        (158, 26, 74, "High"),
        (176, 34, 87, "Critical"),
    ]


def test_seed_creates_the_expected_rows(empty_session: Session) -> None:
    report = seed(empty_session)

    assert count(empty_session, Facility) == EXPECTED_FACILITIES
    assert count(empty_session, LabObservation) == EXPECTED_OBSERVATIONS
    assert count(empty_session, SurveillanceSignal) == EXPECTED_DAYS
    assert count(empty_session, DemoSimulationDay) == EXPECTED_DAYS
    assert (
        empty_session.scalar(
            select(func.count())
            .select_from(LabObservation)
            .where(LabObservation.result_value == "Positive")
        )
        == EXPECTED_POSITIVES
    )
    assert report.observations.inserted == EXPECTED_OBSERVATIONS
    assert report.changed


def test_seeding_twice_creates_no_duplicates(empty_session: Session) -> None:
    seed(empty_session)
    second = seed(empty_session)

    assert not second.changed
    assert second.facilities.unchanged == EXPECTED_FACILITIES
    assert second.observations.unchanged == EXPECTED_OBSERVATIONS
    assert second.signals.unchanged == EXPECTED_DAYS
    assert second.demo_days.unchanged == EXPECTED_DAYS
    assert count(empty_session, Facility) == EXPECTED_FACILITIES
    assert count(empty_session, LabObservation) == EXPECTED_OBSERVATIONS
    assert count(empty_session, SurveillanceSignal) == EXPECTED_DAYS
    # Only a run that changed data is audited.
    assert count(empty_session, AuditEvent) == 1


def test_seeded_database_has_parity_with_the_frontend(empty_session: Session) -> None:
    seed(empty_session)
    raw = json.loads(DATASET_PATH.read_text(encoding="utf-8"))

    assert compare_with_frontend(empty_session, raw) == []


def test_parity_check_detects_drift(empty_session: Session) -> None:
    seed(empty_session)
    signal = empty_session.scalars(
        select(SurveillanceSignal).order_by(SurveillanceSignal.signal_date.desc())
    ).first()
    signal.composite_score = Decimal("86")
    empty_session.commit()
    raw = json.loads(DATASET_PATH.read_text(encoding="utf-8"))

    problems = compare_with_frontend(empty_session, raw)

    # Exactly one difference, on the tampered field. The stored value's
    # rendering differs by backend (SQLite "86", PostgreSQL "86.00").
    assert len(problems) == 1, problems
    assert problems[0].startswith("day 5 composite score: database=Decimal('86")
    assert problems[0].endswith("frontend=Decimal('87.00')")


def test_reseed_restores_drifted_values(empty_session: Session) -> None:
    seed(empty_session)
    observation = empty_session.scalars(
        select(LabObservation).where(LabObservation.source_observation_id == "OBS-0001")
    ).one()
    observation.result_value = "Positive"
    empty_session.commit()

    report = seed(empty_session)

    assert report.observations.updated == 1
    empty_session.refresh(observation)
    assert observation.result_value == "Negative"


def test_reseed_keeps_analyst_review_status(empty_session: Session) -> None:
    seed(empty_session)
    signal = empty_session.scalars(select(SurveillanceSignal)).first()
    signal.status = "UNDER REVIEW"
    empty_session.commit()

    report = seed(empty_session)

    assert not report.changed
    empty_session.refresh(signal)
    assert signal.status == "UNDER REVIEW"


def test_seeded_observations_are_synthetic_only(empty_session: Session) -> None:
    seed(empty_session)
    references = empty_session.scalars(select(LabObservation.patient_reference)).all()

    assert all(ref.startswith("SYN-P") for ref in references)
    assert len(set(references)) == EXPECTED_OBSERVATIONS
    received = empty_session.scalars(select(LabObservation.received_datetime)).all()
    assert set(received) == {None}


def test_dataset_whose_totals_do_not_reconcile_is_rejected(tmp_path) -> None:
    raw = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    raw["days"][4]["totalPositives"] += 1
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(DatasetError, match="Day 5"):
        load_dataset(broken)
