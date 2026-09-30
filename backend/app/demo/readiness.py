"""
The capstone presentation readiness checklist — READ ONLY.

    python -m app.demo.readiness        print the checklist (exit 1 if any check fails)
    GET /api/readiness                  the same checklist (development / enabled
                                        presentation deployments only)

Each check is PASS, WARN (the demonstration still works, with a caveat) or
FAIL (fix before presenting). Nothing is repaired here, and nothing secret is
reported: no connection string, host, password, salt or token.
"""

import hashlib
import json
import logging
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.fhir.examples import EXAMPLES
from app.fhir.exceptions import RequestRejected
from app.fhir.parser import parse_json
from app.models import DemoSimulationDay, Facility, LabObservation, StatisticalSignal, SurveillanceSignal
from app.seed.dataset import DATASET_PATH
from app.seed.dynamic_dataset import SOURCE_PREFIX, planned_observations
from app.seed.parity import compare_with_frontend
from app.seed.smart_sandbox import CODE as SMART_SANDBOX_CODE

Status = Literal["PASS", "WARN", "FAIL"]

BACKEND_DIR = Path(__file__).resolve().parents[2]
#: The frozen classroom demonstration's Day 1-5 composite scores.
FROZEN_SCORES = (0, 24, 50, 74, 87)
REQUIRED_FACILITIES = ("HOSP-A", "HOSP-B", "HOSP-C")
EVALUATION_ARTIFACTS = ("evaluation-summary.json", "evaluation-summary.csv", "evaluation-report.md")
#: SHA-256 of the committed Phase 10 artifacts (line endings normalized to LF,
#: so a Windows checkout with CRLF matches). A different hash means the
#: artifacts are no longer the evaluated results: drift.
EVALUATION_SHA256 = {
    "evaluation-summary.json": "84760a9fae59d30bfc7159d998485187a4d6e96f2ba23a61750a95d6f2bbbcb0",
    "evaluation-summary.csv": "97a797cec8e6f0c76dbc5bf686a508423eb99845f43ea0b6c1ecf963041f446a",
    "evaluation-report.md": "ea341ee33f77a0a8f289e0f4275abb8c5a9a2956c8211ebe02c25ce50fed53c9",
}
EVALUATION_SEED = 20260930
EVALUATION_REPETITIONS = 100
EVALUATION_SCENARIOS = 15


@dataclass
class Check:
    key: str
    label: str
    status: Status
    detail: str


def overall(checks: list[Check]) -> str:
    return "NOT READY" if any(c.status == "FAIL" for c in checks) else "READY"


def normalized_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


# --------------------------------------------------------------------------
# Individual checks. Each returns one Check and never raises.
# --------------------------------------------------------------------------


def check_environment(settings: Settings) -> Check:
    endpoints = "available" if settings.demo_endpoints_available else "disabled (404)"
    status: Status = "PASS" if settings.app_env in ("development", "presentation") else "WARN"
    return Check("environment", "Environment", status,
                 f"APP_ENV={settings.app_env}; development-only endpoints {endpoints}.")


def check_database(session: Session) -> Check:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        return Check("database", "Database health", "FAIL", f"Not reachable ({type(error).__name__}).")
    return Check("database", "Database health", "PASS", "Connected.")


def migration_heads(session: Session) -> tuple[str | None, str | None]:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()
    current = MigrationContext.configure(session.connection()).get_current_revision()
    return current, head


def check_migrations(session: Session) -> Check:
    try:
        current, head = migration_heads(session)
    except SQLAlchemyError as error:
        return Check("migrations", "Migration version", "FAIL", f"Could not read ({type(error).__name__}).")
    if current == head:
        return Check("migrations", "Migration version", "PASS", f"At head ({head}).")
    return Check("migrations", "Migration version", "FAIL",
                 f"Database at {current or 'none'}, code expects {head}: run alembic upgrade head.")


def frozen_scores(session: Session) -> list[int]:
    rows = session.execute(
        select(DemoSimulationDay.day, SurveillanceSignal.composite_score)
        .join(SurveillanceSignal, DemoSimulationDay.signal_id == SurveillanceSignal.id)
        .order_by(DemoSimulationDay.day)
    ).all()
    return [int(score) for _, score in rows if score is not None]


