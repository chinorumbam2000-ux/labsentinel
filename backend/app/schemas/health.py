from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["healthy"]
    service: str
    version: str


class DatabaseHealthResponse(BaseModel):
    status: Literal["healthy", "unhealthy"]
    database: Literal["connected", "unavailable"]
