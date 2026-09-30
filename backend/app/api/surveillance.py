"""
Dynamic surveillance endpoints.

GET endpoints serve only dynamic signals (mode = 'dynamic'), calculated by the
dynamic surveillance engine from persisted observations. The frozen five-day
demonstration stays at /api/signals and /api/demo, unchanged.

POST /recalculate is DEVELOPMENT ONLY (404 in any other environment). It runs
the engine; it accepts no signal values, so there is no way to write a signal
through the API.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.dynamic_surveillance import (
    DynamicMethod,
    DynamicSignalRead,
    DynamicSignalSummary,
    DynamicSummary,
    RecalculatedDay,
    RecalculateRequest,
    RecalculateResponse,
)
from app.services import dynamic_surveillance_service as service
from app.surveillance import DISCLAIMER
from app.surveillance.aggregator import observed_date_range
from app.surveillance.engine import method_description
from app.surveillance.persistence import recalculate
from app.surveillance.scorer import SCORE_WEIGHTS
from app.surveillance.types import DEFAULT_SYNDROME, ENGINE_VERSION, EngineConfig

router = APIRouter(prefix="/api/surveillance/dynamic", tags=["dynamic surveillance"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"description": "Not found."}}
Syndrome = Query(default=DEFAULT_SYNDROME, max_length=100)


def _config() -> EngineConfig:
    return EngineConfig()


@router.get("/signals", response_model=list[DynamicSignalSummary])
def list_signals(
    syndrome: str = Syndrome,
    date_from: date | None = None,
    date_to: date | None = None,
    facility: str | None = Query(
        default=None, max_length=50, description="Only signals this facility contributed abnormal activity to."
    ),
    db: Session = Depends(get_db),
) -> list[DynamicSignalSummary]:
    """Dynamic signal history, oldest first."""
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, detail="date_to is before date_from.")
    return [service.to_summary(s) for s in service.list_signals(db, syndrome, date_from, date_to, facility)]


# Declared before /{signal_id} so "current" is never parsed as an id.
@router.get("/signals/current", response_model=DynamicSignalRead, responses=NOT_FOUND)
def current_signal(
    syndrome: str = Syndrome,
    date: date | None = Query(default=None, description="A surveillance date; default the latest calculated."),
    db: Session = Depends(get_db),
) -> DynamicSignalRead:
    signal = service.current_signal(db, syndrome, date)
    if signal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No dynamic signal has been calculated for that.")
    return service.to_read(signal)


@router.get("/signals/{signal_id}", response_model=DynamicSignalRead, responses=NOT_FOUND)
def get_signal(signal_id: int, db: Session = Depends(get_db)) -> DynamicSignalRead:
    signal = service.get_signal(db, signal_id)
    if signal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dynamic signal not found.")
    return service.to_read(signal)


@router.get("/summary", response_model=DynamicSummary)
def summary(syndrome: str = Syndrome, db: Session = Depends(get_db)) -> DynamicSummary:
    """The latest dynamic signal, the signal history's extent and the method in use."""
    config = _config()
    count, first, last = service.date_span(db, syndrome)
    latest = service.current_signal(db, syndrome)
    return DynamicSummary(
        syndrome=syndrome,
        disclaimer=DISCLAIMER,
        method=DynamicMethod(
            engine_version=ENGINE_VERSION,
            config=config.as_dict(),
            description=method_description(config),
            weights=SCORE_WEIGHTS,
        ),
        signal_count=count,
        first_date=first,
        last_date=last,
        latest=None if latest is None else service.to_read(latest),
        recalculation_available=get_settings().app_env == "development",
    )


def require_development() -> None:
    if get_settings().app_env != "development":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")


@router.post(
    "/recalculate",
    response_model=RecalculateResponse,
    dependencies=[Depends(require_development)],
    responses={status.HTTP_404_NOT_FOUND: {"description": "Not available outside development."}},
)
def recalculate_signals(
    request: RecalculateRequest | None = None, db: Session = Depends(get_db)
) -> RecalculateResponse:
    """
    DEVELOPMENT ONLY. Run the dynamic surveillance engine over a date range
    (default: every date with eligible observations) and persist the result.
    Idempotent. Never touches the frozen demonstration.
    """
    request = request or RecalculateRequest()
    config = _config()
    if request.date_from is not None:
        first, last = request.date_from, request.date_to
    else:
        span = observed_date_range(db, request.syndrome, config)
        if span is None:
            return RecalculateResponse(
                syndrome=request.syndrome, date_from=None, date_to=None, created=0, updated=0,
                unchanged=0, days=[], skipped=[],
                message="No eligible observations for this syndrome; nothing to calculate.",
            )
        first, last = span
    try:
        report = recalculate(db, request.syndrome, first, last, config)
    except ValueError as error:
        raise HTTPException(422, detail=str(error)) from error
    db.commit()
    created, updated, unchanged = report.count("created"), report.count("updated"), report.count("unchanged")
    return RecalculateResponse(
        syndrome=request.syndrome,
        date_from=first,
        date_to=last,
        created=created,
        updated=updated,
        unchanged=unchanged,
        days=[RecalculatedDay(**vars(day)) for day in report.days],
        skipped=report.skipped,
        message=f"Recalculated {len(report.days)} day(s): {created} created, {updated} updated, {unchanged} unchanged.",
    )
