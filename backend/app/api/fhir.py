"""
POST /api/fhir/ingest — CAPSTONE DEVELOPMENT INGESTION ENDPOINT.

This endpoint is a capstone development ingestion endpoint and is not
production-secured: no SMART on FHIR authorization, no authentication, no
rate limiting. It exists only while APP_ENV=development and answers 404 in
any other environment. Data must be synthetic.
"""

import logging
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.fhir.exceptions import IngestionIssue, IssueCode, RequestRejected
from app.fhir.parser import parse_json
from app.schemas.fhir import IngestionResponse
from app.services.fhir_ingestion import IngestionReport, ingest_document

logger = logging.getLogger("app.fhir.ingestion")

ACCEPTED_CONTENT_TYPES = ("application/fhir+json", "application/json")


def require_development() -> None:
    """The ingestion endpoint does not exist outside development."""
    if get_settings().app_env != "development":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")


router = APIRouter(
    prefix="/api/fhir",
    tags=["FHIR ingestion (development only)"],
    dependencies=[Depends(require_development)],
)


async def read_body(request: Request) -> bytes:
    """The raw request body (read here so the route itself can stay synchronous)."""
    return await request.body()


def _response(report: IngestionReport, status_code: int = 200) -> JSONResponse:
    body = IngestionResponse(
        resources_received=report.resources_received,
        observations_received=report.observations_received,
        observations_validated=report.observations_validated,
        observations_created=report.observations_created,
        duplicates=report.duplicates,
        rejected=report.rejected,
        errors=[{**asdict(issue), "code": issue.code.value} for issue in report.errors],
        warnings=[{**asdict(issue), "code": issue.code.value} for issue in report.warnings],
        results=[asdict(result) for result in report.results],
    )
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


def _rejected_request(issue: IngestionIssue, status_code: int) -> JSONResponse:
    report = IngestionReport()
    report.errors.append(issue)
    logger.info("FHIR ingest: request rejected (%s)", issue.code.value)
    return _response(report, status_code)


@router.post(
    "/ingest",
    response_model=IngestionResponse,
    responses={
        400: {"model": IngestionResponse, "description": "Not JSON, not FHIR, or an unsupported top-level resource."},
        413: {"model": IngestionResponse, "description": "Request body too large."},
        415: {"model": IngestionResponse, "description": "Content type is not FHIR JSON."},
    },
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/fhir+json": {"schema": {"type": "object"}},
                "application/json": {"schema": {"type": "object"}},
            },
        }
    },
)
def ingest(
    request: Request,
    body: bytes = Depends(read_body),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Ingest a synthetic FHIR R4 Observation, or a Bundle (collection,
    transaction or batch) of Observations with supporting Organization,
    Location, Specimen and DiagnosticReport resources.

    Best effort per Observation: valid ones are stored, invalid ones are
    reported, and resubmissions are reported as duplicates. Development only;
    not production-secured.
    """
    settings = get_settings()
    media_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if media_type not in ACCEPTED_CONTENT_TYPES:
        return _rejected_request(
            IngestionIssue(IssueCode.INVALID_FHIR, "Send application/fhir+json or application/json."),
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    if len(body) > settings.fhir_max_request_bytes:
        return _rejected_request(
            IngestionIssue(IssueCode.INVALID_FHIR, f"Request body exceeds {settings.fhir_max_request_bytes} bytes."),
            status.HTTP_413_CONTENT_TOO_LARGE,
        )

    try:
        document = parse_json(body)
        report = ingest_document(db, document, salt=settings.fhir_pseudonym_salt.get_secret_value())
    except RequestRejected as rejected:
        db.rollback()
        return _rejected_request(rejected.issue, rejected.status_code)
    db.commit()
    return _response(report)
