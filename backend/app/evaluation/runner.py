"""
Run the three existing detectors, UNCHANGED and with their default
parameters, on one realization of a scenario.

    generate observations -> insert into a throwaway evaluation database ->
    Composite (app.surveillance.persistence.recalculate), EWMA
    (app.statistics.service.calculate), CUSUM (app.statistics.cusum_service.calculate)
    -> one DayRecord per monitored day

The detectors read the evaluation database exactly as they read the
application's: the same aggregation, eligibility, baselines and formulas.

As-of scenarios (delayed data) are replayed day by day: on each monitored day
D only the results received by the end of D are in the database, recent days
are recalculated as more of their results arrive, and a detector "sees" the
outbreak on the first D at which any of its results for a date in
[onset, D] is an alert.
"""

import os
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import Engine, insert, select
from sqlalchemy.orm import Session

from app.evaluation import generator
from app.evaluation.database import Workspace, sqlite_engine
from app.evaluation.scenarios import END, MONITORING_START, ONSET, START, BY_ID, ground_truth
from app.evaluation.types import DayRecord, RealizationResult, Scenario
from app.models import Facility, LabObservation, SurveillanceSignal
from app.statistics import cusum, cusum_service, ewma, service
from app.statistics.cusum import CusumConfig
from app.statistics.types import EwmaConfig
from app.surveillance.persistence import recalculate
from app.surveillance.types import EngineConfig

ZONE = ZoneInfo("America/New_York")
SYNDROME = generator.SYNDROME
#: Recent days recalculated in as-of replay: the longest reporting delay.
REVISION_DAYS = 3


def _day_end_utc(day: date) -> datetime:
    return datetime.combine(day + timedelta(days=1), time.min, ZONE).astimezone(UTC)


def _insert(session: Session, rows: list[dict], facility_ids: dict[str, int]) -> None:
    if rows:
        session.execute(
            insert(LabObservation),
            [{**{k: v for k, v in row.items() if k != "facility_code"}, "facility_id": facility_ids[row["facility_code"]]}
             for row in rows],
        )


def _states(run, day: date) -> tuple[str | None, str | None]:
    if run is None:
        return None, None
    by_metric = {m: next((p for p in run.points[m] if p.day == day), None) for m in ("volume", "positivity")}
    return tuple(p.state if p else None for p in (by_metric["volume"], by_metric["positivity"]))  # type: ignore[return-value]


def _records(session: Session, scenario: Scenario, ewma_run, cusum_run, series) -> list[DayRecord]:
    signals = {
        s.signal_date: s
        for s in session.scalars(select(SurveillanceSignal).where(SurveillanceSignal.mode == "dynamic"))
    }
    records: list[DayRecord] = []
    day = MONITORING_START
    while day <= END:
        signal = signals.get(day)
        ev, ep = _states(ewma_run, day)
        cv, cp = _states(cusum_run, day)
        cusum_points = {m: next((p for p in cusum_run.points[m] if p.day == day), None) for m in ("volume", "positivity")} if cusum_run else {}
        records.append(DayRecord(
            day=day,
            truth="outbreak" if scenario.outbreak_present and day >= ONSET else "normal",
            volume=int(series["volume"].get(day) or 0),
            positivity=series["positivity"].get(day),
            composite_status=signal.calculation_status if signal else "MISSING",
            composite_score=None if signal is None or signal.composite_score is None else float(signal.composite_score),
            composite_severity=signal.severity if signal else None,
            affected_facilities=signal.affected_facilities if signal else 0,
            data_confidence=None if signal is None or signal.data_confidence_score is None else float(signal.data_confidence_score),
            ewma_volume=ev,
            ewma_positivity=ep,
            ewma_overall=ewma.overall_state([ev, ep]),
            cusum_volume=cv,
            cusum_positivity=cp,
            cusum_overall=cusum.overall_state([cv, cp]),
            cusum_volume_value=cusum_points.get("volume").value if cusum_points.get("volume") else None,
            cusum_positivity_value=cusum_points.get("positivity").value if cusum_points.get("positivity") else None,
        ))
        day += timedelta(days=1)
    return records


