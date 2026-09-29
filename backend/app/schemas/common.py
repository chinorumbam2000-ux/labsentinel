from datetime import datetime
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, PlainSerializer

from app.core.simulation import as_simulation_local

# ISO-8601 with an explicit offset, in the simulation's local zone, e.g.
# "2025-11-03T06:00:00-05:00". Always includes the offset, so a client never
# has to guess the zone.
LocalDateTime = Annotated[
    datetime,
    PlainSerializer(lambda value: as_simulation_local(value).isoformat(), return_type=str),
]

ItemT = TypeVar("ItemT")


class Page(BaseModel, Generic[ItemT]):
    """One page of a list endpoint, with enough to request the next page."""

    items: list[ItemT]
    total: int
    limit: int
    offset: int
