from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.simulation import FIRST_DAY, LAST_DAY
from app.schemas.common import LocalDateTime

DEFAULT_LIMIT = 100
MAX_LIMIT = 500


class ObservationFilters(BaseModel):
    """Query parameters accepted by ``GET /api/observations``."""

    day: int | None = Field(
        default=None,
        ge=FIRST_DAY,
        le=LAST_DAY,
        description="Capstone simulation day (demo convenience filter).",
    )
    facility_id: int | None = None
    loinc_code: str | None = Field(default=None, max_length=20)
    result: Literal["Positive", "Negative"] | None = None
    limit: int = Field(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT)
    offset: int = Field(default=0, ge=0)


class LabObservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_observation_id: str
    facility_id: int
    patient_reference: str = Field(description="Synthetic, de-identified reference only.")
    syndrome: str
    test_name: str
    loinc_code: str
    result_type: str
    result_value: str | None
    result_unit: str | None
    effective_datetime: LocalDateTime
    received_datetime: LocalDateTime | None = Field(
        description="Null when the source did not record a receipt time."
    )
    geographic_unit: str
    source_system: str
    status: str
    created_at: LocalDateTime
