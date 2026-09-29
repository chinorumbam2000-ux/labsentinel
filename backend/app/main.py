"""
LabSentinel API entry point.

    uvicorn app.main:app --reload --port 8000

Interactive documentation is served at /docs.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import health
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="LabSentinel API",
        version=__version__,
        description=(
            "Development backend foundation for the LabSentinel capstone. "
            "Synthetic data only. FHIR ingestion, SMART on FHIR authentication, "
            "production security and live healthcare-system connectivity are "
            "not implemented in this phase."
        ),
    )

    # Explicit origins only; the settings layer rejects a wildcard.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )

    app.include_router(health.router)
    return app


app = create_app()
