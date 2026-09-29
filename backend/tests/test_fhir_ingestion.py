"""
FHIR ingestion end to end: POST /api/fhir/ingest → database → GET /api/observations.

Runs on SQLite here and, via tests/integration/test_fhir_postgres.py, on
PostgreSQL with the same test bodies. Each test starts from the seeded
dataset; the fhir_env fixture removes FHIR-ingested rows afterwards.
"""

import copy
import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select, text
from sqlalchemy.orm import Session

from app.models import AuditEvent, LabObservation, SurveillanceSignal

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "fhir"
FHIR_JSON = {"Content-Type": "application/fhir+json"}
SEED_OBSERVATIONS = 699


def example(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def post(client: TestClient, document, content_type: str = "application/fhir+json", status: int = 200) -> dict:
    body = document if isinstance(document, (bytes, str)) else json.dumps(document)
    response = client.post("/api/fhir/ingest", content=body, headers={"Content-Type": content_type})
    assert response.status_code == status, response.text
    return response.json()


def counts(response: dict) -> tuple:
    return (
        response["observations_validated"],
        response["observations_created"],
        response["duplicates"],
        response["rejected"],
    )


def fhir_rows(engine: Engine) -> list[LabObservation]:
    with Session(engine) as session:
        return list(
            session.scalars(
                select(LabObservation)
                .where(LabObservation.source_system.like("fhir:%"))
                .order_by(LabObservation.id)
            )
        )


# --- single Observations -----------------------------------------------------


def test_valid_observation_is_created_and_readable(fhir_env) -> None:
    client, engine = fhir_env
    before = datetime.now(UTC)

    response = post(client, example("case-a-influenza-a-positive.json"))

    assert response["resources_received"] == 1
    assert counts(response) == (1, 1, 0, 0)
    assert response["errors"] == [] and response["warnings"] == []
    outcome = response["results"][0]
    assert outcome["outcome"] == "created"
    assert outcome["source_observation_id"] == "A-FLU-20260112-0001"

    # Read-after-write through the existing read API.
    page = client.get(
        "/api/observations",
        params={"source_system": "fhir:urn:labsentinel:synthetic:hosp-a:lab-result"},
    ).json()
    assert page["total"] == 1
    row = page["items"][0]
    assert row["id"] == outcome["observation_id"]
    assert (row["syndrome"], row["test_name"], row["loinc_code"]) == (
        "Respiratory Viral Syndrome", "Influenza A RNA", "92142-9",
    )
    assert (row["result_type"], row["result_value"], row["result_code"]) == ("coded", "Positive", "260373001")
    assert row["terminology_status"] == "mapped"
    assert row["effective_datetime"] == "2026-01-12T09:30:00-05:00"
    assert row["geographic_unit"] == "01604"
    assert row["specimen_type"] == "Nasopharyngeal swab"
    assert row["patient_reference"].startswith("FHIR-PT-")
    # Unlike seeded rows, ingested rows carry LabSentinel's own receipt time.
    received = datetime.fromisoformat(row["received_datetime"])
    assert before - timedelta(seconds=5) <= received <= datetime.now(UTC) + timedelta(seconds=5)


def test_same_observation_twice_is_a_duplicate(fhir_env) -> None:
    client, engine = fhir_env
    first = post(client, example("case-a-influenza-a-positive.json"))
    second = post(client, example("case-f-duplicate-of-case-a.json"))

    assert counts(first)[1] == 1
    assert counts(second) == (1, 0, 1, 0)
    assert second["results"][0]["outcome"] == "duplicate"
    assert second["results"][0]["observation_id"] == first["results"][0]["observation_id"]
    assert [w["code"] for w in second["warnings"]] == ["DUPLICATE"]
    assert len(fhir_rows(engine)) == 1


def test_changed_resubmission_is_reported_but_not_applied(fhir_env) -> None:
    client, engine = fhir_env
    post(client, example("case-a-influenza-a-positive.json"))
    changed = example("case-a-influenza-a-positive.json")
    changed["status"] = "corrected"
    changed["valueCodeableConcept"] = {"coding": [{"system": "http://snomed.info/sct", "code": "260415000"}]}

    response = post(client, changed)

    assert counts(response) == (1, 0, 1, 0)
    assert "differs" in response["results"][0]["message"]
    assert fhir_rows(engine)[0].result_value == "Positive"


@pytest.mark.parametrize(
    ("fixture", "code"),
    [
        ("case-g-invalid-loinc.json", "INVALID_LOINC"),
        ("case-i-unresolvable-facility.json", "UNRESOLVED_FACILITY"),
        ("case-j-vital-signs-not-laboratory.json", "NON_LAB_OBSERVATION"),
    ],
)
def test_invalid_observations_are_rejected_with_structured_errors(fhir_env, fixture: str, code: str) -> None:
    client, engine = fhir_env
    response = post(client, example(fixture))

    assert counts(response) == (0, 0, 0, 1)
    assert [error["code"] for error in response["errors"]] == [code]
    error = response["errors"][0]
    assert set(error) == {"code", "message", "resource", "severity"}
    assert error["resource"].startswith("Observation/")
    assert "Traceback" not in json.dumps(response)
    assert fhir_rows(engine) == []


def test_unmapped_loinc_is_kept_without_a_guessed_syndrome(fhir_env) -> None:
    client, engine = fhir_env
    response = post(client, example("case-h-unmapped-loinc.json"))

    assert counts(response) == (1, 1, 0, 0)
    assert [w["code"] for w in response["warnings"]] == ["UNMAPPED_LOINC"]
    row = fhir_rows(engine)[0]
    assert (row.loinc_code, row.terminology_status, row.syndrome) == ("5195-3", "unmapped", None)
    assert row.test_name == "Hepatitis B virus surface Ag [Presence] in Serum"
    assert row.code_display == "Hepatitis B virus surface Ag [Presence] in Serum"


def test_quantity_result_is_stored_with_its_unit(fhir_env) -> None:
    client, engine = fhir_env
    post(client, example("case-d-quantity-hemoglobin.json"))

    row = client.get(
        "/api/observations", params={"source_system": "fhir:urn:labsentinel:synthetic:hosp-a:lab-result"}
    ).json()["items"][0]
    assert (row["result_type"], row["result_numeric"], row["result_unit"]) == ("quantity", 13.2, "g/dL")
    assert (row["result_unit_system"], row["result_unit_code"]) == ("http://unitsofmeasure.org", "g/dL")


# --- Bundles -------------------------------------------------------------------


def test_bundle_resolves_references_and_report_context(fhir_env) -> None:
    client, engine = fhir_env
    response = post(client, example("case-e-bundle-respiratory-panel.json"))

    assert response["resources_received"] == 8
    assert counts(response) == (3, 3, 0, 0)
    assert response["errors"] == [] and response["warnings"] == []
    rows = fhir_rows(engine)
    assert [(r.loinc_code, r.result_value) for r in rows] == [
        ("92142-9", "Negative"), ("94500-6", "Positive"), ("85479-4", "Negative"),
    ]
    with Session(engine) as session:
        facility_codes = {session.merge(r).facility.facility_code for r in rows}
    # Facility came from the DiagnosticReport's performer (the Observations name none).
    assert facility_codes == {"HOSP-C"}
    assert {r.source_report_id for r in rows} == {"C-PANEL-20260116-0001"}
    assert {r.specimen_type for r in rows} == {"Nasopharyngeal swab"}
    assert {r.geographic_unit for r in rows} == {"01545"}
    # One synthetic patient → one pseudonym, shared by that patient's results.
    assert len({r.patient_reference for r in rows}) == 1


def test_bundle_is_best_effort_per_observation(fhir_env) -> None:
    client, engine = fhir_env
    bundle = example("case-e-bundle-respiratory-panel.json")
    bundle["entry"][6]["resource"]["code"]["coding"][0]["code"] = "94500-5"  # bad check digit
    bundle["entry"][7]["resource"]["status"] = "preliminary"
    bundle["entry"].append({"resource": example("case-j-vital-signs-not-laboratory.json")})

    response = post(client, bundle)

    assert counts(response) == (1, 1, 0, 3)
    assert sorted(e["code"] for e in response["errors"]) == [
        "INVALID_LOINC", "NON_FINAL_STATUS", "NON_LAB_OBSERVATION",
    ]
    assert [r.loinc_code for r in fhir_rows(engine)] == ["92142-9"]


def test_bundle_resubmission_creates_nothing(fhir_env) -> None:
    client, engine = fhir_env
    post(client, example("case-e-bundle-respiratory-panel.json"))
    again = post(client, example("case-e-bundle-respiratory-panel.json"))
    assert counts(again) == (3, 0, 3, 0)
    assert len(fhir_rows(engine)) == 3


def test_report_result_missing_from_bundle_is_a_warning(fhir_env) -> None:
    client, _ = fhir_env
    bundle = example("case-e-bundle-respiratory-panel.json")
    bundle["entry"] = bundle["entry"][:7]  # drop the RSV Observation the report lists
    response = post(client, bundle)
    assert counts(response)[1] == 2
    assert [w["code"] for w in response["warnings"]] == ["UNRESOLVED_REFERENCE"]


def test_location_postal_code_mismatch_is_a_warning(fhir_env) -> None:
    client, engine = fhir_env
    bundle = example("case-e-bundle-respiratory-panel.json")
    bundle["entry"][1]["resource"]["address"]["postalCode"] = "01999"
    response = post(client, bundle)
    assert "GEOGRAPHY_MISMATCH" in [w["code"] for w in response["warnings"]]
    assert {r.geographic_unit for r in fhir_rows(engine)} == {"01545"}


# --- demonstration safety ------------------------------------------------------


def _demo_snapshot(client: TestClient) -> str:
    return json.dumps(
        [
            client.get("/api/signals").json(),
            client.get("/api/demo/days").json(),
            [client.get("/api/observations", params={"through_day": d, "limit": 1}).json()["total"] for d in range(1, 6)],
            [client.get("/api/observations", params={"day": d, "limit": 1}).json()["total"] for d in range(1, 6)],
        ],
        sort_keys=True,
    )


def test_ingestion_never_changes_the_five_day_demonstration(fhir_env) -> None:
    client, engine = fhir_env
    before = _demo_snapshot(client)

    for name in sorted(p.name for p in EXAMPLES.glob("*.json")):
        post(client, example(name))

    assert _demo_snapshot(client) == before
    with Session(engine) as session:
        seeded = session.scalar(
            select(func.count()).select_from(LabObservation).where(~LabObservation.source_system.like("fhir:%"))
        )
    assert seeded == SEED_OBSERVATIONS


@pytest.mark.parametrize("effective", ["2025-11-03T00:00:00-05:00", "2025-11-05T12:00:00-05:00", "2025-11-08T04:59:59Z"])
def test_effective_times_in_the_demo_period_are_reserved(fhir_env, effective: str) -> None:
    client, engine = fhir_env
    resource = example("case-a-influenza-a-positive.json")
    resource["effectiveDateTime"] = effective
    response = post(client, resource)
    assert [e["code"] for e in response["errors"]] == ["DEMO_PERIOD_RESERVED"]
    assert fhir_rows(engine) == []


def test_times_just_outside_the_demo_period_are_accepted(fhir_env) -> None:
    client, _ = fhir_env
    for effective, ident in (("2025-11-02T23:59:59-05:00", "edge-before"), ("2025-11-08T00:00:00-05:00", "edge-after")):
        resource = example("case-a-influenza-a-positive.json")
        resource["effectiveDateTime"] = effective
        resource["identifier"][0]["value"] = ident
        assert counts(post(client, resource))[1] == 1


def test_ingested_data_before_day_1_stays_out_of_cumulative_demo_counts(fhir_env) -> None:
    client, _ = fhir_env
    before = client.get("/api/observations", params={"through_day": 5, "limit": 1}).json()["total"]
    resource = example("case-a-influenza-a-positive.json")
    resource["effectiveDateTime"] = "2025-10-01T09:00:00-04:00"
    assert counts(post(client, resource))[1] == 1
    assert client.get("/api/observations", params={"through_day": 5, "limit": 1}).json()["total"] == before


# --- request handling --------------------------------------------------------------


def test_malformed_json_is_a_structured_400(fhir_env) -> None:
    client, _ = fhir_env
    response = post(client, (EXAMPLES / "case-k-malformed-json.txt").read_bytes(), status=400)
    assert [e["code"] for e in response["errors"]] == ["INVALID_FHIR"]
    assert counts(response) == (0, 0, 0, 0)


def test_unsupported_top_level_resource_is_a_400(fhir_env) -> None:
    client, _ = fhir_env
    response = post(client, {"resourceType": "Patient", "id": "p"}, status=400)
    assert [e["code"] for e in response["errors"]] == ["UNSUPPORTED_RESOURCE"]


def test_plain_json_content_type_is_accepted(fhir_env) -> None:
    client, _ = fhir_env
    assert counts(post(client, example("case-b-sars-cov-2-negative.json"), "application/json; charset=utf-8"))[1] == 1


def test_other_content_types_are_415(fhir_env) -> None:
    client, _ = fhir_env
    post(client, json.dumps(example("case-b-sars-cov-2-negative.json")), "text/plain", status=415)


def test_oversized_bodies_are_413(fhir_env, monkeypatch: pytest.MonkeyPatch) -> None:
    client, _ = fhir_env
    monkeypatch.setattr("app.api.fhir.get_settings", lambda: _settings_with(fhir_max_request_bytes=1000))
    post(client, example("case-e-bundle-respiratory-panel.json"), status=413)


def _settings_with(**overrides):
    from app.config import Settings

    return Settings(**overrides)


@pytest.mark.parametrize("env", ["test", "production"])
def test_endpoint_does_not_exist_outside_development(fhir_env, monkeypatch: pytest.MonkeyPatch, env: str) -> None:
    client, engine = fhir_env
    monkeypatch.setattr("app.api.fhir.get_settings", lambda: _settings_with(app_env=env))
    response = client.post(
        "/api/fhir/ingest", content=json.dumps(example("case-a-influenza-a-positive.json")), headers=FHIR_JSON
    )
    assert response.status_code == 404
    assert fhir_rows(engine) == []


def test_no_generic_write_endpoints_exist(fhir_env) -> None:
    client, _ = fhir_env
    assert client.post("/api/observations", json={}).status_code == 405
    assert client.post("/api/facilities", json={}).status_code == 405
    assert client.get("/api/fhir/ingest").status_code == 405


# --- privacy and logging ----------------------------------------------------------


def test_no_patient_identifiers_are_stored_or_logged(fhir_env, caplog: pytest.LogCaptureFixture) -> None:
    client, engine = fhir_env
    caplog.set_level(logging.INFO, logger="app.fhir.ingestion")
    bundle = example("case-e-bundle-respiratory-panel.json")
    bundle["entry"][2]["resource"].update(
        {"birthDate": "1970-01-01", "telecom": [{"system": "phone", "value": "555-0100"}],
         "identifier": [{"system": "urn:mrn", "value": "MRN-SYNTH-777"}]}
    )

    post(client, bundle)

    with engine.connect() as connection:
        dump = json.dumps(
            [list(r) for r in connection.execute(
                text("SELECT * FROM lab_observation WHERE source_system LIKE 'fhir:%'")
            )],
            default=str,
        )
    for secret in ("Synthetic", "1970-01-01", "555-0100", "MRN-SYNTH-777", "syn-patient-0100", "urn:uuid"):
        assert secret not in dump
        assert secret not in caplog.text
    assert "created" in caplog.text and "facility HOSP-C" in caplog.text


def test_successful_ingestion_does_not_touch_signals_or_audit(fhir_env) -> None:
    client, engine = fhir_env
    with Session(engine) as session:
        signals = session.scalar(select(func.count()).select_from(SurveillanceSignal))
        audits = session.scalar(select(func.count()).select_from(AuditEvent))
    post(client, copy.deepcopy(example("case-e-bundle-respiratory-panel.json")))
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(SurveillanceSignal)) == signals
        assert session.scalar(select(func.count()).select_from(AuditEvent)) == audits
