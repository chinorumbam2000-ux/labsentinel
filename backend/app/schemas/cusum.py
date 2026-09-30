from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import LocalDateTime
from app.schemas.statistics import CompositeRef, EwmaReference

CusumState = Literal["NORMAL", "STATISTICAL_ALERT"]
Status = Literal["CALCULATED", "REFERENCE_PERIOD", "INSUFFICIENT_BASELINE", "INSUFFICIENT_VARIANCE", "NO_DATA"]


class CusumPointRead(BaseModel):
    """
    One day of one CUSUM metric. Experimental Statistical Surveillance: not
    epidemiologically validated; a statistical alert is not a confirmed outbreak.
    """

    id: int
    method: Literal["CUSUM"]
    metric: Literal["volume", "positivity"]
    signal_date: date
    calculation_status: Status
    observed_value: float | None
    baseline_mean: float | None
    baseline_stddev: float | None
    z_score: float | None = Field(description="(observed - mean) / SD.")
    increment: float | None = Field(description="z - k: what today adds before max(0, ...).")
    previous_cusum: float | None
    cusum_value: float | None = Field(description="C_t = max(0, C_(t-1) + z_t - k).")
    k: float | None
    h: float | None
    distance_to_limit: float | None = Field(description="h - C_t; zero or negative once the limit is reached.")
    alert_state: CusumState | None = Field(description="The formal state: STATISTICAL_ALERT only when C_t >= h.")
    approaching_limit: bool = Field(
        description="Informational only (C_t / h >= 0.75 while NORMAL). Not a statistical alarm."
    )
    update: int
    reference_first: date
    reference_last: date
    reference_days: int
    explanation: str
    calculated_at: LocalDateTime
    calculation: dict[str, Any]


class CusumDayRead(BaseModel):
    syndrome: str
    signal_date: date
    volume: CusumPointRead | None
    positivity: CusumPointRead | None
    overall_state: CusumState | None = Field(description="STATISTICAL_ALERT when either metric has reached h.")
    overall_basis: list[str]


class CusumSummary(BaseModel):
    mode: Literal["dynamic"] = "dynamic"
    method: Literal["CUSUM"] = "CUSUM"
    label: str
    disclaimer: str
    syndrome: str
    config: dict[str, Any]
    formula: dict[str, str]
    references: dict[str, EwmaReference] = Field(description="Shared with EWMA: identical reference period.")
    first_date: date | None
    last_date: date | None
    monitoring_from: date | None
    latest_date: date | None
    result_count: int
    detection: dict[str, Any] | None
    signal_rule: str
    detector_set: list[str] = Field(description="The capstone's complete detector set.")
    recalculation_available: bool


class ComparisonStates(BaseModel):
    volume: str | None
    positivity: str | None
    overall: str | None


class CusumComparisonStates(ComparisonStates):
    approaching: dict[str, bool] = Field(description="Informational 'approaching the limit' flags, per metric.")


class ComparisonRead(BaseModel):
    """The three methods on one date, side by side. They are never combined into one number."""

    syndrome: str
    signal_date: date
    composite: CompositeRef | None
    ewma: ComparisonStates
    cusum: CusumComparisonStates
    methods: dict[str, bool | None] = Field(description="Whether each method signals (None: no result).")
    signalling: int
    available: int
    label: str = Field(description="For example '3 OF 3 METHODS SIGNAL'. A description, not a score.")
    text: str
    rule: str


class CusumRecalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    syndrome: str = "Respiratory Viral Syndrome"


class CusumRecalculateResponse(BaseModel):
    syndrome: str
    created: int
    updated: int
    unchanged: int
    removed: int
    state_changes: list[str]
    first_date: date | None
    last_date: date | None
    message: str
