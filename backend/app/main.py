"""
LabSentinel API entry point.

    uvicorn app.main:app --reload --port 8000

Interactive documentation is served at /docs.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import (
    cusum,
    demo,
    evaluation,
    facilities,
    fhir,
    health,
    observations,
    readiness,
    signals,
    statistics,
    surveillance,
)
from app.config import get_settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()

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
        # Browsers may only read — except where the development-only endpoints
        # are available (APP_ENV=development, or a private presentation
        # deployment with DEMO_ENDPOINTS_ENABLED=true): POST for the FHIR
        # ingestion demonstration and the dynamic-surveillance, EWMA and CUSUM
        # recalculations (the only POST routes, all 404 elsewhere).
        allow_methods=["GET", "POST"] if settings.demo_endpoints_available else ["GET"],
        allow_headers=["Content-Type", "Authorization"],
    )

    # Every data router is GET-only. Data enters the database through the
    # controlled seed (python -m app.seed) or development FHIR ingestion.
    app.include_router(health.router)
    app.include_router(facilities.router)
    app.include_router(observations.router)
    app.include_router(signals.router)
    app.include_router(demo.router)
    # Dynamic surveillance: GET-only signal reads, plus a development-only
    # recalculation that runs the engine (it accepts no signal values).
    app.include_router(surveillance.router)
    # Experimental EWMA statistical detector: GET-only reads, plus a
    # development-only recalculation (it accepts no values).
    app.include_router(statistics.router)
    # Experimental CUSUM detector and the three-method comparison: GET-only
    # reads, plus a development-only recalculation (it accepts no values).
    app.include_router(cusum.router)
    # Capstone evaluation results: development-only reads of the artifacts
    # written by `python -m app.evaluation.run` (no write endpoint).
    app.include_router(evaluation.router)
    # Capstone presentation readiness checklist: development-only, read-only.
    app.include_router(readiness.router)
    # The one write path: development-only FHIR ingestion (404 unless the
    # development-only endpoints are available). There are no generic POST/PUT/DELETE endpoints.
    app.include_router(fhir.router)
    return app


app = create_app()
