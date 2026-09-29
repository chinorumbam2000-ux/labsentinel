"""
CAPSTONE DEMONSTRATION: the five-day synthetic simulation calendar.

These describe the prototype's demonstration data, not a production
surveillance concept. Nothing outside the demo seed, the demo endpoint and the
``day`` convenience filters should depend on them.
"""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

FIRST_DAY = 1
LAST_DAY = 5

# Day 1 of the prototype's simulation calendar (src/data/simulation.ts).
SIMULATION_START_DATE = date(2025, 11, 3)

# The prototype stamps observations with a local wall-clock time and no zone.
# Its synthetic facilities are in Worcester County, Massachusetts, so those
# times are read as America/New_York (EST, UTC-05:00, on Nov 3-7 2025).
SIMULATION_TIMEZONE = ZoneInfo("America/New_York")


def date_for_day(day: int) -> date:
    return SIMULATION_START_DATE + timedelta(days=day - FIRST_DAY)


def day_for_date(value: date) -> int:
    return (value - SIMULATION_START_DATE).days + FIRST_DAY


def utc_bounds_for_day(day: int) -> tuple[datetime, datetime]:
    """[start, end) of a simulation day in local time, expressed in UTC."""
    start = datetime.combine(date_for_day(day), time.min, SIMULATION_TIMEZONE)
    end = start + timedelta(days=1)
    return start.astimezone(UTC), end.astimezone(UTC)


def as_simulation_local(value: datetime) -> datetime:
    """
    Present a stored timestamp in the simulation's local zone.

    PostgreSQL returns aware datetimes. SQLite (unit tests only) returns naive
    ones; everything is written in UTC, so naive values are read as UTC.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(SIMULATION_TIMEZONE)
