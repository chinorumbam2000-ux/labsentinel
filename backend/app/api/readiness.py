"""
GET /api/readiness — the capstone presentation readiness checklist.

DEVELOPMENT ONLY (or a private presentation deployment with
DEMO_ENDPOINTS_ENABLED=true): 404 anywhere else. Read only: it runs the same
checks as ``python -m app.demo.readiness`` and repairs nothing. The response
holds no connection string, host, password, salt or token.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.demo import readiness


def require_demo_endpoints() -> None:
    if not get_settings().demo_endpoints_available:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")


router = APIRouter(
    prefix="/api/readiness",
    tags=["capstone readiness (development only)"],
    dependencies=[Depends(require_demo_endpoints)],
)


@router.get("")
def get_readiness(db: Session = Depends(get_db)) -> dict:
    settings = get_settings()
    checks = readiness.run_checks(db, settings)
    db.rollback()  # the FHIR dry run used savepoints; leave nothing behind
    return readiness.as_dict(checks, settings)
