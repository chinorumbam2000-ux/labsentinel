import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import __version__
from app.database import get_db
from app.schemas.health import DatabaseHealthResponse, HealthResponse

logger = logging.getLogger(__name__)

SERVICE_NAME = "LabSentinel API"

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness: the API process is up. Does not touch the database."""
    return HealthResponse(status="healthy", service=SERVICE_NAME, version=__version__)


@router.get(
    "/database",
    response_model=DatabaseHealthResponse,
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": DatabaseHealthResponse,
            "description": "The database could not be reached.",
        }
    },
)
def database_health(db: Session = Depends(get_db)) -> DatabaseHealthResponse | JSONResponse:
    """Readiness: runs ``SELECT 1`` against the configured database."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        # Log only the exception class. Driver messages can include the host,
        # port and user name, which do not belong in logs or in the response.
        logger.warning("Database health check failed: %s", type(exc).__name__)
        body = DatabaseHealthResponse(status="unhealthy", database="unavailable")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=body.model_dump(),
        )
    return DatabaseHealthResponse(status="healthy", database="connected")
