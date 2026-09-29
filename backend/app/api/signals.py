from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.simulation import FIRST_DAY, LAST_DAY
from app.database import get_db
from app.schemas.surveillance_signal import SurveillanceSignalRead
from app.services import signal_service

router = APIRouter(prefix="/api/signals", tags=["signals"])

SimulationDay = Annotated[
    int,
    Query(
        ge=FIRST_DAY,
        le=LAST_DAY,
        description="Capstone simulation day. A demonstration control, not a production concept.",
    ),
]

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"description": "Not found."}}


@router.get("", response_model=list[SurveillanceSignalRead])
def list_signals(db: Session = Depends(get_db)) -> list[SurveillanceSignalRead]:
    """Signal history, ordered by signal date."""
    return [SurveillanceSignalRead.model_validate(s) for s in signal_service.list_signals(db)]


# Declared before /{signal_id} so "current" is never parsed as an id.
@router.get("/current", response_model=SurveillanceSignalRead, responses=NOT_FOUND)
def current_signal(day: SimulationDay, db: Session = Depends(get_db)) -> SurveillanceSignalRead:
    """
    The signal for a capstone simulation day, so the demonstration can ask
    for "the current signal" as its simulated clock advances.
    """
    demo_day = signal_service.get_demo_day(db, day)
    if demo_day is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No signal seeded for that day.")
    return SurveillanceSignalRead.model_validate(demo_day.signal)


@router.get("/{signal_id}", response_model=SurveillanceSignalRead, responses=NOT_FOUND)
def get_signal(signal_id: int, db: Session = Depends(get_db)) -> SurveillanceSignalRead:
    signal = signal_service.get_signal(db, signal_id)
    if signal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Signal not found.")
    return SurveillanceSignalRead.model_validate(signal)
