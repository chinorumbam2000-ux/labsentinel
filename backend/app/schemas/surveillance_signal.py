from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import LocalDateTime


class SurveillanceSignalRead(BaseModel):
    """
    A persisted regional signal. The Composite Outbreak Signal Score and the
    Data Confidence Score are reported side by side and never combined.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    syndrome: str
    signal_date: date
    test_volume: int
    baseline_volume: float
    positive_count: int
    positivity_rate: float = Field(description="Percent, 0-100, two decimal places.")
    baseline_positivity_rate: float = Field(description="Percent, 0-100.")
    affected_facilities: int
    affected_geographies: list[str]
    persistence_days: int
    composite_score: float = Field(
        description=(
            "Composite Outbreak Signal Score, 0-100: an illustrative, "
            "non-validated demonstration model."
        )
    )
    severity: str
    data_confidence_score: float | None
    data_confidence_level: str | None
    status: str = Field(description="Human review status.")
    created_at: LocalDateTime
    updated_at: LocalDateTime
