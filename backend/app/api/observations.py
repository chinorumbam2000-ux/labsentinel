from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import Page
from app.schemas.lab_observation import LabObservationRead, ObservationFilters
from app.services import observation_service

router = APIRouter(prefix="/api/observations", tags=["observations"])


@router.get("", response_model=Page[LabObservationRead])
def list_observations(
    filters: Annotated[ObservationFilters, Query()],
    db: Session = Depends(get_db),
) -> Page[LabObservationRead]:
    """
    Lab observations, oldest first, one page at a time.

    ``limit`` defaults to 100 and may not exceed 500; use ``offset`` and the
    returned ``total`` to page through the rest.
    """
    items, total = observation_service.list_observations(db, filters)
    return Page[LabObservationRead](
        items=[LabObservationRead.model_validate(o) for o in items],
        total=total,
        limit=filters.limit,
        offset=filters.offset,
    )


@router.get(
    "/{observation_id}",
    response_model=LabObservationRead,
    responses={status.HTTP_404_NOT_FOUND: {"description": "No such observation."}},
)
def get_observation(observation_id: int, db: Session = Depends(get_db)) -> LabObservationRead:
    observation = observation_service.get_observation(db, observation_id)
    if observation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Observation not found.")
    return LabObservationRead.model_validate(observation)
