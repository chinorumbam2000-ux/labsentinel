from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import LocalDateTime


class DynamicSignalSummary(BaseModel):
    """
    A dynamic surveillance signal, calculated from persisted laboratory
    observations. Never a demonstration signal. The Composite Outbreak Signal
    Score and the Data Confidence Score are reported side by side and never
    combined. Scores are null when the signal could not be scored.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    mode: Literal["dynamic"]
    syndrome: str
    signal_date: date
    calculation_status: Literal["CALCULATED", "INSUFFICIENT_BASELINE", "NO_DATA"]
    test_volume: int
    positive_count: int
    positivity_rate: float = Field(description="Percent, 0-100.")
    baseline_volume: float | None = Field(description="Mean eligible tests per baseline day.")
    baseline_positivity_rate: float | None = Field(description="Pooled baseline positivity, percent.")
    affected_facilities: int
    participating_facilities: int
    affected_geographies: list[str]
    participating_geographies: int
    persistence_days: int
    composite_score: float | None
    severity: str | None
    data_confidence_score: float | None
    data_confidence_level: str | None
    status: str = Field(description="Human review status.")
    calculated_at: LocalDateTime | None


class DynamicSignalRead(DynamicSignalSummary):
    """A dynamic signal with everything needed to explain it."""

    volume_component_score: float | None
    positivity_component_score: float | None
    facility_component_score: float | None
    geography_component_score: float | None
    persistence_component_score: float | None
    message: str | None = Field(description="Why no score was produced, when none was.")
    calculation: dict[str, Any] = Field(
        description=(
            "Explainability: baseline, current values, each component's raw value, normalized "
            "score and weighted contribution, facility provenance (aggregate counts only), "
            "geography, persistence, Data Confidence inputs and the engine configuration."
        )
    )


class DynamicMethod(BaseModel):
    engine_version: str
    config: dict[str, Any]
    description: dict[str, str]
    weights: dict[str, float]


class DynamicSummary(BaseModel):
    mode: Literal["dynamic"] = "dynamic"
    syndrome: str
    disclaimer: str
    method: DynamicMethod
    signal_count: int
    first_date: date | None
    last_date: date | None
    latest: DynamicSignalRead | None
    recalculation_available: bool = Field(
        description="Whether POST /api/surveillance/dynamic/recalculate exists (development only)."
    )


class RecalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    syndrome: str = "Respiratory Viral Syndrome"
    date_from: date | None = None
    date_to: date | None = None

    @model_validator(mode="after")
    def _both_or_neither(self) -> "RecalculateRequest":
        if (self.date_from is None) != (self.date_to is None):
            raise ValueError("date_from and date_to go together.")
        return self


class RecalculatedDay(BaseModel):
    signal_date: date
    outcome: Literal["created", "updated", "unchanged"]
    signal_id: int
    calculation_status: str
    composite_score: int | None
    severity: str | None
    previous_severity: str | None


class RecalculateResponse(BaseModel):
    syndrome: str
    date_from: date | None
    date_to: date | None
    created: int
    updated: int
    unchanged: int
    days: list[RecalculatedDay]
    skipped: list[date] = Field(description="Dates inside the frozen demonstration period.")
    message: str
