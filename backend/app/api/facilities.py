from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.facility import FacilityRead
from app.services import facility_service

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


@router.get("", response_model=list[FacilityRead])
def list_facilities(
    participation: Literal["participating", "all"] = Query(
        default="participating",
        description="participating (default): the surveillance network. all: also development sources.",
    ),
    db: Session = Depends(get_db),
) -> list[FacilityRead]:
    """Active participating facilities (development sources with participation=all)."""
    facilities = facility_service.list_active_facilities(db, include_development=participation == "all")
    return [FacilityRead.model_validate(f) for f in facilities]


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
