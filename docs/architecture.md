# Architecture

Signal by ProbeSyQ takes laboratory results from several sources, turns
them into one normalized observation format, routes each result to every
surveillance profile it belongs to, and calculates an explainable
early-warning signal per profile. The design is laboratory-first and
vendor-agnostic: each source's format is handled by an adapter, and nothing
after the adapter knows which vendor a result came from.

## The pipeline

```
 External EHR / LIS source
   FHIR R4 Observation · HL7 v2 ORU^R01 · LIS / REST JSON
        │
        ▼
 Source adapter              parse; validate facility, LOINC (incl. check digit),
                             result and collection time; reject or flag
        │
        ▼
 Normalized observation      facility · LOINC test · Positive / Negative ·
                             collection date · pseudonymous patient key
        │
        ▼
 Profile routing             shared registry (backend/app/profiles/registry.json):
                             one test → every applicable profile, once each
        │
        ▼
 Surveillance engine         per profile × facility × day: rolling 7-day baseline,
                             affected facilities and areas, persistence, five
                             weighted components → Composite Outbreak Signal Score
                             and severity. Data Confidence calculated separately.
        │
        ▼
 Dashboard                   Active Surveillance, selected profile, map, facilities,
                             laboratory data, analytics, signals, investigations,
                             reports — small counts withheld (<5)
        │
        ▼
 Roella                      answers from the same state and privacy rules;
                             no external AI, no network request
```

## Two runtimes for the same rules

| Stage | Public portfolio (GitHub Pages) | Full stack (local) |
|---|---|---|
| Sources | Browser simulator: FHIR R4 (Worcester Central), HL7 v2 (Central Massachusetts Regional), LIS/API (Shrewsbury Community) — `src/lib/live/sources.ts` | Synthetic FHIR R4 posted to `POST /api/fhir/ingest`; SMART sandbox for the clinician sidecar |
| Adapter, normalization | `src/lib/live/sources.ts` (per format) | `backend/app/fhir/` (parser, validator, normalizer) |
| Storage | In memory; nothing persisted | PostgreSQL 16 (Alembic migrations 0001–0009) |
| Profile routing | `src/lib/profiles/registry.ts` (reads the shared registry) | `backend/app/profiles/` + `lab_test_profile_membership` |
| Engine | `src/lib/live/engine.ts`, scoring with `src/lib/signalScore.ts` | `backend/app/surveillance/` (composite) and `backend/app/statistics/` (EWMA, CUSUM) |
| Presentation | React | React, reading `/api/*` (`VITE_DATA_SOURCE=api`) |

**Parity.** `scripts/export-live-parity.ts` records every result the browser
sources send and the browser's signal for every closed day and live profile.
`backend/tests/test_live_parity.py` ingests the same results through the real
FHIR pipeline, runs the backend engine per profile, and checks every
component, score and severity for all 17 days. The two runtimes are therefore
one design, tested against each other — not two approximations.

## Modes in the portfolio

- **Scenario Replay** — the frozen five-day Respiratory Viral Syndrome
  scenario (0 / 24 / 50 / 74 / 87), stepped by day. Unchanged since the
  original prototype; used for repeatable demonstrations.
- **Live Surveillance** — seven days of synthetic history establish the
  baseline, then ten live days stream through the three simulated sources.
  Deterministic: the same results arrive in the same order every run. A
  refresh starts it again. [live-surveillance.md](live-surveillance.md)

The mode is kept for the browser session (`labsentinel.surveillanceMode.v1`).

## Surveillance profiles

Six profiles share one registry: Respiratory Viral Syndrome, Influenza A,
COVID-19, RSV, Cholera and Gastrointestinal Syndrome. A test can belong to
several profiles (an influenza A PCR counts towards Influenza A and
Respiratory Viral Syndrome). Statuses: Active signal, Within expected range,
Insufficient baseline, No data, Inactive. Ranking: severity, then score, then
name; profiles without a score come last.
[surveillance-profiles.md](surveillance-profiles.md)

## Detection methods

| Method | Where | Needs |
|---|---|---|
| Composite Outbreak Signal Score | Every profile; browser and backend | 7-day rolling baseline |
| EWMA (λ 0.25, k 3) | Backend, per profile (`?profile=`) | 28-day reference period |
| CUSUM (k 0.5, h 5) | Backend, per profile (`?profile=`) | 28-day reference period |

The three are shown side by side and never combined. Live Surveillance holds
seven days of history, so it shows "Insufficient reference history" for EWMA
and CUSUM instead of inventing a result.

## Privacy controls

- Patient references are replaced with an HMAC-SHA256 pseudonym (salted, per
  source system) before storage; the raw reference is never stored.
- Aggregates: positive counts below 5, and rates that would reveal them, are
  withheld at area, facility and county level — on screens, in reports and in
  Roella's answers. Facility-level views roll up to county when needed.
- Laboratory Data is a record-level view of *synthetic* observations and is
  labelled as such; in a real deployment it would need role-based access.

## Clinician feedback (full stack)

A SMART App Launch 2.2 public client (PKCE, read-only
`patient/Observation.rs`) launches from the public SMART Health IT sandbox
into a sidecar that shows regional context for the synthetic patient. The
SMART routes (`/smart/launch`, `/smart/callback`, `/smart/sidecar`) sit
outside the sign-in screen.

## Production gaps

Real authentication and RBAC, per-source credentials and transport security,
audit logging, encryption and governance, and epidemiological validation —
see [security.md](security.md).
