"""Model behaviour against a schema built by the real Alembic migration."""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AuditEvent, Facility, LabObservation, SurveillanceSignal

EFFECTIVE = datetime(2025, 11, 3, 9, 30, tzinfo=UTC)
RECEIVED = datetime(2025, 11, 3, 9, 42, tzinfo=UTC)


def make_facility(code: str = "HOSP-A", **overrides: object) -> Facility:
    values: dict[str, object] = {
        "name": "Worcester Central Medical Center",
        "vendor": "Epic",
        "facility_code": code,
        "city": "Worcester",
        "region": "MA",
        "country_code": "US",
    }
    values.update(overrides)
    return Facility(**values)


def make_observation(
    facility: Facility | None, source_id: str = "obs-001", **overrides: object
) -> LabObservation:
    """Pass facility=None to set facility_id directly through ``overrides``."""
    values: dict[str, object] = {
        "source_observation_id": source_id,
        "patient_reference": "SYN-PT-0001",
        "syndrome": "Respiratory Viral Syndrome",
        "test_name": "SARS-CoV-2 and Influenza A/B RNA panel",
        "loinc_code": "94500-6",
        "result_type": "coded",
        "result_value": "Positive",
        "effective_datetime": EFFECTIVE,
        "received_datetime": RECEIVED,
        "geographic_unit": "01604",
        "source_system": "simulated-epic",
    }
    if facility is not None:
        values["facility"] = facility
    values.update(overrides)
    return LabObservation(**values)


def make_signal(**overrides: object) -> SurveillanceSignal:
    values: dict[str, object] = {
        "syndrome": "Respiratory Viral Syndrome",
        "signal_date": date(2025, 11, 7),
        "test_volume": 420,
        "baseline_volume": Decimal("300.00"),
        "positive_count": 84,
        "positivity_rate": Decimal("20.00"),
        "baseline_positivity_rate": Decimal("8.00"),
        "affected_facilities": 3,
        "affected_geographies": ["01604", "01605", "01545"],
        "persistence_days": 4,
        "composite_score": Decimal("88.50"),
        "severity": "Critical",
        "data_confidence_score": Decimal("91.20"),
        "data_confidence_level": "Very High",
    }
    values.update(overrides)
    return SurveillanceSignal(**values)


def test_facility_defaults_are_applied(db_session: Session) -> None:
    facility = make_facility()
    db_session.add(facility)
    db_session.commit()
    db_session.refresh(facility)

    assert facility.id is not None
    assert facility.active is True
    assert facility.created_at is not None
    assert facility.updated_at is not None


def test_facility_has_many_observations(db_session: Session) -> None:
    facility = make_facility()
    db_session.add_all(
        [make_observation(facility, "obs-001"), make_observation(facility, "obs-002")]
    )
    db_session.commit()

    stored = db_session.scalars(select(LabObservation).order_by(LabObservation.id)).all()
    assert [obs.source_observation_id for obs in stored] == ["obs-001", "obs-002"]
    assert all(obs.facility_id == facility.id for obs in stored)
    assert all(obs.status == "final" for obs in stored)
    assert {obs.id for obs in facility.observations} == {obs.id for obs in stored}
    assert stored[0].facility.facility_code == "HOSP-A"


def test_facility_code_is_unique(db_session: Session) -> None:
    db_session.add_all([make_facility("HOSP-A"), make_facility("HOSP-A", name="Other")])

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_source_observation_cannot_be_stored_twice(db_session: Session) -> None:
    facility = make_facility()
    db_session.add_all(
        [make_observation(facility, "obs-001"), make_observation(facility, "obs-001")]
    )

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_source_id_from_different_systems_is_allowed(db_session: Session) -> None:
    facility = make_facility()
    db_session.add_all(
        [
            make_observation(facility, "obs-001", source_system="simulated-epic"),
            make_observation(facility, "obs-001", source_system="simulated-meditech"),
        ]
    )
    db_session.commit()

    assert len(db_session.scalars(select(LabObservation)).all()) == 2


def test_observation_requires_an_existing_facility(db_session: Session) -> None:
    db_session.add(make_observation(None, facility_id=9999))

    with pytest.raises(IntegrityError, match="FOREIGN KEY"):
        db_session.commit()


def test_facility_with_observations_cannot_be_deleted(db_session: Session) -> None:
    facility = make_facility()
    db_session.add(make_observation(facility))
    db_session.commit()

    db_session.delete(facility)
    # Must be the foreign key refusing, not the ORM nulling facility_id and
    # tripping NOT NULL.
    with pytest.raises(IntegrityError, match="FOREIGN KEY"):
        db_session.commit()


@pytest.mark.parametrize("status", ["final", "entered-in-error"])
def test_observation_accepts_fhir_statuses(db_session: Session, status: str) -> None:
    db_session.add(make_observation(make_facility(), status=status))
    db_session.commit()


def test_observation_rejects_unknown_status(db_session: Session) -> None:
    db_session.add(make_observation(make_facility(), status="done"))

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_observation_has_no_direct_patient_identifier_columns() -> None:
    columns = set(LabObservation.__table__.columns.keys())
    forbidden = {"patient_name", "name", "address", "dob", "birth_date", "ssn", "mrn"}
    assert not columns & forbidden


def test_signal_round_trips_scores_and_geographies(db_session: Session) -> None:
    db_session.add(make_signal())
    db_session.commit()

    signal = db_session.scalars(select(SurveillanceSignal)).one()
    assert signal.status == "NEW"
    assert signal.severity == "Critical"
    assert signal.composite_score == Decimal("88.50")
    assert signal.data_confidence_level == "Very High"
    assert signal.affected_geographies == ["01604", "01605", "01545"]


def test_signal_confidence_may_be_unknown(db_session: Session) -> None:
    db_session.add(make_signal(data_confidence_score=None, data_confidence_level=None))
    db_session.commit()


@pytest.mark.parametrize(
    "overrides",
    [
        {"severity": "Severe"},
        {"status": "RESOLVED"},
        {"data_confidence_level": "Medium"},
        {"composite_score": Decimal("100.01")},
        {"data_confidence_score": Decimal("-1")},
        {"positive_count": 500, "test_volume": 420},
        {"positivity_rate": Decimal("101")},
    ],
)
def test_signal_rejects_out_of_vocabulary_or_range_values(
    db_session: Session, overrides: dict[str, object]
) -> None:
    db_session.add(make_signal(**overrides))

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_audit_event_is_recorded(db_session: Session) -> None:
    db_session.add(
        AuditEvent(
            event_type="facility.created",
            entity_type="facility",
            entity_id="1",
            description="Registered synthetic facility HOSP-A.",
        )
    )
    db_session.commit()

    event = db_session.scalars(select(AuditEvent)).one()
    assert event.id is not None
    assert event.created_at is not None
