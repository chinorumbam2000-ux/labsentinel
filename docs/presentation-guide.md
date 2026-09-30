# LabSentinel — final capstone presentation guide

A reproducible, ten-step demonstration through the real application (about
12–15 minutes). Synthetic data only.

## Before the presentation (10 minutes)

Windows PowerShell; from the repository root unless noted.

```powershell
docker compose up -d db                                   # PostgreSQL (loopback only)
cd backend
.\.venv\Scripts\python -m app.demo.prepare               # must end with READY
.\.venv\Scripts\python -m app.seed.smart_sandbox          # optional: SMART sidecar ingestion bridge
.\.venv\Scripts\uvicorn app.main:app --port 8000
```

In a second terminal (repository root):

```powershell
$env:VITE_DATA_SOURCE="api"; $env:VITE_SMART_ENABLED="true"; npm run dev
```

Then:

1. Open `http://localhost:5173/labsentinel/overview` in a fresh browser window
   (fresh session = clean investigation and reporting state).
2. Check **Presentation readiness** at the bottom of the overview: backend
   checklist READY, backend connection PASS, SMART configuration enabled.
3. Click **Start presentation mode** (or add `?presentation=true` to any URL).
   The step bar appears at the bottom; developer details are hidden.
4. Check internet access to `launch.smarthealthit.org` (step 8).

`prepare` removes anything left over from a rehearsal (for example the
Influenza A Observation ingested in step 4), restores the synthetic dynamic
dataset and recalculates Composite, EWMA and CUSUM. It never touches the
frozen Day 1–5 demonstration or the evaluation results. Run it again between
rehearsals.

## The ten steps

Use **Next ›** in the step bar; **Show step** returns to the step's page.

| # | Step | Where | Do | Expected |
|---|---|---|---|---|
| 1 | Problem / overview | `/overview` | Walk through the workflow and the mode cards. | Seven-stage workflow, six destinations, key disclaimers. |
| 2 | Frozen classroom demo | `/dashboard` | Press **›** in the top bar four times. | Top bar shows **Classroom Demo**. Composite score 0 → 24 → 50 → 74 → 87 (Day 5 Critical). |
| 3 | Vendor-agnostic sidecar | `/hospitals` | Switch between the three environments. | The same sidecar inside simulated Epic, Oracle Health and MEDITECH shells; "no live vendor connection". |
| 4 | FHIR ingestion | `/fhir-ingestion` | Example **Influenza A positive Observation** → **Load Example** → **Ingest Synthetic FHIR**. | Received 1, validated 1, **Created 1**, duplicates 0, rejected 0; pipeline all SUCCESS. |
| 5 | Normalization | same page, result panel | Read the source FHIR vs the normalized record. | LOINC 92142-9 Influenza A RNA → Respiratory Viral Syndrome; SNOMED CT result → **Positive**; Worcester Central Medical Center (HOSP-A); effective Jan 12, 2026, 9:30 AM ET vs received now; pseudonymised patient. |
| 6 | Dynamic surveillance | `/dynamic-surveillance` | **Recalculate Dynamic Surveillance**. | Latest date 2026-01-20: **90, Critical**, with Why this signal, Data Confidence and provenance. |
| 7 | Statistical comparison | same page, Three-Method Comparison | Pick **Jan 17**. | Composite High, EWMA Alert, CUSUM Alert: **3 OF 3 METHODS SIGNAL** — an agreement count, never one score. |
| 8 | SMART on FHIR | `/smart-demo` | Standalone launch → pick a sandbox patient → sidecar. | Live SMART Health IT sandbox, PKCE, read-only `patient/Observation.rs`; the sidecar shows LabSentinel context. No token is displayed. |
| 9 | Evaluation | `/evaluation` | Read **Evaluation summary: tradeoffs**, then pick S03 and S05. | Composite 710/900 detected, lowest false-alert burden 0.82/100 days; EWMA and CUSUM 900/900, 7.63 and 10.55/100 days. No winner. |
| 10 | Architecture / future work | `/architecture` → Future work | Close on Implemented / Prototype / Planned and the evaluation findings. | Clear separation of statuses; limitations and real-world validation needs. |

**If something fails live:**

- **Backend down:** the top bar shows "API Capstone ● Unavailable".
  Continue with the Classroom Demo (identical values) or the public GitHub
  Pages site.
- **SMART sandbox unreachable:** skip step 8 and show the sidecar screenshot.
- **Rehearsal leftovers:** run `python -m app.demo.prepare` again.

## Talking points (tradeoffs, not a winner)

- The Composite score is conservative: it has the fewest false alerts, but
  misses or is slower on slow and local outbreaks, because its rolling baseline
  absorbs sustained rises.
- EWMA and CUSUM detect every synthetic outbreak and are usually earlier, at a
  much higher false-alert burden, including every volume-only surge.
- The evaluation is synthetic and demonstrates technical behavior only. Real
  validation needs real data, an external reference standard and workflow
  studies (`/architecture`, Future work).

## Recommended screenshots for the final slides

1. **Overview** — `/overview` (workflow and mode cards).
2. **Day 5 Dashboard** — `/dashboard` on Day 5 (score 87, Critical; Classroom Demo chip).
3. **FHIR ingestion pipeline** — `/fhir-ingestion` after ingesting the Influenza A example (pipeline steps).
4. **Normalized observation** — the same page's source vs normalized record panel.
5. **Dynamic Surveillance** — `/dynamic-surveillance` on 2026-01-20 (Why this signal).
6. **Three-method comparison** — Jan 17, 3 OF 3 METHODS SIGNAL.
7. **SMART sidecar** — `/smart/sidecar` after a standalone sandbox launch.
8. **Evaluation summary** — `/evaluation`, the tradeoffs card and the S13 timeline.
9. **Architecture** — `/architecture`, the Implemented / Prototype / Planned sections.

Take them in a 1440 × 900 window with Presentation Mode **off** (no step bar),
after `python -m app.demo.prepare`.

## Resetting afterwards

```powershell
cd backend
.\.venv\Scripts\python -m app.demo.reset --yes    # removes the demo ingestion, restores the clean state
```

Close the browser session to clear investigation and reporting state.
