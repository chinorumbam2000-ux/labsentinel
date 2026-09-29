from datetime import date

from pydantic import BaseModel

DEMO_NOTICE = (
    "Synthetic capstone demonstration data. The Composite Outbreak Signal Score "
    "is an illustrative, non-validated demonstration model, not for clinical "
    "diagnosis or public-health decision-making."
)


class DemoSummary(BaseModel):
    """CAPSTONE DEMONSTRATION ONLY: one simulated day, as the dashboard shows it."""

    day: int
    simulation_date: date
    stage: str
    description: str
    signal_id: int
    syndrome: str
    test_volume: int
    positive_count: int
    negative_count: int
    positivity_rate: float
    baseline_volume: float
    baseline_positivity_rate: float
    affected_facilities: int
    affected_geographies: list[str]
    persistence_days: int
    composite_score: float
    severity: str
    data_confidence_score: float | None
    data_confidence_level: str | None
    notice: str = DEMO_NOTICE
