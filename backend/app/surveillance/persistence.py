"""
Persisting dynamic signals: idempotent upserts and their audit trail.

A dynamic signal is keyed on (mode='dynamic', syndrome, signal_date), so
recalculating a day reconciles the same row instead of adding another. A
recalculation that changes nothing only refreshes ``calculated_at``. The
analyst review ``status`` is never touched.

Audit events (aggregate figures only, never patient-level detail):

    surveillance.dynamic.calculated        a new dynamic signal was stored
    surveillance.dynamic.recalculated      a stored signal's values changed
    surveillance.dynamic.severity_changed  ...and its severity (or scorability) changed
"""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AuditEvent, SurveillanceSignal
from app.surveillance.aggregator import in_demo_period
from app.surveillance.engine import Calculation, calculate
from app.surveillance.types import EngineConfig

DYNAMIC = SurveillanceSignal.mode == "dynamic"
MAX_RANGE_DAYS = 366

Outcome = Literal["created", "updated", "unchanged"]


def get_dynamic_signal(session: Session, syndrome: str, day: date) -> SurveillanceSignal | None:
    return session.scalar(
        select(SurveillanceSignal).where(
            DYNAMIC, SurveillanceSignal.syndrome == syndrome, SurveillanceSignal.signal_date == day
        )
    )


def _differs(signal: SurveillanceSignal, calc: Calculation) -> list[str]:
    changed = [name for name, wanted in calc.values.items() if getattr(signal, name) != wanted]
    if signal.calculation_status != calc.status:
        changed.append("calculation_status")
    if signal.calculation_metadata != calc.metadata:
        changed.append("calculation_metadata")
    return changed


def _describe(calc: Calculation) -> str:
    values = calc.values
    if calc.status != "CALCULATED":
        return (
            f"{calc.syndrome} on {calc.signal_date.isoformat()}: {calc.status} "
            f"({values['test_volume']} eligible tests); no score produced."
        )
    return (
        f"{calc.syndrome} on {calc.signal_date.isoformat()}: score {int(values['composite_score'])} "
        f"({values['severity']}); {values['test_volume']} tests, {values['positive_count']} positive; "
        f"{values['affected_facilities']} affected facilities; persistence {values['persistence_days']} days."
    )


def _severity_label(status: str, severity: str | None) -> str:
    return severity if status == "CALCULATED" and severity else status


@dataclass
class UpsertResult:
    outcome: Outcome
    signal: SurveillanceSignal
    changed: list[str] = field(default_factory=list)
    previous_severity: str | None = None


def upsert(session: Session, calc: Calculation, now: datetime) -> UpsertResult:
    signal = get_dynamic_signal(session, calc.syndrome, calc.signal_date)
    if signal is None:
        signal = SurveillanceSignal(
            mode="dynamic",
            syndrome=calc.syndrome,
            signal_date=calc.signal_date,
            calculation_status=calc.status,
            calculation_metadata=calc.metadata,
            calculated_at=now,
            **calc.values,
        )
        session.add(signal)
        session.flush()
        session.add(
            AuditEvent(
                event_type="surveillance.dynamic.calculated",
                entity_type="surveillance_signal",
                entity_id=str(signal.id),
                description="Dynamic signal calculated. " + _describe(calc),
            )
        )
        return UpsertResult("created", signal)

    changed = _differs(signal, calc)
    signal.calculated_at = now
    if not changed:
        session.flush()
        return UpsertResult("unchanged", signal)

    before = _severity_label(signal.calculation_status, signal.severity)
    before_score = signal.composite_score
    for name, wanted in calc.values.items():
        setattr(signal, name, wanted)
    signal.calculation_status = calc.status
    signal.calculation_metadata = calc.metadata
    session.flush()
    session.add(
        AuditEvent(
            event_type="surveillance.dynamic.recalculated",
            entity_type="surveillance_signal",
            entity_id=str(signal.id),
            description=(
                "Dynamic signal recalculated from updated observations. "
                + _describe(calc)
                + f" Changed: {', '.join(sorted(changed))}."
            ),
        )
    )
    after = _severity_label(calc.status, calc.severity)
    if after != before:
        was = before if before_score is None else f"{before} ({int(before_score)})"
        now_label = after if calc.composite_score is None else f"{after} ({int(calc.composite_score)})"
        session.add(
            AuditEvent(
                event_type="surveillance.dynamic.severity_changed",
                entity_type="surveillance_signal",
                entity_id=str(signal.id),
                description=(
                    f"Dynamic signal severity for {calc.syndrome} on {calc.signal_date.isoformat()} "
                    f"changed from {was} to {now_label}."
                ),
            )
        )
    return UpsertResult("updated", signal, changed, before)


@dataclass
class DayOutcome:
    signal_date: date
    outcome: Outcome
    signal_id: int
    calculation_status: str
    composite_score: int | None
    severity: str | None
    previous_severity: str | None


@dataclass
class RunReport:
    syndrome: str
    first: date | None
    last: date | None
    days: list[DayOutcome] = field(default_factory=list)
    #: Days inside the frozen demonstration period, which dynamic surveillance never scores.
    skipped: list[date] = field(default_factory=list)

    def count(self, outcome: Outcome) -> int:
        return sum(1 for day in self.days if day.outcome == outcome)


def recalculate(
    session: Session,
    syndrome: str,
    first: date,
    last: date,
    config: EngineConfig,
    now: datetime | None = None,
) -> RunReport:
    """
    Calculate and persist every day from ``first`` to ``last``, in date order,
    so each day's persistence builds on the day before. Days inside the frozen
    demonstration period are skipped (and persistence restarts after them).
    The caller commits.
    """
    if last < first:
        raise ValueError("The end date is before the start date.")
    if (last - first).days + 1 > MAX_RANGE_DAYS:
        raise ValueError(f"At most {MAX_RANGE_DAYS} days can be recalculated at once.")
    now = now or datetime.now(UTC)
    report = RunReport(syndrome, first, last)
    previous = get_dynamic_signal(session, syndrome, first - timedelta(days=1))
    zone = ZoneInfo(config.timezone)
    day = first
    while day <= last:
        if in_demo_period(day, zone):
            report.skipped.append(day)
            previous = None
            day += timedelta(days=1)
            continue
        calc = calculate(session, syndrome, day, config, previous)
        result = upsert(session, calc, now)
        report.days.append(
            DayOutcome(
                day,
                result.outcome,
                result.signal.id,
                calc.status,
                None if calc.composite_score is None else int(calc.composite_score),
                calc.severity,
                result.previous_severity,
            )
        )
        previous = result.signal
        day += timedelta(days=1)
    return report


def clear_dynamic_signals(session: Session) -> int:
    """Development: remove every dynamic signal. Demo signals are untouched."""
    removed = session.execute(delete(SurveillanceSignal).where(DYNAMIC)).rowcount
    if removed:
        session.add(
            AuditEvent(
                event_type="surveillance.dynamic.cleared",
                entity_type="surveillance_signal",
                entity_id=None,
                description=f"Removed {removed} dynamic signal(s). Demonstration signals untouched.",
            )
        )
    return removed