def check_frozen_demo(session: Session) -> Check:
    try:
        raw = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
        problems = compare_with_frontend(session, raw)
        scores = frozen_scores(session)
    except (SQLAlchemyError, OSError, ValueError) as error:
        return Check("seed", "Frozen Day 1-5 demonstration", "FAIL", f"Could not verify ({type(error).__name__}).")
    shown = " / ".join(str(s) for s in scores) or "none"
    if problems or tuple(scores) != FROZEN_SCORES:
        return Check("seed", "Frozen Day 1-5 demonstration", "FAIL",
                     f"{len(problems)} difference(s) from the committed fixture; scores {shown}. "
                     "Run python -m app.seed (never edit the frozen data by hand).")
    return Check("seed", "Frozen Day 1-5 demonstration", "PASS",
                 f"{len(raw['facilities'])} facilities, {len(raw['observations'])} observations, "
                 f"{len(raw['days'])} days match the fixture; scores {shown}.")


def check_facilities(session: Session) -> Check:
    rows = {f.facility_code: f for f in session.scalars(select(Facility))}
    missing = [code for code in REQUIRED_FACILITIES if code not in rows or rows[code].participation != "participating"]
    if missing:
        return Check("facilities", "Participating facilities", "FAIL", f"Missing or not participating: {', '.join(missing)}.")
    return Check("facilities", "Participating facilities", "PASS", ", ".join(REQUIRED_FACILITIES) + " participating.")


def check_fhir(session: Session, settings: Settings) -> Check:
    """Every example parses as expected and runs through the real pipeline in a rolled-back savepoint."""
    salt = settings.fhir_pseudonym_salt.get_secret_value()
    from app.services.fhir_ingestion import ingest_document

    # A dry run: keep the ingestion log from announcing rows that are rolled back.
    ingestion_log = logging.getLogger("app.fhir.ingestion")
    previous = ingestion_log.disabled
    ingestion_log.disabled = True
    try:
        wrong = _dry_run(session, salt, ingest_document)
    finally:
        ingestion_log.disabled = previous
    endpoint = "endpoint available" if settings.demo_endpoints_available else "endpoint disabled in this environment"
    if wrong:
        return Check("fhir", "FHIR ingestion", "FAIL", "Fixtures behaved unexpectedly: " + "; ".join(wrong) + ".")
    status: Status = "PASS" if settings.demo_endpoints_available else "WARN"
    return Check("fhir", "FHIR ingestion", status,
                 f"{len(EXAMPLES)} synthetic fixtures behave as documented (dry run, rolled back); {endpoint}.")


def _dry_run(session: Session, salt: str, ingest_document) -> list[str]:
    wrong: list[str] = []
    for example in EXAMPLES:
        outcome = "rejected"
        try:
            document = parse_json(example.content().encode("utf-8"))
            nested = session.begin_nested()
            try:
                report = ingest_document(session, document, salt=salt)
                outcome = "rejected" if report.rejected or not report.observations_received else "accepted"
            finally:
                nested.rollback()
        except RequestRejected:
            outcome = "rejected"
        except (OSError, SQLAlchemyError) as error:
            wrong.append(f"{example.id} ({type(error).__name__})")
            continue
        expected = "rejected" if example.kind == "invalid" else "accepted"
        if outcome != expected:
            wrong.append(f"{example.id} {outcome}, expected {expected}")
    return wrong


def demo_leftovers(session: Session) -> int:
    """FHIR-ingested rows that are not part of the dynamic dataset: earlier live demonstrations."""
    return session.scalar(
        select(func.count()).select_from(LabObservation).where(
            LabObservation.source_system.like("fhir:%"),
            LabObservation.source_system.not_like(SOURCE_PREFIX + "%"),
        )
    ) or 0


def check_dynamic(session: Session) -> Check:
    planned = len(planned_observations())
    stored = session.scalar(
        select(func.count()).select_from(LabObservation).where(LabObservation.source_system.like(SOURCE_PREFIX + "%"))
    ) or 0
    signals = session.execute(
        select(func.count(), func.max(SurveillanceSignal.signal_date)).where(SurveillanceSignal.mode == "dynamic")
    ).one()
    leftovers = demo_leftovers(session)
    if stored != planned:
        return Check("dynamic", "Dynamic surveillance engine", "FAIL",
                     f"Dynamic dataset has {stored} of {planned} observations: run python -m app.demo.reset --yes.")
    if not signals[0]:
        return Check("dynamic", "Dynamic surveillance engine", "FAIL",
                     "No dynamic signals calculated: run python -m app.demo.reset --yes.")
    extra = f"; {leftovers} FHIR observation(s) left from an earlier demonstration" if leftovers else ""
    return Check("dynamic", "Dynamic surveillance engine", "WARN" if leftovers else "PASS",
                 f"Dataset {stored}/{planned} observations; {signals[0]} dynamic signals to {signals[1]}{extra}.")


