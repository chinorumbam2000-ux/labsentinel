"""
EWMA statistical detector endpoints — EXPERIMENTAL STATISTICAL SURVEILLANCE.

GET endpoints read the stored EWMA results (secondary to, and never combined
with, the Composite Outbreak Signal Score). POST /recalculate is
DEVELOPMENT ONLY (404 otherwise): it recomputes the series from persisted
observations and accepts no values. The frozen demonstration's endpoints are
untouched.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.statistics import (
    EwmaDayRead,
    EwmaPointRead,
    EwmaRecalculateRequest,
    EwmaRecalculateResponse,
    EwmaReference,
    EwmaSummary,
)
from app.services import statistics_service as reads
from app.statistics import persistence, service
from app.statistics.types import DETECTOR_NOTE, DISCLAIMER, LABEL, EwmaConfig
from app.surveillance.types import DEFAULT_SYNDROME

router = APIRouter(prefix="/api/statistics/ewma", tags=["statistical surveillance (experimental)"])

Syndrome = Query(default=DEFAULT_SYNDROME, max_length=100)
FORMULA = {
    "ewma": "EWMA_t = lambda * Y_t + (1 - lambda) * EWMA_(t-1), with EWMA_0 = reference mean",
    "sigma": "sigma_t = SD * sqrt(lambda / (2 - lambda) * (1 - (1 - lambda)^(2t)))",
    "ucl": "UCL_t = mean + k * sigma_t",
    "warning_limit": "WL_t = mean + warning_fraction * k * sigma_t",
    "state": "STATISTICAL_ALERT if EWMA_t > UCL_t; WATCH if EWMA_t > WL_t; otherwise NORMAL",
}


@router.get("", response_model=EwmaSummary)
def summary(syndrome: str = Syndrome, db: Session = Depends(get_db)) -> EwmaSummary:
    """Method, configuration, reference statistics, extent and the early-detection analysis."""
    stored = reads.rows(db, syndrome)
    run = reads.run_from_rows(syndrome, stored)
    config = run.config if run else EwmaConfig()
    references = {}
    if run:
        for metric, ref in run.references.items():
            references[metric] = EwmaReference(**ref.as_dict())
    return EwmaSummary(
        label=LABEL,
        disclaimer=DISCLAIMER,
        detector_note=DETECTOR_NOTE,
        syndrome=syndrome,
        config=config.as_dict(),
        formula=FORMULA,
        references=references,
        first_date=run.first if run else None,
        last_date=run.last if run else None,
        monitoring_from=run.monitoring_from if run else None,
        latest_date=reads.latest_monitored_date(db, syndrome),
        result_count=len(stored),
        detection=service.detection_analysis(run, service.dynamic_signals(db, syndrome)) if run else None,
        agreement_rule=service.AGREEMENT_RULE,
        recalculation_available=get_settings().app_env == "development",
    )


@router.get("/current", response_model=EwmaDayRead, responses={404: {"description": "No EWMA result."}})
def current(
    syndrome: str = Syndrome,
    date: date | None = Query(default=None, description="A date; default the latest monitored date."),
    db: Session = Depends(get_db),
) -> EwmaDayRead:
    """Both metrics for a date, the overall state and the comparison with the Composite score."""
    day = date or reads.latest_monitored_date(db, syndrome)
    view = None if day is None else reads.day_view(db, syndrome, day)
    if view is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No EWMA result has been calculated for that.")
    return EwmaDayRead(**view)


@router.get("/history", response_model=list[EwmaPointRead])
def history(
    syndrome: str = Syndrome,
    metric: Literal["volume", "positivity"] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
) -> list[EwmaPointRead]:
    """Daily EWMA results, oldest first (both metrics unless one is chosen)."""
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, detail="date_to is before date_from.")
    return [EwmaPointRead(**reads.to_read(r)) for r in reads.rows(db, syndrome, metric, date_from, date_to)]


def require_development() -> None:
    if get_settings().app_env != "development":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")


@router.post(
    "/recalculate",
    response_model=EwmaRecalculateResponse,
    dependencies=[Depends(require_development)],
    responses={404: {"description": "Not available outside development."}},
)
def recalculate(
    request: EwmaRecalculateRequest | None = None, db: Session = Depends(get_db)
) -> EwmaRecalculateResponse:
    """DEVELOPMENT ONLY. Recompute EWMA from the persisted observations. Idempotent."""
    request = request or EwmaRecalculateRequest()
    run = service.calculate(db, request.syndrome, EwmaConfig())
    if run is None:
        return EwmaRecalculateResponse(
            syndrome=request.syndrome, created=0, updated=0, unchanged=0, removed=0, state_changes=[],
            first_date=None, last_date=None, message="No eligible observations; nothing to calculate.",
        )
    report = persistence.upsert_run(db, run)
    db.commit()
    return EwmaRecalculateResponse(
        syndrome=request.syndrome,
        created=report.created,
        updated=report.updated,
        unchanged=report.unchanged,
        removed=report.removed,
        state_changes=report.state_changes,
        first_date=run.first,
        last_date=run.last,
        message=(
            f"EWMA recalculated: {report.created} created, {report.updated} updated, "
            f"{report.unchanged} unchanged."
        ),
    )
