"""
``python -m app.demo.prepare``: get LabSentinel ready for the final capstone
presentation, then report READY / NOT READY.

DEVELOPMENT / PRIVATE PRESENTATION ONLY.

    python -m app.demo.prepare            verify, reset the presentation data, verify again
    python -m app.demo.prepare --check    verify only; change nothing

Steps:

 1. database connection            stop if unreachable
 2. migrations at head             stop if not (run alembic upgrade head yourself)
 3. frozen Day 1-5 seed intact     stop if not (run python -m app.seed yourself)
 4. clear presentation leftovers   (python -m app.demo.reset)
 5. restore the dynamic dataset    and recalculate dynamic, EWMA and CUSUM
 6. FHIR fixtures                  dry run through the real pipeline, rolled back
 7. evaluation artifacts           present and identical to the Phase 10 results
 8. health endpoints               /api/health, /api/health/database, /api/readiness
 9. READY / NOT READY

Serious problems (steps 1-3, a changed evaluation artifact) are reported,
never silently repaired. Only the routine presentation data of steps 4-5 is
reset, with the reset command's safeguards.
"""

import sys

from app.config import get_settings
from app.demo import readiness
from app.demo.reset import ALLOWED_ENVIRONMENTS, ResetRefused, describe_database, reset


def health_checks() -> list[readiness.Check]:
    """Call the real endpoints in-process (no server needed, no network)."""
    from fastapi.testclient import TestClient

    from app.main import create_app

    checks: list[readiness.Check] = []
    with TestClient(create_app()) as client:
        for path, label in (("/api/health", "API health"), ("/api/health/database", "API database health")):
            response = client.get(path)
            ok = response.status_code == 200 and response.json().get("status") == "healthy"
            checks.append(readiness.Check(path, label, "PASS" if ok else "FAIL", f"GET {path} -> {response.status_code}."))
        response = client.get("/api/readiness")
        if response.status_code == 404:
            checks.append(readiness.Check("/api/readiness", "Readiness endpoint", "WARN",
                                          "Disabled in this environment (development-only endpoints are off)."))
        else:
            checks.append(readiness.Check("/api/readiness", "Readiness endpoint",
                                          "PASS" if response.status_code == 200 else "FAIL",
                                          f"GET /api/readiness -> {response.status_code} ({response.json().get('status')})."))
    return checks


def main(argv: list[str]) -> int:
    from app.database import get_session_factory

    check_only = "--check" in argv
    settings = get_settings()
    print(f"LabSentinel presentation preparation ({describe_database()}, APP_ENV={settings.app_env})")
    if not check_only and settings.app_env not in ALLOWED_ENVIRONMENTS:
        print(f"REFUSED: APP_ENV={settings.app_env}; preparation resets presentation data only in "
              f"{' or '.join(ALLOWED_ENVIRONMENTS)}. Use --check for a read-only check.")
        return 1
    step = 0

    def say(text: str) -> None:
        nonlocal step
        step += 1
        print(f"{step}. {text}")

    with get_session_factory()() as session:
        for check, fix in (
            (readiness.check_database, None),
            (readiness.check_migrations, "alembic upgrade head"),
            (readiness.check_frozen_demo, "python -m app.seed"),
        ):
            result = check(session)
            say(f"{result.label}: [{result.status}] {result.detail}")
            if result.status == "FAIL":
                print(f"NOT READY. Not repaired automatically{f'; review, then run {fix}' if fix else ''}.")
                return 1

        if check_only:
            say("Presentation data: skipped (--check)")
        else:
            say("Clearing presentation leftovers and restoring the dynamic dataset")
            try:
                with session.begin_nested():
                    report = reset(session)
                session.commit()
            except ResetRefused as refused:
                session.rollback()
                print(f"   REFUSED: {refused}")
                print("NOT READY.")
                return 1
            for line in report.lines():
                print(f"   {line}")

    with get_session_factory()() as session:
        checks = readiness.run_checks(session, settings)
        session.rollback()
    say("Readiness checklist")
    readiness.print_checks(checks)
    say("Health endpoints")
    endpoint_checks = health_checks()
    readiness.print_checks(endpoint_checks)

    result = readiness.overall(checks + endpoint_checks)
    print(result)
    if result == "READY":
        print("Next: start the API and the React app in API mode (see docs/presentation-guide.md).")
    return 0 if result == "READY" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
