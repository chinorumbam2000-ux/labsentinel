from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.simulation import utc_bounds_for_day
from app.models import Facility, LabObservation
from app.schemas.lab_observation import ObservationFilters

SORT_COLUMNS = {
    "effective_datetime": LabObservation.effective_datetime,
    "facility_name": Facility.name,
    "vendor": Facility.vendor,
    "patient_reference": LabObservation.patient_reference,
    "result": LabObservation.result_value,
    "test_name": LabObservation.test_name,
}


def _search_text():
    """
    The searchable fields joined by single spaces and lower-cased, so a term
    matches exactly as the prototype's browser search does (a substring of
    the space-joined fields).
    """
    fields = [
        LabObservation.source_observation_id,
        LabObservation.patient_reference,
        Facility.name,
        Facility.vendor,
        LabObservation.test_name,
        LabObservation.loinc_code,
        LabObservation.geographic_unit,
        func.coalesce(LabObservation.result_value, ""),
    ]
    joined = fields[0]
    for field in fields[1:]:
        joined = joined + " " + field
    return func.lower(joined)


def _filtered(filters: ObservationFilters) -> Select[tuple[LabObservation]]:
    query = select(LabObservation).join(Facility, LabObservation.facility_id == Facility.id)
    if filters.day is not None:
        start, end = utc_bounds_for_day(filters.day)
        query = query.where(
            LabObservation.effective_datetime >= start,
            LabObservation.effective_datetime < end,
        )
    if filters.through_day is not None:
        _, end = utc_bounds_for_day(filters.through_day)
        query = query.where(LabObservation.effective_datetime < end)
    if filters.facility_id is not None:
        query = query.where(LabObservation.facility_id == filters.facility_id)
    if filters.vendor is not None:
        query = query.where(Facility.vendor == filters.vendor)
    if filters.loinc_code is not None:
        query = query.where(LabObservation.loinc_code == filters.loinc_code)
    if filters.result is not None:
        query = query.where(LabObservation.result_value == filters.result)
    term = (filters.q or "").strip().lower()
    if term:
        query = query.where(_search_text().contains(term, autoescape=True))
    return query


def list_observations(
    session: Session, filters: ObservationFilters
) -> tuple[list[LabObservation], int]:
    """One page of matching observations plus the total match count."""
    query = _filtered(filters)
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    column = SORT_COLUMNS[filters.sort]
    primary = column.desc() if filters.order == "desc" else column.asc()
    # Ties always fall back to source order, ascending, in both directions.
    items = session.scalars(
        query.order_by(primary, LabObservation.id).limit(filters.limit).offset(filters.offset)
    )
    return list(items), total


def get_observation(session: Session, observation_id: int) -> LabObservation | None:
    return session.get(LabObservation, observation_id)
