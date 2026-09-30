"""
Daily aggregation of persisted laboratory observations.

ELIGIBILITY. An observation counts towards a syndrome's surveillance day when:

1. its test is mapped to that syndrome (terminology_status 'mapped'); an
   unmapped LOINC code has no syndrome and is never counted;
2. its status is final, amended or corrected;
3. it comes from an active *participating* facility (development sources,
   such as the SMART sandbox facility, are excluded);
4. its effective time falls on that calendar day in the engine's time zone;
5. it is outside the frozen Day 1-Day 5 demonstration period, which belongs
   to the classroom demonstration alone.

Such an observation is one test. For positivity only normalized 'Positive'
and 'Negative' results count; any other result (a number, free text) is a
test with an indeterminate result, never a positive or a negative.

Unmapped laboratory observations are read too, but only to measure
terminology mapping quality for Data Confidence.

Rows are read with one query per calculation and grouped here, so the same
code runs on PostgreSQL and on the SQLite unit-test database.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.simulation import demo_period_utc
from app.models import Facility, LabObservation
from app.surveillance.types import (
    COUNTED_STATUSES,
    NEGATIVE,
    POSITIVE,
    Counts,
    EngineConfig,
    FacilityInfo,
    QualityInputs,
)

#: Surveillance fields that FHIR does not require but surveillance needs.
REQUIRED_FIELDS = ("specimen_type", "received_datetime")


def utc_bounds(first: date, last: date, zone: ZoneInfo) -> tuple[datetime, datetime]:
    """[start of ``first``, end of ``last``) in local time, expressed in UTC."""
    start = datetime.combine(first, time.min, zone)
    end = datetime.combine(last + timedelta(days=1), time.min, zone)
    return start.astimezone(UTC), end.astimezone(UTC)


def as_utc(value: datetime) -> datetime:
    # SQLite (unit tests only) returns naive datetimes, written in UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def in_demo_period(day: date, zone: ZoneInfo) -> bool:
    """Whether any part of ``day`` overlaps the frozen demonstration period."""
    start, end = utc_bounds(day, day, zone)
    demo_start, demo_end = demo_period_utc()
    return start < demo_end and demo_start < end


@dataclass
class FacilityDay:
    counts: Counts = field(default_factory=Counts)
    quality: QualityInputs = field(default_factory=QualityInputs)


@dataclass
class Aggregation:
    """Per-facility, per-day counts for one syndrome over a date range."""

    facilities: dict[str, FacilityInfo]
    by_facility: dict[str, dict[date, FacilityDay]]

    def facility_daily(self, code: str) -> dict[date, Counts]:
        return {day: fd.counts for day, fd in self.by_facility.get(code, {}).items()}

    def regional_daily(self) -> dict[date, Counts]:
        totals: dict[date, Counts] = defaultdict(Counts)
        for days in self.by_facility.values():
            for day, fd in days.items():
                totals[day].add(fd.counts)
        return dict(totals)

    def day(self, code: str, day: date) -> FacilityDay:
        return self.by_facility.get(code, {}).get(day, FacilityDay())


def participating_facilities(session: Session) -> dict[str, FacilityInfo]:
    rows = session.scalars(
        select(Facility).where(Facility.active.is_(True), Facility.participation == "participating")
    )
    return {
        f.facility_code: FacilityInfo(
            f.facility_code, f.name, f.vendor, f.postal_code, f.subregion, f.region, f.country_code
        )
        for f in rows
    }


def aggregate(
    session: Session, syndrome: str, first: date, last: date, config: EngineConfig
) -> Aggregation:
    zone = ZoneInfo(config.timezone)
    facilities = participating_facilities(session)
    start, end = utc_bounds(first, last, zone)
    demo_start, demo_end = demo_period_utc()

    rows = session.execute(
        select(
            Facility.facility_code,
            LabObservation.syndrome,
            LabObservation.terminology_status,
            LabObservation.result_value,
            LabObservation.specimen_type,
            LabObservation.effective_datetime,
            LabObservation.received_datetime,
        )
        .join(Facility, Facility.id == LabObservation.facility_id)
        .where(
            Facility.facility_code.in_(facilities),
            LabObservation.status.in_(COUNTED_STATUSES),
            LabObservation.effective_datetime >= start,
            LabObservation.effective_datetime < end,
            # The frozen demonstration period is never read.
            or_(
                LabObservation.effective_datetime < demo_start,
                LabObservation.effective_datetime >= demo_end,
            ),
            or_(LabObservation.syndrome == syndrome, LabObservation.terminology_status == "unmapped"),
        )
    ).all()

    by_facility: dict[str, dict[date, FacilityDay]] = defaultdict(lambda: defaultdict(FacilityDay))
    for code, row_syndrome, terminology, result, specimen, effective, received in rows:
        effective = as_utc(effective)
        day = effective.astimezone(zone).date()
        fd = by_facility[code][day]
        fd.quality.lab_observations += 1
        if terminology != "mapped" or row_syndrome != syndrome:
            continue  # counted for terminology quality only
        fd.quality.mapped_observations += 1

        fd.counts.tests += 1
        if result == POSITIVE:
            fd.counts.positive += 1
        elif result == NEGATIVE:
            fd.counts.negative += 1
        else:
            fd.quality.integrity_issues += 1

        fd.quality.fields_required += len(REQUIRED_FIELDS)
        fd.quality.fields_populated += (specimen is not None) + (received is not None)
        if received is not None:
            delay = (as_utc(received) - effective).total_seconds() / 60
            if delay < 0:
                fd.quality.integrity_issues += 1
            fd.quality.reporting_delays.append(max(delay, 0.0))

    return Aggregation(facilities, {code: dict(days) for code, days in by_facility.items()})


def observed_date_range(session: Session, syndrome: str, config: EngineConfig) -> tuple[date, date] | None:
    """First and last local dates with an eligible observation, outside the demo period."""
    zone = ZoneInfo(config.timezone)
    facilities = participating_facilities(session)
    demo_start, demo_end = demo_period_utc()
    first, last = session.execute(
        select(func.min(LabObservation.effective_datetime), func.max(LabObservation.effective_datetime))
        .join(Facility, Facility.id == LabObservation.facility_id)
        .where(
            Facility.facility_code.in_(facilities),
            LabObservation.status.in_(COUNTED_STATUSES),
            LabObservation.syndrome == syndrome,
            or_(
                LabObservation.effective_datetime < demo_start,
                LabObservation.effective_datetime >= demo_end,
            ),
        )
    ).one()
    if first is None:
        return None
    return as_utc(first).astimezone(zone).date(), as_utc(last).astimezone(zone).date()
