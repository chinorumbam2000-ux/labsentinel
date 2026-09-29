from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.simulation import FIRST_DAY, LAST_DAY
from app.schemas.common import LocalDateTime

DEFAULT_LIMIT = 100
MAX_LIMIT = 500

SortKey = Literal["effective_datetime", "facility_name", "vendor", "patient_reference", "result", "test_name"]


class ObservationFilters(BaseModel):
    """Query parameters accepted by ``GET /api/observations``."""

    day: int | None = Field(
        default=None,
        ge=FIRST_DAY,
        le=LAST_DAY,
        description="Capstone simulation day (demo convenience filter).",
    )
    through_day: int | None = Field(
        default=None,
        ge=FIRST_DAY,
        le=LAST_DAY,
        description="Capstone simulation days 1 through N inclusive (demo convenience filter).",
    )
    facility_id: int | None = None
    source_system: str | None = Field(
        default=None,
        max_length=100,
        description='Exact source system, e.g. "Simulated Epic Environment" (seed) or "fhir:..." (FHIR).',
    )
    vendor: str | None = Field(default=None, max_length=100)
    loinc_code: str | None = Field(default=None, max_length=20)
    result: Literal["Positive", "Negative"] | None = None
    q: str | None = Field(
        default=None,
        max_length=100,
        description=(
            "Case-insensitive text search across observation id, patient reference, "
            "facility name, vendor, test name, LOINC code, geographic unit and result."
        ),
    )
    sort: SortKey = "effective_datetime"
    order: Literal["asc", "desc"] = "asc"
    limit: int = Field(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT)
    offset: int = Field(default=0, ge=0)


class LabObservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_observation_id: str
    facility_id: int
    patient_reference: str = Field(description="Synthetic, de-identified reference only.")
    syndrome: str | None = Field(description="Null only when terminology_status is 'unmapped'.")
    test_name: str
    loinc_code: str
    terminology_status: str
    code_display: str | None
    result_type: str
    result_value: str | None
    result_unit: str | None
    result_numeric: float | None
    result_unit_system: str | None
    result_unit_code: str | None
    result_code_system: str | None
    result_code: str | None
    effective_datetime: LocalDateTime
    received_datetime: LocalDateTime | None = Field(
        description="Null when the source did not record a receipt time."
    )
    geographic_unit: str
    source_system: str
    status: str
    source_report_id: str | None
    specimen_type: str | None
    created_at: LocalDateTime
