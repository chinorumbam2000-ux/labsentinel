"""
CUSUM statistical detector endpoints, and the three-method comparison —
EXPERIMENTAL STATISTICAL SURVEILLANCE.

GET endpoints read the stored CUSUM results. POST /cusum/recalculate is
DEVELOPMENT ONLY (404 otherwise) and accepts no values. The EWMA endpoints
(/api/statistics/ewma) and the frozen demonstration's endpoints are untouched.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.cusum import (
    ComparisonRead,
    CusumDayRead,
    CusumPointRead,
    CusumRecalculateRequest,
    CusumRecalculateResponse,
    CusumSummary,
)
from app.schemas.statistics import EwmaReference
from app.services import cusum_reads as reads
from app.services import statistics_service as ewma_reads
from app.statistics import cusum_persistence, cusum_service, service
from app.statistics.cusum import DISCLAIMER, LABEL, CusumConfig
from app.surveillance.types import DEFAULT_SYNDROME

router = APIRouter(prefix="/api/statistics", tags=["statistical surveillance (experimental)"])

Syndrome = Query(default=DEFAULT_SYNDROME, max_length=100)
FORMULA = {
    "z": "z_t = (Y_t - mean) / SD, with the reference mean and SD shared with EWMA",
    "cusum": "C_t = max(0, C_(t-1) + z_t - k), with C_0 = 0",
    "decision": "STATISTICAL_ALERT when C_t >= h; otherwise NORMAL",
    "approaching": "Informational only: C_t / h >= 0.75 while NORMAL",
}
DETECTOR_SET = [
    "Composite Outbreak Signal Score (rule-based)",
    "EWMA (statistical, smoothed shift)",
    "CUSUM (statistical, cumulative sustained deviation)",
]


@router.get("/cusum", response_model=CusumSummary)
def summary(syndrome: str = Syndrome, db: Session = Depends(get_db)) -> CusumSummary:
    """Method, configuration, shared reference statistics, extent and the detection-timing analysis."""
    stored = reads.rows(db, syndrome)
    run = reads.run_from_rows(syndrome, stored)
    detection = None
    if run:
        ewma_run = ewma_reads.run_from_rows(syndrome, ewma_reads.rows(db, syndrome))
        detection = cusum_service.detection_analysis(
            run, service.dynamic_signals(db, syndrome), ewma_run.points if ewma_run else None
        )
        # The in-sample reference check needs the observation series, so it is recomputed (analysis only).
        live = cusum_service.calculate(db, syndrome, run.config)
        detection["reference_check"] = cusum_service.reference_check(live) if live else None
    return CusumSummary(
        label=LABEL,
        disclaimer=DISCLAIMER,
        syndrome=syndrome,
        config=(run.config if run else CusumConfig()).as_dict(),
        formula=FORMULA,
        references={m: EwmaReference(**r.as_dict()) for m, r in run.references.items()} if run else {},
        first_date=run.first if run else None,
        last_date=run.last if run else None,
        monitoring_from=run.monitoring_from if run else None,
        latest_date=reads.latest_monitored_date(db, syndrome),
        result_count=len(stored),
        detection=detection,
        signal_rule=cusum_service.SIGNAL_RULE,
        detector_set=DETECTOR_SET,
        recalculation_available=get_settings().app_env == "development",
    )


@router.get("/cusum/current", response_model=CusumDayRead, responses={404: {"description": "No CUSUM result."}})
def current(
    syndrome: str = Syndrome,
    date: date | None = Query(default=None, description="A date; default the latest monitored date."),
    db: Session = Depends(get_db),
) -> CusumDayRead:
    day = date or reads.latest_monitored_date(db, syndrome)
    view = None if day is None else reads.day_view(db, syndrome, day)
    if view is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No CUSUM result has been calculated for that.")
    return CusumDayRead(**view)


@router.get("/cusum/history", response_model=list[CusumPointRead])
def history(
    syndrome: str = Syndrome,
    metric: Literal["volume", "positivity"] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
) -> list[CusumPointRead]:
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, detail="date_to is before date_from.")
    return [CusumPointRead(**reads.to_read(r)) for r in reads.rows(db, syndrome, metric, date_from, date_to)]


@router.get("/comparison", response_model=ComparisonRead)
def comparison(
    syndrome: str = Syndrome,
    date: date | None = Query(default=None, description="A date; default the latest CUSUM-monitored date."),
    db: Session = Depends(get_db),
) -> ComparisonRead:
    """Composite, EWMA and CUSUM on one date, and how many of them signal. Never combined."""
    day = date or reads.latest_monitored_date(db, syndrome) or ewma_reads.latest_monitored_date(db, syndrome)
    if day is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No statistical result has been calculated yet.")
    return ComparisonRead(**reads.comparison(db, syndrome, day))


def require_development() -> None:
    if get_settings().app_env != "development":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")


@router.post(
    "/cusum/recalculate",
    response_model=CusumRecalculateResponse,
    dependencies=[Depends(require_development)],
    responses={404: {"description": "Not available outside development."}},
)
def recalculate(
    request: CusumRecalculateRequest | None = None, db: Session = Depends(get_db)
) -> CusumRecalculateResponse:
    """DEVELOPMENT ONLY. Recompute CUSUM from the persisted observations. Idempotent."""
    request = request or CusumRecalculateRequest()
    run = cusum_service.calculate(db, request.syndrome, CusumConfig())
    if run is None:
        return CusumRecalculateResponse(
            syndrome=request.syndrome, created=0, updated=0, unchanged=0, removed=0, state_changes=[],
            first_date=None, last_date=None, message="No eligible observations; nothing to calculate.",
        )
    report = cusum_persistence.upsert_run(db, run)
    db.commit()
    return CusumRecalculateResponse(
        syndrome=request.syndrome,
        created=report.created,
        updated=report.updated,
        unchanged=report.unchanged,
        removed=report.removed,
        state_changes=report.state_changes,
        first_date=run.first,
        last_date=run.last,
        message=(
            f"CUSUM recalculated: {report.created} created, {report.updated} updated, "
            f"{report.unchanged} unchanged."
        ),
    )
