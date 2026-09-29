# Synthetic FHIR R4 fixtures

All resources here are **synthetic**. The patients, identifiers, facilities
and results are invented for the LabSentinel capstone. The facilities map to
the three fictional LabSentinel facilities. Every effective time is in
January 2026, outside the frozen Day 1–Day 5 demonstration (Nov 3–7, 2025).

The tests (`tests/test_fhir_rules.py`, `tests/test_fhir_ingestion.py`) and the
manual demo in `backend/README.md` use these files.

| File | Case | Expected outcome |
|---|---|---|
| `case-a-influenza-a-positive.json` | A: Influenza A RNA (92142-9), SNOMED *Detected*. Facility via logical identifier; contained Specimen | created: Positive, HOSP-A, 01604 |
| `case-b-sars-cov-2-negative.json` | B: SARS-CoV-2 RNA (94500-6), *Negative*. Facility via `Organization/org-central-mass-regional`; UTC (`Z`) time | created: Negative, HOSP-B |
| `case-c-rsv-positive-no-category.json` | C: RSV RNA (85479-4), *Positive*, **no category**. Accepted because its LOINC is a mapped laboratory test | created: Positive, HOSP-C |
| `case-d-quantity-hemoglobin.json` | D: Hemoglobin (718-7), `valueQuantity` 13.2 g/dL (UCUM) | created, **unmapped** (no syndrome), numeric value and unit kept |
| `case-e-bundle-respiratory-panel.json` | E: collection Bundle with Organization, Location, Patient, Specimen, DiagnosticReport and 3 Observations. Facility via the report's performer | 3 created with report id and specimen type; Patient ignored |
| `case-f-duplicate-of-case-a.json` | F: same identifier as A, different resource id | duplicate (after A) |
| `case-g-invalid-loinc.json` | G: LOINC `92142-8` (wrong check digit) | rejected: `INVALID_LOINC` |
| `case-h-unmapped-loinc.json` | H: HBsAg (5195-3), a valid LOINC with no LabSentinel mapping | created, **unmapped**, warning `UNMAPPED_LOINC` |
| `case-i-unresolvable-facility.json` | I: performer `HOSP-Z` | rejected: `UNRESOLVED_FACILITY` |
| `case-j-vital-signs-not-laboratory.json` | J: heart rate (8867-4), category `vital-signs` | rejected: `NON_LAB_OBSERVATION` |
| `case-k-malformed-json.txt` | K: truncated JSON | HTTP 400, `INVALID_FHIR` |
