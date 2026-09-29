"""
``python -m app.seed.smart_sandbox``: provision the fictional SMART sandbox facility.

DEVELOPMENT ONLY. Creates (or confirms) one *development* facility,
SMART-SANDBOX, the target of the configured development source mapping for
the SMART Health IT sandbox (app/fhir/resolver.py). Once it exists, eligible
laboratory Observations sent from the SMART sidecar can be ingested; without
it they are rejected with "no LabSentinel facility mapping is configured".

It is not a participating surveillance facility: it is not returned by
GET /api/facilities, not shown on the dashboard, and not part of the frozen
five-day demonstration. It does not represent Epic, Oracle Health, MEDITECH
or any real organization.

    python -m app.seed.smart_sandbox           create or confirm
    python -m app.seed.smart_sandbox --remove  remove it again (and its ingested rows)
"""

import sys

from sqlalchemy import delete, select

from app.config import get_settings
from app.database import get_session_factory
from app.models import AuditEvent, Facility, LabObservation

CODE = "SMART-SANDBOX"
VALUES = {
    "name": "SMART Sandbox Facility (fictional development source)",
    "vendor": "SMART Health IT sandbox (synthetic)",
    "city": "Sandbox",
    "postal_code": "SANDBOX",
    "subregion": "Development",
    "region": "Sandbox",
    # ISO 3166 user-assigned code: deliberately not a real country.
    "country_code": "ZZ",
    "active": True,
    "participation": "development",
}


def main(argv: list[str]) -> int:
    if get_settings().app_env == "production":
        print("Refusing to provision a development facility with APP_ENV=production.")
        return 1
    with get_session_factory()() as session, session.begin():
        facility = session.scalar(select(Facility).where(Facility.facility_code == CODE))
        if "--remove" in argv:
            if facility is None:
                print(f"{CODE} does not exist; nothing to remove.")
                return 0
            removed = session.execute(
                delete(LabObservation).where(LabObservation.facility_id == facility.id)
            ).rowcount
            session.delete(facility)
            session.add(AuditEvent(event_type="facility.development.removed", entity_type="facility",
                                   entity_id=CODE, description=f"Removed development facility and {removed} "
                                   "sandbox-ingested observations."))
            print(f"Removed {CODE} and {removed} sandbox-ingested observation(s).")
            return 0
        if facility is None:
            session.add(Facility(facility_code=CODE, **VALUES))
            session.add(AuditEvent(event_type="facility.development.created", entity_type="facility",
                                   entity_id=CODE, description="Provisioned the fictional SMART sandbox "
                                   "development facility."))
            print(f"Created development facility {CODE}.")
        else:
            for key, value in VALUES.items():
                setattr(facility, key, value)
            print(f"{CODE} already exists; confirmed as a development facility.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
