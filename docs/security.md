# Security and privacy posture

Signal by ProbeSyQ is a portfolio prototype that runs on **synthetic data
only**. It is not a production system, it has not been independently tested
for security, and it is **not HIPAA compliant** — nor does it claim to be.
This page states plainly what protections exist and what a real deployment
would still need.

## What exists

| Control | Where | Notes |
|---|---|---|
| Synthetic data only | Everywhere | No real patient, hospital, laboratory or EHR vendor data in any mode, test or fixture |
| Pseudonymization | `backend/app/fhir/normalizer.py` | Patient references replaced by an HMAC-SHA256 pseudonym keyed by a salt and the source system; the raw reference is never stored. A presentation deployment with ingestion enabled refuses to start with the development salt |
| Ingestion validation | `backend/app/fhir/` | Resource type, LOINC, result coding, facility and dates validated; invalid resources reported and not stored; request body size limited (413) |
| Duplicate protection | FHIR ingestion | A resubmitted observation is reported as a duplicate, not stored twice |
| CORS | `backend/app/main.py`, `config.py` | Explicit origin list; wildcard rejected at startup; GET only unless development endpoints are enabled |
| Development-only endpoints | `APP_ENV`, `DEMO_ENDPOINTS_ENABLED` | Ingestion, recalculation, evaluation and readiness return 404 outside development (or an explicitly flagged presentation); the flag is rejected in production |
| SMART scopes | `src/smart/config.ts` | Read/search scopes only (e.g. `patient/Observation.rs`), public client with PKCE, no client secret or token in the build |
| Small-count suppression | Frontend and Roella | Positive counts <5, and rates that would reveal them, withheld at area, facility and county level |
| No secrets in the static build | GitHub Pages | The portfolio build has no API key, backend URL or credential; it makes no data requests |
| Assistant isolation | `src/assistant/` | Roella is rule-based: no external AI service, no network request, no access to the sign-in form or session |

## What is deliberately *not* security

- **The sign-in screen** is presentation only. It keeps `{ signedIn, name,
  role }` in `sessionStorage` for the tab, never stores the password, and does
  not authenticate anyone. It must not be described as secure authentication.
- **Development endpoints** (FHIR ingestion, recalculation) have no
  authentication and no rate limiting.
- **Laboratory Data** shows synthetic records individually; with real data
  this view would need role-based access.

## Known inference risks

The small-count rule hides a single small number. It does not yet stop
someone from *working out* a hidden number from the ones that are shown:

- **Complementary disclosure.** When one area or facility is withheld
  ("<5") but the county total and the other areas are shown, the hidden
  value can be obtained by subtraction. Production needs complementary
  (secondary) suppression or a roll-up of the whole level.
- **Differencing over time.** Live Surveillance recalculates with every
  observation; comparing successive provisional figures can reveal a single
  result. Production would publish only closed periods, or add a delay.
- **Rates and changes.** Roella's facility explanations in Live Surveillance
  quote volume and positivity changes against a baseline; combined with the
  baseline these can be turned back into counts.
- **Record-level view.** Laboratory Data lists individual synthetic results
  and is labelled as such; with real data it would need role-based access.

None of these exposes anything real here — every value is synthetic — but they
would have to be closed before real data was used.

## What production would require

- Real identity and authentication (e.g. OIDC with MFA) and role-based
  access control, including record-level access for laboratory data.
- Per-source credentials and transport security for every feed: mutual TLS
  or signed API keys, key rotation, and network allow-listing.
- Rate limiting and request quotas on every write endpoint.
- Tamper-evident audit logging of access and changes, with retention rules.
- Encryption in transit and at rest, managed keys, backups and a governance
  process for data access, sharing and retention.
- A HIPAA and state public-health law review, Business Associate Agreements
  with every data source and host, and data-use agreements.
- Independent security testing (penetration test, dependency and container
  scanning) and a vulnerability-management process.
- Epidemiological validation of every method and threshold before any
  public-health use.

## Reporting a problem

This repository is a portfolio project. Please open a GitHub issue for
anything that looks wrong; do not include real patient data.
