from typing import Literal

from pydantic import BaseModel, Field


class IngestionIssueRead(BaseModel):
    code: str = Field(description="Stable issue code, e.g. UNMAPPED_LOINC.")
    message: str
    resource: str | None = Field(
        description="Safe resource label (type/id or bundle position); never patient data."
    )
    severity: Literal["error", "warning"]


class ObservationOutcomeRead(BaseModel):
    resource: str
    outcome: Literal["created", "duplicate", "rejected"]
    observation_id: int | None = None
    source_system: str | None = None
    source_observation_id: str | None = None
    message: str | None = None


class IngestionResponse(BaseModel):
    """Summary of one FHIR ingestion request. Processing is best effort per Observation."""

    resources_received: int
    observations_received: int
    observations_validated: int
    observations_created: int
    duplicates: int
    rejected: int
    errors: list[IngestionIssueRead]
    warnings: list[IngestionIssueRead]
    results: list[ObservationOutcomeRead]
