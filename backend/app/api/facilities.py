from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.facility import FacilityRead
from app.services import facility_service

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


@router.get("", response_model=list[FacilityRead])
def list_facilities(db: Session = Depends(get_db)) -> list[FacilityRead]:
    """All active participating facilities."""
    return [FacilityRead.model_validate(f) for f in facility_service.list_active_facilities(db)]


@router.get(
    "/{facility_id}",
    response_model=FacilityRead,
    responses={status.HTTP_404_NOT_FOUND: {"description": "No such facility."}},
)
def get_facility(facility_id: int, db: Session = Depends(get_db)) -> FacilityRead:
    facility = facility_service.get_facility(db, facility_id)
    if facility is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Facility not found.")
    return FacilityRead.model_validate(facility)
