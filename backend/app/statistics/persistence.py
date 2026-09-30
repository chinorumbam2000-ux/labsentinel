"""
Persisting EWMA results: idempotent upserts and their audit trail.

The EWMA is recursive, so a recalculation always recomputes the whole
series from the persisted observations and reconciles one row per
(mode, method, syndrome, date, metric). A row whose values are unchanged is
left alone (only ``calculated_at`` moves); rows for dates no longer in the
series are removed.

Audit events (aggregate figures only, never patient-level detail):

    statistics.ewma.calculated     new EWMA results were stored
    statistics.ewma.recalculated   stored EWMA results changed
    statistics.ewma.state_changed  a metric's alert state changed on a date
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AuditEvent, StatisticalSignal
from app.statistics.ewma import asymptotic_factor, sigma_factor
from app.statistics.service import EwmaRun
from app.statistics.types import METHOD, METRIC_LABEL, EwmaPoint, Reference

EWMA_ROWS = (StatisticalSignal.mode == "dynamic", StatisticalSignal.method == METHOD)
STATE_LABEL = {"NORMAL": "Normal", "WATCH": "Watch", "STATISTICAL_ALERT": "Statistical Alert"}


def _d(value: float | None, places: int = 4) -> Decimal | None:
    return None if value is None else Decimal(str(round(value, places)))


def _values(point: EwmaPoint, reference: Reference, run: EwmaRun) -> dict:
    config = run.config
    return {
        "calculation_status": point.status,
        "observed_value": _d(point.observed),
        "baseline_mean": _d(reference.mean),
        "baseline_stddev": _d(reference.stddev),
        "previous_ewma": _d(point.previous_ewma),
        "ewma_value": _d(point.ewma),
        "upper_control_limit": _d(point.ucl),
        "warning_limit": _d(point.warning_limit),
        "lambda_value": _d(config.lam, 3),
        "k_value": _d(config.k, 2),
        "alert_state": point.state,
        "calculation_metadata": {
            "method": METHOD,
            "config": {key: round(value, 6) if isinstance(value, float) else value for key, value in config.as_dict().items()},
            "reference": reference.as_dict(),
            "monitoring_from": run.monitoring_from.isoformat(),
            "update": point.t,
            "sigma_factor": None if point.t == 0 else round(sigma_factor(config.lam, point.t), 6),
            "asymptotic_factor": round(asymptotic_factor(config.lam), 6),
            "asymptotic_ucl": None if point.asymptotic_ucl is None else round(point.asymptotic_ucl, 4),
            "distance_to_ucl": None if point.distance_to_ucl is None else round(point.distance_to_ucl, 4),
            "formula": {
                "ewma": "EWMA_t = lambda * Y_t + (1 - lambda) * EWMA_(t-1); EWMA_0 = reference mean",
                "ucl": "UCL_t = mean + k * SD * sqrt(lambda / (2 - lambda) * (1 - (1 - lambda)^(2t)))",
                "warning": "WL_t = mean + warning_fraction * k * SD * sqrt(...)",
            },
        },
    }


@dataclass
class EwmaReport:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    removed: int = 0
    state_changes: list[str] = field(default_factory=list)


def upsert_run(session: Session, run: EwmaRun, now: datetime | None = None) -> EwmaReport:
    """Store every day of both metrics. The caller commits."""
    now = now or datetime.now(UTC)
    report = EwmaReport()
    existing = {
        (row.signal_date, row.metric): row
        for row in session.scalars(select(StatisticalSignal).where(*EWMA_ROWS, StatisticalSignal.syndrome == run.syndrome))
    }
    wanted: set = set()
    changed_dates: set[str] = set()
    for metric, points in run.points.items():
        reference = run.references[metric]
        for point in points:
            key = (point.day, metric)
            wanted.add(key)
            values = _values(point, reference, run)
            row = existing.get(key)
            if row is None:
                session.add(StatisticalSignal(
                    mode="dynamic", method=METHOD, syndrome=run.syndrome, signal_date=point.day,
                    metric=metric, calculated_at=now, **values,
                ))
                report.created += 1
                continue
            row.calculated_at = now
            if all(getattr(row, name) == value for name, value in values.items()):
                report.unchanged += 1
                continue
            before = row.alert_state
            for name, value in values.items():
                setattr(row, name, value)
            report.updated += 1
            changed_dates.add(point.day.isoformat())
            if before != point.state and (before is not None or point.state is not None):
                description = (
                    f"{METRIC_LABEL[metric]} EWMA for {run.syndrome} on {point.day.isoformat()} changed from "
                    f"{STATE_LABEL.get(before, 'not monitored')} to {STATE_LABEL.get(point.state, 'not monitored')}"
                )
                if point.ewma is not None and point.ucl is not None:
                    description += f" (EWMA {point.ewma:.2f} vs UCL {point.ucl:.2f})"
                report.state_changes.append(description)
                session.flush()
                session.add(AuditEvent(
                    event_type="statistics.ewma.state_changed",
                    entity_type="statistical_signal",
                    entity_id=str(row.id),
                    description=description + ".",
                ))

    stale = [row for key, row in existing.items() if key not in wanted]
    for row in stale:
        session.delete(row)
    report.removed = len(stale)
    session.flush()

    summary = (
        f"EWMA (lambda {run.config.lam:g}, k {run.config.k:g}) for {run.syndrome}, "
        f"{run.first.isoformat()} to {run.last.isoformat()}, reference period "
        f"{run.first.isoformat()} to {(run.monitoring_from - timedelta(days=1)).isoformat()}"
    )
    if report.created:
        session.add(AuditEvent(
            event_type="statistics.ewma.calculated", entity_type="statistical_signal", entity_id=None,
            description=f"{summary}: {report.created} daily results stored.",
        ))
    if report.updated or report.removed:
        dates = sorted(changed_dates)
        span = f"{dates[0]} to {dates[-1]}" if dates else "none"
        session.add(AuditEvent(
            event_type="statistics.ewma.recalculated", entity_type="statistical_signal", entity_id=None,
            description=(
                f"{summary}: {report.updated} results changed (dates {span}), {report.removed} removed, "
                f"{report.unchanged} unchanged."
            ),
        ))
    return report


def clear(session: Session) -> int:
    removed = session.execute(delete(StatisticalSignal).where(*EWMA_ROWS)).rowcount
    if removed:
        session.add(AuditEvent(
            event_type="statistics.ewma.cleared", entity_type="statistical_signal", entity_id=None,
            description=f"Removed {removed} EWMA results. Composite and demonstration signals untouched.",
        ))
    return removed
