"""
``python -m app.demo.reset``: return the development data to the clean
capstone-presentation state.

DEVELOPMENT / PRIVATE PRESENTATION ONLY. A command, never an HTTP endpoint.

    python -m app.demo.reset          dry run: show what would change, change nothing
    python -m app.demo.reset --yes    apply, in one transaction

What it resets:

- FHIR observations ingested during earlier live demonstrations (FHIR
  Ingestion page, SMART sidecar bridge): every ``fhir:`` row that is not part
  of the synthetic dynamic-surveillance dataset;
- the dynamic-surveillance dataset: removed and re-ingested through the real
  FHIR pipeline (deterministic, so the same 2,589 observations);
- dynamic, EWMA and CUSUM results: cleared and recalculated with the
  unchanged engines and default parameters.

What it never touches: the frozen Day 1-5 demonstration (its 699
observations, 5 signals and simulation days), facilities (including the
optional SMART-SANDBOX facility), migrations, the Phase 10 evaluation
artifacts and the audit trail, which stays append-only (the reset adds one
``demo.reset`` event). Investigation and reporting state live in the
browser session: use the app's Reset button or a new browser session.

Safeguards: refuses APP_ENV=test or production; refuses a database that is
not at the migration head or whose frozen demonstration does not match the
committed fixture; deletes only ``fhir:`` rows; verifies the frozen
demonstration again afterwards and rolls everything back if it changed.
"""

import sys
from dataclasses import dataclass, field

from sqlalchemy import delete, func, make_url, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.demo import readiness
from app.models import AuditEvent, LabObservation, StatisticalSignal, SurveillanceSignal
from app.seed import dynamic_dataset
from app.statistics import cusum_persistence, cusum_service, persistence, service
from app.statistics.cusum import CusumConfig
from app.statistics.types import EwmaConfig
from app.surveillance.aggregator import observed_date_range
from app.surveillance.persistence import clear_dynamic_signals, recalculate
from app.surveillance.types import DEFAULT_SYNDROME, EngineConfig

ALLOWED_ENVIRONMENTS = ("development", "presentation")


class ResetRefused(RuntimeError):
    """The database is not one this command may reset."""


@dataclass
class ResetPlan:
    demo_observations: int
    dataset_observations: int
    dynamic_signals: int
    ewma_results: int
    cusum_results: int

    def lines(self) -> list[str]:
        return [
            f"{self.demo_observations} FHIR observation(s) from earlier live demonstrations would be removed",
            f"{self.dataset_observations} dynamic-dataset observation(s) would be re-ingested "
            f"({len(dynamic_dataset.planned_observations())} expected)",
            f"{self.dynamic_signals} dynamic, {self.ewma_results} EWMA and {self.cusum_results} CUSUM "
            "result(s) would be cleared and recalculated",
        ]


@dataclass
class ResetReport:
    demo_observations_removed: int = 0
    dataset_removed: int = 0
    dataset_created: int = 0
    dataset_rejected: int = 0
    dynamic_signals: int = 0
    ewma_results: int = 0
    cusum_results: int = 0
    notes: list[str] = field(default_factory=list)

    def lines(self) -> list[str]:
        return [
            f"removed {self.demo_observations_removed} FHIR observation(s) from earlier live demonstrations",
            f"dynamic dataset: removed {self.dataset_removed}, re-ingested {self.dataset_created} "
            f"({self.dataset_rejected} rejected)",
            f"recalculated {self.dynamic_signals} dynamic signal(s), {self.ewma_results} EWMA and "
            f"{self.cusum_results} CUSUM result(s)",
            *self.notes,
        ]


def _count(session: Session, model, *where) -> int:
    return session.scalar(select(func.count()).select_from(model).where(*where)) or 0


def _demo_rows():
    return (
        LabObservation.source_system.like("fhir:%"),
        LabObservation.source_system.not_like(dynamic_dataset.SOURCE_PREFIX + "%"),
    )


def plan(session: Session) -> ResetPlan:
    return ResetPlan(
        demo_observations=_count(session, LabObservation, *_demo_rows()),
        dataset_observations=_count(session, LabObservation, LabObservation.source_system.like(dynamic_dataset.SOURCE_PREFIX + "%")),
        dynamic_signals=_count(session, SurveillanceSignal, SurveillanceSignal.mode == "dynamic"),
        ewma_results=_count(session, StatisticalSignal, StatisticalSignal.method == "EWMA"),
        cusum_results=_count(session, StatisticalSignal, StatisticalSignal.method == "CUSUM"),
    )


