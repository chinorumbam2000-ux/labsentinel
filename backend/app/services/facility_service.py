from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Facility


def list_active_facilities(session: Session, include_development: bool = False) -> list[Facility]:
    """Active participating facilities; development sources only when asked for."""
    query = select(Facility).where(Facility.active.is_(True))
    if not include_development:
        query = query.where(Facility.participation == "participating")
    return list(session.scalars(query.order_by(Facility.facility_code)))


def get_facility(session: Session, facility_id: int) -> Facility | None:
    return session.get(Facility, facility_id)
