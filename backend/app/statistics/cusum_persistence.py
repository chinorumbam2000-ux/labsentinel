"""
Persisting CUSUM results in statistical_signal (method = 'CUSUM'), beside EWMA.

Like EWMA, the CUSUM is recursive: every recalculation recomputes the whole
series from the persisted observations and reconciles one row per (date,
metric). Unchanged rows are left alone (only ``calculated_at`` moves); rows
for dates no longer in the series are removed. EWMA rows are never touched.

Audit events (aggregate figures only, never patient-level detail):

    statistics.cusum.calculated     new CUSUM results were stored
    statistics.cusum.recalculated   stored CUSUM results changed
    statistics.cusum.state_changed  Normal -> Statistical Alert, or back
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AuditEvent, StatisticalSignal
from app.statistics.cusum import CusumPoint
from app.statistics.cusum_service import REFERENCE_CONFIG, CusumRun
from app.statistics.types import METRIC_LABEL, Reference

METHOD = "CUSUM"
CUSUM_ROWS = (StatisticalSignal.mode == "dynamic", StatisticalSignal.method == METHOD)
STATE_LABEL = {"NORMAL": "Normal", "STATISTICAL_ALERT": "Statistical Alert"}


def _d(value: float | None, places: int = 4) -> Decimal | None:
    return None if value is None else Decimal(str(round(value, places)))


def _values(point: CusumPoint, reference: Reference, run: CusumRun) -> dict:
    config = run.config
    return {
        "calculation_status": point.status,
        "observed_value": _d(point.observed),
        "baseline_mean": _d(reference.mean),
        "baseline_stddev": _d(reference.stddev),
        "z_score": _d(point.z),
        "previous_cusum": _d(point.previous),
        "cusum_value": _d(point.value),
        "cusum_k": _d(config.k, 2),
        "cusum_h": _d(config.h, 2),
        "alert_state": point.state,
        "calculation_metadata": {
            "method": METHOD,
            "config": config.as_dict(),
            "reference": reference.as_dict(),
            "reference_shared_with": "EWMA",
            "reference_config": {
                "reference_days": REFERENCE_CONFIG.reference_days,
                "min_reference_days": REFERENCE_CONFIG.min_reference_days,
            },
            "monitoring_from": run.monitoring_from.isoformat(),
            "update": point.t,
            "increment": None if point.increment is None else round(point.increment, 4),
            "distance_to_limit": None if point.distance_to_limit is None else round(point.distance_to_limit, 4),
            "approaching_limit": point.approaching,
            "formula": {
                "z": "z_t = (Y_t - mean) / SD",
                "cusum": "C_t = max(0, C_(t-1) + z_t - k); C_0 = 0",
                "decision": "STATISTICAL_ALERT when C_t >= h",
            },
        },
    }


@dataclass
class CusumReport:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    removed: int = 0
    state_changes: list[str] = field(default_factory=list)


def upsert_run(session: Session, run: CusumRun, now: datetime | None = None) -> CusumReport:
    """Store every day of both metrics. The caller commits."""
    now = now or datetime.now(UTC)
    report = CusumReport()
    existing = {
        (row.signal_date, row.metric): row
        for row in session.scalars(select(StatisticalSignal).where(*CUSUM_ROWS, StatisticalSignal.syndrome == run.syndrome))
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
                    f"{METRIC_LABEL[metric]} CUSUM for {run.syndrome} on {point.day.isoformat()} changed from "
                    f"{STATE_LABEL.get(before, 'not monitored')} to {STATE_LABEL.get(point.state, 'not monitored')}"
                )
                if point.value is not None:
                    description += f" (C {point.value:.2f} vs h {run.config.h:g})"
                report.state_changes.append(description)
                session.flush()
                session.add(AuditEvent(
                    event_type="statistics.cusum.state_changed",
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
        f"CUSUM (k {run.config.k:g}, h {run.config.h:g}) for {run.syndrome}, {run.first.isoformat()} to "
        f"{run.last.isoformat()}, reference period {run.first.isoformat()} to "
        f"{(run.monitoring_from - timedelta(days=1)).isoformat()} (shared with EWMA)"
    )
    if report.created:
        session.add(AuditEvent(
            event_type="statistics.cusum.calculated", entity_type="statistical_signal", entity_id=None,
            description=f"{summary}: {report.created} daily results stored.",
        ))
    if report.updated or report.removed:
        dates = sorted(changed_dates)
        span = f"{dates[0]} to {dates[-1]}" if dates else "none"
        session.add(AuditEvent(
            event_type="statistics.cusum.recalculated", entity_type="statistical_signal", entity_id=None,
            description=(
                f"{summary}: {report.updated} results changed (dates {span}), {report.removed} removed, "
                f"{report.unchanged} unchanged."
            ),
        ))
    return report


def clear(session: Session) -> int:
    removed = session.execute(delete(StatisticalSignal).where(*CUSUM_ROWS)).rowcount
    if removed:
        session.add(AuditEvent(
            event_type="statistics.cusum.cleared", entity_type="statistical_signal", entity_id=None,
            description=f"Removed {removed} CUSUM results. EWMA, composite and demonstration signals untouched.",
        ))
    return removed
