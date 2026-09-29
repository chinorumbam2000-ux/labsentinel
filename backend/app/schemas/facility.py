from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import LocalDateTime


class FacilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    facility_code: str
    name: str
    vendor: str = Field(
        description=(
            "EHR/LIS platform label, descriptive only. Implies no ranking or "
            "comparison of vendor quality, maturity or reliability."
        )
    )
    city: str
    postal_code: str | None
    subregion: str | None
    region: str
    country_code: str
    active: bool
    created_at: LocalDateTime
    updated_at: LocalDateTime
