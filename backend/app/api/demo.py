"""
CAPSTONE DEMONSTRATION ENDPOINTS.

Serve the synthetic five-day simulation in the shape the prototype's
dashboard uses. They are deliberately kept under /api/demo, apart from the
production-shaped resource endpoints, and will not grow into production
surveillance APIs.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.signals import NOT_FOUND, SimulationDay
from app.database import get_db
from app.models import DemoSimulationDay
from app.schemas.demo import DemoSummary
from app.services import signal_service

router = APIRouter(prefix="/api/demo", tags=["demo (capstone only)"])


def _summary(demo_day: DemoSimulationDay) -> DemoSummary:
    s = demo_day.signal
    return DemoSummary(
        day=demo_day.day,
        simulation_date=demo_day.simulation_date,
        stage=demo_day.stage,
        description=demo_day.description,
        signal_id=s.id,
        syndrome=s.syndrome,
        test_volume=s.test_volume,
        positive_count=s.positive_count,
        negative_count=s.test_volume - s.positive_count,
        positivity_rate=float(s.positivity_rate),
        baseline_volume=float(s.baseline_volume),
        baseline_positivity_rate=float(s.baseline_positivity_rate),
        affected_facilities=s.affected_facilities,
        affected_geographies=s.affected_geographies,
        persistence_days=s.persistence_days,
        composite_score=float(s.composite_score),
        severity=s.severity,
        data_confidence_score=(
            None if s.data_confidence_score is None else float(s.data_confidence_score)
        ),
        data_confidence_level=s.data_confidence_level,
    )


@router.get("/summary", response_model=DemoSummary, responses=NOT_FOUND)
def demo_summary(day: SimulationDay, db: Session = Depends(get_db)) -> DemoSummary:
    """Headline figures for one simulated day. Development/demonstration endpoint."""
    demo_day = signal_service.get_demo_day(db, day)
    if demo_day is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No data seeded for that day.")
    return _summary(demo_day)


@router.get("/days", response_model=list[DemoSummary])
def demo_days(db: Session = Depends(get_db)) -> list[DemoSummary]:
    """
    Every seeded simulated day, in order. Lets the demonstration show the
    whole five-day storyline (stage names and progression) in one request.
    """
    return [_summary(demo_day) for demo_day in signal_service.list_demo_days(db)]
