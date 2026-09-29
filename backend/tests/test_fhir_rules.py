"""FHIR pipeline rules that need no database: parsing, validation, terminology, results."""

import copy
import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from fhir.resources.R4B.observation import Observation

from app.fhir import normalizer, terminology, validator
from app.fhir.exceptions import IngestionError, IssueCode, RequestRejected
from app.fhir.parser import parse_json, parse_submission
from app.seed import DATASET_PATH

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "fhir"
NOW = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)


def example(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def flu(**changes) -> dict:
    resource = copy.deepcopy(example("case-a-influenza-a-positive.json"))
    resource.update(changes)
    return resource


def model(resource: dict) -> Observation:
    return Observation.model_validate(resource)


def rejected_code(call) -> IssueCode:
    with pytest.raises(IngestionError) as caught:
        call()
    return caught.value.issue.code


# --- terminology ---------------------------------------------------------------


def test_mappings_match_the_prototype_test_catalogue() -> None:
    raw = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    expected = {(t["loincCode"], t["name"]) for t in raw["labTests"]}
    mapped = {(m.loinc_code, m.test_name) for m in terminology.LAB_TEST_MAPPINGS.values()}
    assert mapped == expected
    assert {m.syndrome for m in terminology.LAB_TEST_MAPPINGS.values()} == {raw["syndrome"]}


@pytest.mark.parametrize("code", ["92142-9", "94500-6", "85479-4", "718-7", "5195-3", "8867-4", "2951-2"])
def test_real_loinc_codes_pass_the_check_digit(code: str) -> None:
    assert terminology.is_valid_loinc(code)


@pytest.mark.parametrize("code", ["92142-8", "94500-5", "ABC-1", "92142", "92142-99", "", "12345678-9"])
def test_malformed_loinc_codes_fail(code: str) -> None:
    assert not terminology.is_valid_loinc(code)


# --- parsing -------------------------------------------------------------------


def test_malformed_json_is_rejected() -> None:
    with pytest.raises(RequestRejected) as caught:
        parse_json((EXAMPLES / "case-k-malformed-json.txt").read_bytes())
    assert caught.value.issue.code == IssueCode.INVALID_FHIR


@pytest.mark.parametrize("body", [b"[]", b'"x"', b"\xff\xfe"])
def test_non_object_bodies_are_rejected(body: bytes) -> None:
    with pytest.raises(RequestRejected):
        parse_json(body)


@pytest.mark.parametrize(
    "document",
    [{"resourceType": "Patient", "id": "p"}, {"resourceType": "Bundle", "type": "searchset"}, {"id": "x"}],
)
def test_unsupported_top_level_documents_are_rejected(document: dict) -> None:
    with pytest.raises(RequestRejected) as caught:
        parse_submission(document)
    assert caught.value.issue.code in {IssueCode.UNSUPPORTED_RESOURCE, IssueCode.INVALID_FHIR}


def test_bundle_entries_are_validated_one_by_one() -> None:
    bundle = example("case-e-bundle-respiratory-panel.json")
    bundle["entry"][5]["resource"]["status"] = None  # break one Observation
    bundle["entry"][5]["resource"]["valueString"] = "x"  # two value[x]: invalid
    bundle["entry"].append({"resource": {"resourceType": "MedicationRequest", "id": "m"}})

    submission = parse_submission(bundle)

    labels = {r.label: r.model is not None for r in submission.resources}
    assert labels["Observation/lab-e-flu"] is False
    assert labels["Observation/lab-e-sars"] is True
    codes = [(i.code, i.severity) for i in submission.issues]
    assert (IssueCode.INVALID_FHIR, "error") in codes
    assert (IssueCode.UNSUPPORTED_RESOURCE, "warning") in codes


def test_validation_errors_never_echo_input_values() -> None:
    resource = flu(effectiveDateTime="2026-01-12T09:30:00", subject={"reference": "Patient/Jane-Doe-MRN-12345"})
    resource["extraneous"] = "Jane Doe, 123 Main St"
    submission = parse_submission(resource)
    message = submission.issues[0].message
    assert "Jane" not in message and "Main St" not in message and "12345" not in message
    assert "effectiveDateTime" in message


def test_patient_ids_are_never_used_as_labels() -> None:
    bundle = example("case-e-bundle-respiratory-panel.json")
    labels = [r.label for r in parse_submission(bundle).resources]
    assert "entry[2] Patient" in labels
    assert not any("syn-patient" in label for label in labels)


# --- validation ----------------------------------------------------------------


@pytest.mark.parametrize("status", ["final", "amended", "corrected"])
def test_finalized_statuses_are_accepted(status: str) -> None:
    validator.check_status(model(flu(status=status)), "x")


@pytest.mark.parametrize("status", ["registered", "preliminary", "cancelled", "entered-in-error", "unknown"])
def test_non_final_statuses_are_rejected(status: str) -> None:
    assert rejected_code(lambda: validator.check_status(model(flu(status=status)), "x")) == IssueCode.NON_FINAL_STATUS


def test_unknown_status_is_invalid_fhir() -> None:
    # The model library accepts any string here; LabSentinel does not.
    assert rejected_code(lambda: validator.check_status(model(flu(status="done")), "x")) == IssueCode.INVALID_FHIR


def test_laboratory_category_is_accepted() -> None:
    validator.check_laboratory(model(flu()), "x")


def test_vital_signs_are_not_laboratory() -> None:
    vitals = model(example("case-j-vital-signs-not-laboratory.json"))
    assert rejected_code(lambda: validator.check_laboratory(vitals, "x")) == IssueCode.NON_LAB_OBSERVATION


def test_missing_category_falls_back_to_a_mapped_laboratory_loinc() -> None:
    validator.check_laboratory(model(example("case-c-rsv-positive-no-category.json")), "x")


def test_missing_category_with_an_unmapped_code_is_not_assumed_laboratory() -> None:
    resource = example("case-h-unmapped-loinc.json")
    resource.pop("category")
    assert rejected_code(lambda: validator.check_laboratory(model(resource), "x")) == IssueCode.NON_LAB_OBSERVATION


def test_loinc_is_found_by_system_only() -> None:
    resource = flu()
    resource["code"]["coding"][0]["system"] = "http://example.org/local-codes"
    assert rejected_code(lambda: validator.check_loinc(model(resource), "x")) == IssueCode.INVALID_LOINC


def test_conflicting_loinc_codes_are_rejected() -> None:
    resource = flu()
    resource["code"]["coding"].append({"system": terminology.LOINC_SYSTEM, "code": "94500-6"})
    assert rejected_code(lambda: validator.check_loinc(model(resource), "x")) == IssueCode.INVALID_LOINC


def test_invalid_loinc_fixture_is_rejected() -> None:
    bad = model(example("case-g-invalid-loinc.json"))
    assert rejected_code(lambda: validator.check_loinc(bad, "x")) == IssueCode.INVALID_LOINC


def test_mapped_and_unmapped_loinc() -> None:
    assert validator.check_loinc(model(flu()), "x").mapping.syndrome == "Respiratory Viral Syndrome"
    assert validator.check_loinc(model(example("case-h-unmapped-loinc.json")), "x").mapping is None


# --- time ----------------------------------------------------------------------


def test_offset_times_are_kept_and_converted_to_utc() -> None:
    effective = validator.effective_time(model(flu()), "x", NOW)
    assert effective.utcoffset().total_seconds() == -5 * 3600
    assert normalizer.to_utc(effective) == datetime(2026, 1, 12, 14, 30, tzinfo=UTC)


def test_zulu_times_are_accepted() -> None:
    effective = validator.effective_time(model(example("case-b-sars-cov-2-negative.json")), "x", NOW)
    assert normalizer.to_utc(effective) == datetime(2026, 1, 13, 19, 5, tzinfo=UTC)


def test_period_start_and_instant_are_supported() -> None:
    period = flu()
    period.pop("effectiveDateTime")
    period["effectivePeriod"] = {"start": "2026-01-12T09:30:00-05:00"}
    instant = flu()
    instant.pop("effectiveDateTime")
    instant["effectiveInstant"] = "2026-01-12T14:30:00Z"
    for resource in (period, instant):
        assert normalizer.to_utc(validator.effective_time(model(resource), "x", NOW)).hour == 14


@pytest.mark.parametrize("value", ["2026-01-12", "2026-01", "2026"])
def test_date_only_or_partial_times_are_rejected_not_guessed(value: str) -> None:
    code = rejected_code(lambda: validator.effective_time(model(flu(effectiveDateTime=value)), "x", NOW))
    assert code == IssueCode.INVALID_EFFECTIVE_TIME


def test_time_without_offset_is_invalid_fhir() -> None:
    submission = parse_submission(flu(effectiveDateTime="2026-01-12T09:30:00"))
    assert submission.issues[0].code == IssueCode.INVALID_FHIR
    assert submission.resources[0].model is None


def test_missing_and_future_effective_times_are_rejected() -> None:
    missing = flu()
    missing.pop("effectiveDateTime")
    assert rejected_code(lambda: validator.effective_time(model(missing), "x", NOW)) == IssueCode.MISSING_EFFECTIVE_TIME
    future = flu(effectiveDateTime="2027-01-01T00:00:00Z")
    assert rejected_code(lambda: validator.effective_time(model(future), "x", NOW)) == IssueCode.INVALID_EFFECTIVE_TIME


# --- results -------------------------------------------------------------------


def _result(resource: dict):
    obs = model(resource)
    return normalizer.normalize_result(obs, validator.check_loinc(obs, "x"), "x")


@pytest.mark.parametrize(
    ("code", "expected"),
    [("10828004", "Positive"), ("260373001", "Positive"), ("260385009", "Negative"), ("260415000", "Negative")],
)
def test_snomed_qualitative_results_normalize(code: str, expected: str) -> None:
    resource = flu(valueCodeableConcept={"coding": [{"system": terminology.SNOMED_SYSTEM, "code": code}]})
    result = _result(resource)
    assert (result.result_type, result.result_value, result.result_code) == ("coded", expected, code)


def test_result_words_normalize_without_codes() -> None:
    coded = flu(valueCodeableConcept={"text": " NOT  detected "})
    assert _result(coded).result_value == "Negative"
    text = flu()
    text.pop("valueCodeableConcept")
    text["valueString"] = "Positive"
    assert (_result(text).result_type, _result(text).result_value) == ("string", "Positive")


@pytest.mark.parametrize(
    "value",
    [
        {"valueCodeableConcept": {"text": "Indeterminate"}},
        {"valueString": "see comment"},
        {"valueQuantity": {"value": 31.5, "unit": "cycles"}},
        {"valueBoolean": True},
        {"valueInteger": 3},
        {},
    ],
)
def test_qualitative_tests_reject_uninterpretable_results(value: dict) -> None:
    resource = flu()
    resource.pop("valueCodeableConcept")
    resource.update(value)
    assert rejected_code(lambda: _result(resource)) == IssueCode.INVALID_RESULT


def test_quantity_keeps_value_unit_system_and_code() -> None:
    result = _result(example("case-d-quantity-hemoglobin.json"))
    assert result.result_type == "quantity"
    assert result.result_numeric == Decimal("13.2")
    assert (result.result_unit, result.result_unit_system, result.result_unit_code) == (
        "g/dL", terminology.UCUM_SYSTEM, "g/dL",
    )


def test_quantity_comparator_is_kept_in_the_display_value() -> None:
    resource = example("case-d-quantity-hemoglobin.json")
    resource["valueQuantity"]["comparator"] = "<"
    assert _result(resource).result_value == "<13.2"


def test_quantity_without_a_value_is_invalid() -> None:
    resource = example("case-d-quantity-hemoglobin.json")
    resource["valueQuantity"].pop("value")
    assert rejected_code(lambda: _result(resource)) == IssueCode.INVALID_RESULT


# --- identity and privacy --------------------------------------------------------


def test_source_identity_prefers_the_identifier() -> None:
    assert normalizer.source_identity(model(flu()), "HOSP-A", "x") == (
        "fhir:urn:labsentinel:synthetic:hosp-a:lab-result", "A-FLU-20260112-0001",
    )


def test_source_identity_falls_back_to_the_facility_scoped_resource_id() -> None:
    resource = flu()
    resource.pop("identifier")
    assert normalizer.source_identity(model(resource), "HOSP-A", "x") == (
        "fhir:resource-id:HOSP-A", "Observation/lab-a-flu-0001",
    )


def test_observation_without_identifier_or_id_cannot_be_idempotent() -> None:
    resource = flu()
    resource.pop("identifier")
    resource.pop("id")
    assert rejected_code(lambda: normalizer.source_identity(model(resource), "HOSP-A", "x")) == IssueCode.MISSING_IDENTIFIER


def test_long_identifier_systems_are_hashed_to_fit() -> None:
    resource = flu()
    resource["identifier"][0]["system"] = "urn:" + "x" * 200
    system, _ = normalizer.source_identity(model(resource), "HOSP-A", "x")
    assert system.startswith("fhir:sha256:") and len(system) <= 100


def test_subject_becomes_a_salted_pseudonym() -> None:
    obs = model(flu())
    pseudonym = normalizer.pseudonymize_subject(obs, "fhir:s", "salt-1")
    assert pseudonym.startswith("FHIR-PT-") and len(pseudonym) <= 64
    assert "syn-patient" not in pseudonym
    assert pseudonym == normalizer.pseudonymize_subject(obs, "fhir:s", "salt-1")
    assert pseudonym != normalizer.pseudonymize_subject(obs, "fhir:s", "salt-2")


def test_subject_display_is_never_used() -> None:
    resource = flu(subject={"display": "Jane Doe"})
    assert normalizer.pseudonymize_subject(model(resource), "fhir:s", "salt") == normalizer.NO_SUBJECT