def _any_alert(session: Session, ewma_run, cusum_run, first: date, last: date) -> dict[str, bool]:
    composite = session.scalar(
        select(SurveillanceSignal.id).where(
            SurveillanceSignal.mode == "dynamic",
            SurveillanceSignal.signal_date >= first,
            SurveillanceSignal.signal_date <= last,
            SurveillanceSignal.severity.in_(("High", "Critical")),
        ).limit(1)
    ) is not None

    def alert(run) -> bool:
        return run is not None and any(
            p.state == "STATISTICAL_ALERT" and first <= p.day <= last for m in ("volume", "positivity") for p in run.points[m]
        )

    return {"composite": composite, "ewma": alert(ewma_run), "cusum": alert(cusum_run)}


def run_realization(scenario: Scenario, repetition: int, base_seed: int, database: Path) -> RealizationResult:
    engine: Engine = sqlite_engine(database)
    try:
        return run_on_engine(engine, scenario, repetition, base_seed)
    finally:
        engine.dispose()


def run_on_engine(engine: Engine, scenario: Scenario, repetition: int, base_seed: int) -> RealizationResult:
    """Run one realization on any migrated database holding the EVAL facilities (SQLite or PostgreSQL)."""
    rows, _ = generator.generate(scenario, repetition, base_seed)
    truth = ground_truth(scenario)
    result = RealizationResult(scenario.id, repetition, base_seed, truth, [], observation_count=len(rows))
    engine_config, ewma_config, cusum_config = EngineConfig(), EwmaConfig(), CusumConfig()

    with Session(engine) as session, session.begin():
        facility_ids = {f.facility_code: f.id for f in session.scalars(select(Facility))}
        if not scenario.as_of:
            _insert(session, rows, facility_ids)
            recalculate(session, SYNDROME, MONITORING_START, END, engine_config)
        else:
            pending = sorted(rows, key=lambda r: r["received_datetime"])
            cutoff = _day_end_utc(MONITORING_START - timedelta(days=1))
            ready = [r for r in pending if r["received_datetime"] < cutoff]
            pending = pending[len(ready):]
            _insert(session, ready, facility_ids)
            seen: dict[str, date | None] = {"composite": None, "ewma": None, "cusum": None}
            day = MONITORING_START
            while day <= END:
                cutoff = _day_end_utc(day)
                ready = [r for r in pending if r["received_datetime"] < cutoff]
                pending = pending[len(ready):]
                _insert(session, ready, facility_ids)
                recalculate(session, SYNDROME, max(MONITORING_START, day - timedelta(days=REVISION_DAYS)), day, engine_config)
                if day >= ONSET and not all(seen.values()):
                    ewma_now = service.calculate(session, SYNDROME, ewma_config)
                    cusum_now = cusum_service.calculate(session, SYNDROME, cusum_config)
                    for detector, alerted in _any_alert(session, ewma_now, cusum_now, ONSET, day).items():
                        if alerted and seen[detector] is None:
                            seen[detector] = day
                day += timedelta(days=1)
            result.as_of_detection = seen
            # Finally, everything that arrives after the series ends, for the retrospective view.
            _insert(session, pending, facility_ids)
            recalculate(session, SYNDROME, END - timedelta(days=REVISION_DAYS), END, engine_config)

        ewma_run = service.calculate(session, SYNDROME, ewma_config)
        cusum_run = cusum_service.calculate(session, SYNDROME, cusum_config)
        result.series = service.daily_series(session, SYNDROME, START, END)
        result.days = _records(session, scenario, ewma_run, cusum_run, result.series)
    return result


def run_one(args: tuple[str, int, int]) -> RealizationResult:
    """Process-pool entry point: (scenario id, repetition, base seed)."""
    scenario_id, repetition, base_seed = args
    workspace = _process_workspace()
    database = workspace.fresh(f"{scenario_id}-{repetition}-{os.getpid()}")
    try:
        return run_realization(BY_ID[scenario_id], repetition, base_seed, database)
    finally:
        database.unlink(missing_ok=True)


_WORKSPACE: Workspace | None = None


def _process_workspace() -> Workspace:
    global _WORKSPACE
    if _WORKSPACE is None:
        _WORKSPACE = Workspace()
    return _WORKSPACE
