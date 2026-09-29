from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.simulation import utc_bounds_for_day
from app.models import LabObservation
from app.schemas.lab_observation import ObservationFilters


def _filtered(filters: ObservationFilters) -> Select[tuple[LabObservation]]:
    query = select(LabObservation)
    if filters.day is not None:
        start, end = utc_bounds_for_day(filters.day)
        query = query.where(
            LabObservation.effective_datetime >= start,
            LabObservation.effective_datetime < end,
        )
    if filters.facility_id is not None:
        query = query.where(LabObservation.facility_id == filters.facility_id)
    if filters.loinc_code is not None:
        query = query.where(LabObservation.loinc_code == filters.loinc_code)
    if filters.result is not None:
        query = query.where(LabObservation.result_value == filters.result)
    return query


def list_observations(
    session: Session, filters: ObservationFilters
) -> tuple[list[LabObservation], int]:
    """One page of matching observations, oldest first, plus the total match count."""
    query = _filtered(filters)
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = session.scalars(
        query.order_by(LabObservation.effective_datetime, LabObservation.id)
        .limit(filters.limit)
        .offset(filters.offset)
    )
    return list(items), total


def get_observation(session: Session, observation_id: int) -> LabObservation | None:
    return session.get(LabObservation, observation_id)
