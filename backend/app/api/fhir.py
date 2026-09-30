"""
POST /api/fhir/ingest — CAPSTONE DEVELOPMENT INGESTION ENDPOINT.

This endpoint is a capstone development ingestion endpoint and is not
production-secured: no SMART on FHIR authorization, no authentication, no
rate limiting. It exists only where the development-only endpoints are
available (APP_ENV=development, or a private presentation deployment with
DEMO_ENDPOINTS_ENABLED=true) and answers 404 anywhere else. Data must be
synthetic.
"""

import logging
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.fhir.examples import EXAMPLES, EXAMPLES_BY_ID
from app.fhir.exceptions import IngestionIssue, IssueCode, RequestRejected
from app.fhir.parser import parse_json
from app.schemas.fhir import FhirExampleContent, FhirExampleSummary, IngestionResponse
from app.services.fhir_ingestion import IngestionReport, ingest_document

logger = logging.getLogger("app.fhir.ingestion")

ACCEPTED_CONTENT_TYPES = ("application/fhir+json", "application/json")


def require_development() -> None:
    """The ingestion endpoint does not exist outside development."""
    if not get_settings().demo_endpoints_available:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")


router = APIRouter(
    prefix="/api/fhir",
    tags=["FHIR ingestion (development only)"],
    dependencies=[Depends(require_development)],
)


def _summary(example) -> FhirExampleSummary:
    return FhirExampleSummary(
        id=example.id,
        title=example.title,
        description=example.description,
        kind=example.kind,
        expected=example.expected,
    )


@router.get("/examples", response_model=list[FhirExampleSummary])
def list_examples() -> list[FhirExampleSummary]:
    """The synthetic development fixtures (backend/examples/fhir), described."""
    return [_summary(example) for example in EXAMPLES]


@router.get(
    "/examples/{example_id}",
    response_model=FhirExampleContent,
    responses={status.HTTP_404_NOT_FOUND: {"description": "No such example."}},
)
def get_example(example_id: str) -> FhirExampleContent:
    """One synthetic fixture's content, exactly as stored (it may be deliberately malformed)."""
    example = EXAMPLES_BY_ID.get(example_id)
    if example is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Example not found.")
    return FhirExampleContent(**_summary(example).model_dump(), content=example.content())


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