def check_statistical(session: Session, method: str) -> Check:
    count, last = session.execute(
        select(func.count(), func.max(StatisticalSignal.signal_date)).where(StatisticalSignal.method == method)
    ).one()
    key = method.lower()
    if not count:
        return Check(key, f"{method} detector", "FAIL", f"No {method} results stored: run python -m app.demo.reset --yes.")
    return Check(key, f"{method} detector", "PASS", f"{count} stored results (both metrics) to {last}.")


def check_evaluation(settings: Settings) -> Check:
    directory = Path(settings.evaluation_results_dir)
    if not directory.is_absolute():
        directory = BACKEND_DIR / directory
    missing = [name for name in EVALUATION_ARTIFACTS if not (directory / name).is_file()]
    if missing:
        return Check("evaluation", "Evaluation artifacts", "FAIL", f"Missing: {', '.join(missing)}.")
    drifted = [name for name in EVALUATION_ARTIFACTS if normalized_sha256(directory / name) != EVALUATION_SHA256[name]]
    try:
        summary = json.loads((directory / "evaluation-summary.json").read_text(encoding="utf-8"))
    except ValueError:
        return Check("evaluation", "Evaluation artifacts", "FAIL", "evaluation-summary.json is not valid JSON.")
    shape = (summary.get("seed"), summary.get("repetitions"), len(summary.get("scenarios", [])))
    if drifted or shape != (EVALUATION_SEED, EVALUATION_REPETITIONS, EVALUATION_SCENARIOS):
        return Check("evaluation", "Evaluation artifacts", "FAIL",
                     f"Differ from the committed Phase 10 results ({', '.join(drifted) or 'summary shape'}); "
                     "restore them with git, do not re-tune.")
    return Check("evaluation", "Evaluation artifacts", "PASS",
                 f"Phase 10 results intact: {EVALUATION_SCENARIOS} scenarios x {EVALUATION_REPETITIONS} runs, "
                 f"seed {EVALUATION_SEED}, checksums match.")


def check_smart(session: Session) -> Check:
    present = session.scalar(select(Facility.id).where(Facility.facility_code == SMART_SANDBOX_CODE)) is not None
    if present:
        return Check("smart", "SMART sandbox bridge", "PASS",
                     f"{SMART_SANDBOX_CODE} development facility present (sidecar observations can be ingested). "
                     "The SMART client itself is configured in the frontend build.")
    return Check("smart", "SMART sandbox bridge", "WARN",
                 f"{SMART_SANDBOX_CODE} facility absent: the sidecar still launches and reads the sandbox, "
                 "but its ingestion bridge rejects rows. Optional: python -m app.seed.smart_sandbox.")


def run_checks(session: Session, settings: Settings | None = None) -> list[Check]:
    settings = settings or get_settings()
    checks = [check_environment(settings), check_database(session)]
    if checks[-1].status == "FAIL":
        return checks + [check_evaluation(settings)]
    checks.append(check_migrations(session))
    if checks[-1].status == "FAIL":
        return checks + [check_evaluation(settings)]
    checks += [
        check_frozen_demo(session),
        check_facilities(session),
        check_fhir(session, settings),
        check_dynamic(session),
        check_statistical(session, "EWMA"),
        check_statistical(session, "CUSUM"),
        check_evaluation(settings),
        check_smart(session),
    ]
    return checks


def as_dict(checks: list[Check], settings: Settings) -> dict:
    return {
        "status": overall(checks),
        "environment": settings.app_env,
        "checks": [asdict(c) for c in checks],
        "disclaimer": "Synthetic data only. Readiness of a capstone demonstration, not of a clinical system.",
    }


def print_checks(checks: list[Check]) -> None:
    for c in checks:
        print(f"  [{c.status:<4}] {c.label}: {c.detail}")


def main(argv: list[str]) -> int:
    from app.database import get_session_factory

    settings = get_settings()
    with get_session_factory()() as session:
        checks = run_checks(session, settings)
        session.rollback()
    print("LabSentinel presentation readiness (read only)")
    print_checks(checks)
    result = overall(checks)
    print(result)
    return 0 if result == "READY" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
