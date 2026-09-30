from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import LocalDateTime

AlertState = Literal["NORMAL", "WATCH", "STATISTICAL_ALERT"]
Status = Literal["CALCULATED", "REFERENCE_PERIOD", "INSUFFICIENT_BASELINE", "INSUFFICIENT_VARIANCE", "NO_DATA"]


class EwmaPointRead(BaseModel):
    """
    One day of one EWMA metric. Experimental Statistical Surveillance: a
    prototype statistical detector, not clinically or epidemiologically
    validated. Never a confirmed outbreak.
    """

    id: int
    method: Literal["EWMA"]
    metric: Literal["volume", "positivity"]
    signal_date: date
    calculation_status: Status
    observed_value: float | None = Field(description="Tests that day, or positivity in percent.")
    baseline_mean: float | None = Field(description="Reference-period mean.")
    baseline_stddev: float | None = Field(description="Reference-period sample standard deviation.")
    previous_ewma: float | None
    ewma_value: float | None
    upper_control_limit: float | None
    warning_limit: float | None
    distance_to_ucl: float | None = Field(description="UCL - EWMA: negative once the EWMA is above the UCL.")
    alert_state: AlertState | None
    lambda_value: float
    k_value: float
    update: int = Field(description="EWMA updates so far (days with data since monitoring began).")
    reference_first: date
    reference_last: date
    reference_days: int = Field(description="Days with data in the reference period.")
    explanation: str
    calculated_at: LocalDateTime
    calculation: dict[str, Any]


class CompositeRef(BaseModel):
    signal_id: int
    calculation_status: str
    composite_score: float | None
    severity: str | None


Agreement = Literal["BOTH_METHODS_SIGNAL", "COMPOSITE_ONLY", "EWMA_ONLY", "NEITHER", "NOT_AVAILABLE"]


class EwmaDayRead(BaseModel):
    """Both EWMA metrics on one date, beside (never combined with) the Composite Outbreak Signal Score."""

    syndrome: str
    signal_date: date
    volume: EwmaPointRead | None
    positivity: EwmaPointRead | None
    overall_state: AlertState | None = Field(
        description="STATISTICAL_ALERT if either metric is above its UCL, else WATCH if either is above "
        "its warning limit, else NORMAL. Not a score."
    )
    overall_basis: list[str] = Field(description="The metrics monitored that day.")
    composite: CompositeRef | None
    composite_signals: bool | None
    ewma_signals: bool | None
    agreement: Agreement
    agreement_text: str


class EwmaReference(BaseModel):
    first: date
    last: date
    days: int
    mean: float | None
    stddev: float | None
    status: str


class EwmaSummary(BaseModel):
    mode: Literal["dynamic"] = "dynamic"
    method: Literal["EWMA"] = "EWMA"
    label: str
    disclaimer: str
    detector_note: str
    syndrome: str
    config: dict[str, Any]
    formula: dict[str, str]
    references: dict[str, EwmaReference]
    first_date: date | None
    last_date: date | None
    monitoring_from: date | None
    latest_date: date | None = Field(description="The latest date with a monitored EWMA.")
    result_count: int
    detection: dict[str, Any] | None = Field(
        description="First dates each method reaches each level, and EWMA's lead or lag in days."
    )
    agreement_rule: str
    recalculation_available: bool


class EwmaRecalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    syndrome: str = "Respiratory Viral Syndrome"


class EwmaRecalculateResponse(BaseModel):
    syndrome: str
    created: int
    updated: int
    unchanged: int
    removed: int
    state_changes: list[str]
    first_date: date | None
    last_date: date | None
    message: str
