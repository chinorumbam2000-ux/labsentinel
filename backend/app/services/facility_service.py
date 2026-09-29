from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Facility


def list_active_facilities(session: Session) -> list[Facility]:
    return list(
        session.scalars(
            select(Facility).where(Facility.active.is_(True)).order_by(Facility.facility_code)
        )
    )


def get_facility(session: Session, facility_id: int) -> Facility | None:
    return session.get(Facility, facility_id)