def frozen_snapshot(session: Session) -> tuple:
    """Everything the reset must leave exactly as it was."""
    return (
        tuple(readiness.frozen_scores(session)),
        _count(session, LabObservation, LabObservation.source_system.not_like("fhir:%")),
        _count(session, SurveillanceSignal, SurveillanceSignal.mode == "demo"),
    )


def preflight(session: Session) -> None:
    """Refuse anything that is not recognisably an intact LabSentinel development database."""
    environment = get_settings().app_env
    if environment not in ALLOWED_ENVIRONMENTS:
        raise ResetRefused(f"Refusing to reset with APP_ENV={environment}; allowed: {', '.join(ALLOWED_ENVIRONMENTS)}.")
    for check in (readiness.check_migrations(session), readiness.check_frozen_demo(session), readiness.check_facilities(session)):
        if check.status == "FAIL":
            raise ResetRefused(f"{check.label}: {check.detail}")


def reset(session: Session) -> ResetReport:
    """Apply the reset in the caller's transaction (the caller commits). Runs the preflight itself."""
    preflight(session)
    before = frozen_snapshot(session)
    report = ResetReport()

    report.demo_observations_removed = session.execute(delete(LabObservation).where(*_demo_rows())).rowcount
    report.dataset_removed = dynamic_dataset.remove(session)
    clear_dynamic_signals(session)
    persistence.clear(session)
    cusum_persistence.clear(session)

    loaded = dynamic_dataset.load(session)
    report.dataset_created, report.dataset_rejected = loaded.created, loaded.rejected
    if loaded.rejected:
        raise ResetRefused(f"{loaded.rejected} dynamic-dataset observation(s) were rejected; nothing was changed.")

    session.flush()
    config = EngineConfig()
    span = observed_date_range(session, DEFAULT_SYNDROME, config)
    if span is None:
        raise ResetRefused("No eligible observations after reloading the dynamic dataset; nothing was changed.")
    recalculate(session, DEFAULT_SYNDROME, span[0], span[1], config)
    report.dynamic_signals = _count(session, SurveillanceSignal, SurveillanceSignal.mode == "dynamic")

    ewma_run = service.calculate(session, DEFAULT_SYNDROME, EwmaConfig())
    cusum_run = cusum_service.calculate(session, DEFAULT_SYNDROME, CusumConfig())
    if ewma_run is None or cusum_run is None:
        raise ResetRefused("The statistical detectors produced no results; nothing was changed.")
    persistence.upsert_run(session, ewma_run)
    cusum_persistence.upsert_run(session, cusum_run)
    report.ewma_results = _count(session, StatisticalSignal, StatisticalSignal.method == "EWMA")
    report.cusum_results = _count(session, StatisticalSignal, StatisticalSignal.method == "CUSUM")

    session.flush()
    if frozen_snapshot(session) != before:
        raise ResetRefused("The frozen demonstration changed during the reset; everything was rolled back.")
    report.notes.append(f"frozen Day 1-5 demonstration unchanged: scores {' / '.join(map(str, before[0]))}")

    session.add(AuditEvent(
        event_type="demo.reset", entity_type="dataset", entity_id="capstone-presentation",
        description=(
            "Development data returned to the clean presentation state: "
            f"{report.demo_observations_removed} live-demo FHIR observations removed, dynamic dataset re-ingested "
            f"({report.dataset_created}), dynamic/EWMA/CUSUM recalculated. Frozen demonstration untouched."
        ),
    ))
    return report


def describe_database() -> str:
    url = make_url(get_settings().database_url.get_secret_value())
    return f"database {url.database!r}"  # never the host, user or password


def main(argv: list[str]) -> int:
    from app.database import get_session_factory

    apply = "--yes" in argv
    print(f"LabSentinel demo reset ({describe_database()}, APP_ENV={get_settings().app_env})")
    with get_session_factory()() as session:
        try:
            preflight(session)
        except ResetRefused as refused:
            print(f"REFUSED: {refused}")
            return 1
        if not apply:
            for line in plan(session).lines():
                print(f"  {line}")
            print("Dry run: nothing changed. Re-run with --yes to apply.")
            session.rollback()
            return 0
        try:
            with session.begin_nested():
                report = reset(session)
            session.commit()
        except ResetRefused as refused:
            session.rollback()
            print(f"REFUSED: {refused}")
            return 1
    for line in report.lines():
        print(f"  {line}")
    print("Reset complete. The frozen demonstration and the evaluation artifacts were not touched.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
