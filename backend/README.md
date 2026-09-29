# LabSentinel API — backend foundation

> This backend is the development foundation for the LabSentinel capstone.
> SMART on FHIR authorization, production security, and live healthcare-system
> connectivity are not implemented. FHIR R4 laboratory ingestion exists as a
> **development-only** foundation for synthetic data (see
> [FHIR R4 laboratory ingestion](#fhir-r4-laboratory-ingestion-development)).

**All data is synthetic.** Nothing in this service connects to a real EHR,
laboratory system or public-health authority.

> The data persisted in Phase 2 are synthetic capstone demonstration data.
> Observations ingested through the Phase 4 development FHIR endpoint are
> synthetic too, and coexist with the seed without altering the five-day
> demonstration.

## Purpose

The LabSentinel React prototype (in `../src`) computes everything in the
browser from a synthetic dataset. This backend is the first step toward real
persistence: a FastAPI service with a PostgreSQL schema for facilities, lab
observations, surveillance signals and audit events, managed by Alembic
migrations.

Phase 2 persists the prototype's existing synthetic dataset in PostgreSQL and
serves it through read-only endpoints. Phase 3 lets the React app read from
them in **API Capstone Mode** (`VITE_DATA_SOURCE=api`, see
[Full-stack development](#full-stack-development-api-capstone-mode)). The
default **Local Demo Mode**, which the GitHub Pages site uses, still runs
entirely in the browser with no backend.

## Technology stack

| Concern | Choice |
|---|---|
| Language | Python 3.11+ (developed on 3.13) |
| Web framework | FastAPI, served by Uvicorn |
| Schemas and configuration | Pydantic v2, pydantic-settings |
| ORM | SQLAlchemy 2.x (typed `Mapped[...]` declarative models) |
| Database | PostgreSQL (16 in the development container) |
| Driver | psycopg 3 |
| Migrations | Alembic |
| Tests | pytest, FastAPI TestClient |

## Layout

```
backend/
├── app/
│   ├── main.py            FastAPI app factory, CORS, router registration
│   ├── config.py          environment-based settings
│   ├── database.py        declarative Base, engine, session factory, get_db
│   ├── api/               health, facilities, observations, signals, demo,
│   │                      fhir (development ingestion) routes
│   ├── fhir/              FHIR R4 parsing, validation, terminology, resolution,
│   │                      normalization (no HTTP, no ORM)
│   ├── core/vocabulary.py controlled vocabularies shared with the frontend
│   ├── core/simulation.py capstone simulation calendar and time zone
│   ├── models/            Facility, LabObservation, SurveillanceSignal,
│   │                      AuditEvent, DemoSimulationDay
│   ├── schemas/           Pydantic response models (never ORM objects)
│   ├── services/          query logic and FHIR ingestion used by the routes
│   └── seed/              dataset fixture, idempotent seed, parity check
├── alembic/               migration environment and versions/
├── examples/fhir/         synthetic FHIR R4 fixtures (cases A-K)
├── tests/
├── alembic.ini
├── pytest.ini
├── requirements.txt
└── .env.example
```

## Data model

```
facility 1 ──── * lab_observation

surveillance_signal 1 ──── 0..1 demo_simulation_day   (capstone demo only)
audit_event              (append-only event log)
```

- **facility**: a participating organization. `vendor` is a descriptive
  platform label only and implies no ranking or comparison of vendors.
  `facility_code` is unique. `postal_code` and `subregion` (county, district
  or equivalent) were added in revision 0002.
- **lab_observation**: one normalized laboratory result. `patient_reference`
  is a synthetic, de-identified token. There are **no** columns for names,
  addresses, dates of birth, SSNs or MRNs, and `geographic_unit` is a
  surveillance area code, never an address. `(source_system,
  source_observation_id)` is unique, so re-running a future ingest cannot
  duplicate a result. `status` follows the FHIR R4 Observation status codes.
- **surveillance_signal**: the Composite Outbreak Signal Score and the Data
  Confidence Score are stored side by side and never combined, as in the
  prototype. Severity, confidence level and review status are limited by CHECK
  constraints to the exact values the frontend uses. Data confidence may be
  NULL (unknown), and is never defaulted to a reassuring value.
  `(syndrome, signal_date)` is unique.
- **audit_event**: event type, entity and description. There is no actor
  column yet because there are no users yet. Each seed run that changes data
  records one event.
- **demo_simulation_day**: **capstone demonstration only.** The stage name
  and narrative for each of the five simulated days, pointing at that day's
  signal. It is kept in its own table so the simulation-day concept never
  enters the production-shaped `surveillance_signal` table.
- `lab_observation.received_datetime` is nullable since 0002. The prototype
  records no receipt time, so it is stored as unknown rather than invented.

## Seeded synthetic dataset

The seed loads the React prototype's **existing** synthetic dataset. The
backend computes no surveillance value of its own.

```
src/data, src/lib (React prototype: the source of truth)
   │  npx vite-node scripts/export-demo-dataset.ts
   ▼
backend/app/seed/data/labsentinel_demo_dataset.json (committed fixture)
   │  python -m app.seed
   ▼
PostgreSQL  ──►  FastAPI (read-only)
```

The exporter runs the prototype's own modules, so the fixture holds exactly
what the dashboard shows, including the Composite Outbreak Signal Scores
(from the prototype's scorer) and the Data Confidence values. What is seeded:

| Table | Rows | Content |
|---|---|---|
| `facility` | 3 | HOSP-A Worcester Central Medical Center (Epic, 01604) · HOSP-B Central Massachusetts Regional Hospital (Oracle Health, 01605) · HOSP-C Shrewsbury Community Medical Center (MEDITECH, 01545). All fictional. |
| `lab_observation` | 699 | OBS-0001 to OBS-0699: 99 positive, 600 negative. LOINC 92142-9 Influenza A RNA, 94500-6 SARS-CoV-2 RNA, 85479-4 RSV RNA. Patient references SYN-P0001 to SYN-P0699 are placeholders. `source_system` is the facility's simulated environment, for example "Simulated Epic Environment". |
| `surveillance_signal` | 5 | One per simulated day, Nov 3 to Nov 7, 2025 (below). |
| `demo_simulation_day` | 5 | The stage name and description of each day. |

| Day | Stage | Tests | Positive | Positivity | Facilities | Areas | Persistence | Score | Severity | Data Confidence |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Baseline | 100 | 8 | 8.00% | 0 | 0 | 0 | 0 | Low | 98 Very High |
| 2 | Early Local Increase | 124 | 12 | 9.68% | 1 | 1 | 1 | 24 | Watch | 97 Very High |
| 3 | Rising Positivity | 141 | 19 | 13.48% | 2 | 2 | 2 | 50 | Moderate | 94 Very High |
| 4 | Multi-Site Cluster | 158 | 26 | 16.46% | 3 | 3 | 3 | 74 | High | 97 Very High |
| 5 | Regional Early-Warning Signal | 176 | 34 | 19.32% | 3 | 3 | 4 | 87 | Critical | 97 Very High |

Positivity is stored to two decimal places. The prototype displays it to one
(8.0%, 9.7%, 13.5%, 16.5%, 19.3%), and the counts give the exact ratio.

**Time zone.** The prototype stamps observations with a zone-less local time.
Its facilities are in Worcester County, MA, so those times are read as
America/New_York (EST, UTC−05:00, on Nov 3–7, 2025), stored in UTC, and
returned as ISO-8601 with the offset, for example `2025-11-03T06:00:00-05:00`.

### Seeding

```bash
python -m app.seed
```

The seed is **idempotent**. Each row is matched on the natural key the
database enforces (`facility_code`; `source_system` plus
`source_observation_id`; `syndrome` plus `signal_date`; `day`). A matching row
is left alone, a differing row is corrected, and a missing one is inserted.
A second run reports `0 inserted, 0 updated` and changes nothing. A signal's
review `status` is never overwritten, because it belongs to analysts. The
seed refuses to run with `APP_ENV=production`.

### Keeping the backend in step with the frontend

```bash
# from the repository root: fail if the committed fixture is stale
npx vite-node scripts/export-demo-dataset.ts --check

# regenerate it after a deliberate change to the prototype's data
npx vite-node scripts/export-demo-dataset.ts

# from backend/: compare the database field for field with a fresh export
python -m app.seed.verify              # re-exports from the TypeScript source
python -m app.seed.verify --fixture    # compares with the committed fixture
```

`verify` checks the facilities and their vendors, every observation (facility,
patient reference, test, LOINC, result, local effective time, area, status),
the LOINC concepts, the positive and negative totals, and each day's values,
score, severity, Data Confidence and stage. It exits non-zero on any
difference.

## Setup

Commands are run from this `backend/` directory.

### 1. Create the Python environment

```bash
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# Windows (Git Bash)
source .venv/Scripts/activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure the environment

```bash
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV` | `development` | `development`, `test` or `production` |
| `API_HOST` | `127.0.0.1` | Host the API binds to |
| `API_PORT` | `8000` | Port the API binds to |
| `DATABASE_URL` | `postgresql+psycopg://labsentinel:labsentinel@127.0.0.1:5432/labsentinel` | Must use the `postgresql+psycopg://` driver |
| `DATABASE_CONNECT_TIMEOUT` | `5` | Seconds before a connection attempt fails |
| `DATABASE_ECHO` | `false` | Log every SQL statement |
| `CORS_ORIGINS` | Vite dev and preview origins | Comma-separated. `*` is rejected |
| `FHIR_PSEUDONYM_SALT` | a development-only value | Salt for the one-way patient pseudonym in FHIR ingestion. Set your own; it is held as a `SecretStr` |
| `FHIR_MAX_REQUEST_BYTES` | `5000000` | Largest body `POST /api/fhir/ingest` accepts |

`.env` is git-ignored. The defaults are throwaway development values, not
secrets. The database password is held as a `SecretStr`, so it never appears
in reprs, logs or API responses.

### 3. Start PostgreSQL

**Option A: Docker** (the repository root has a development-only compose
file):

```bash
# from the repository root
docker compose up -d db
docker compose ps           # STATUS shows "(healthy)" once pg_isready passes
```

Tested with Docker Desktop on Windows 11 (WSL 2 backend) and PostgreSQL
16.15. On Windows, Docker Desktop requires WSL 2. If `docker` reports
"Docker Desktop is unable to start", run `wsl --install --no-distribution` in
an administrator PowerShell and restart Windows.

It creates the database `labsentinel` owned by the user `labsentinel`, is
bound to `127.0.0.1:5432` only, and keeps its data in the named volume
`labsentinel-pgdata`. To use other credentials or another port, set
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` or `POSTGRES_PORT`, and
update `DATABASE_URL` to match.

Keep `DATABASE_URL` on `127.0.0.1`, not `localhost`. The container is
published on IPv4 loopback only, and `localhost` tries IPv6 `::1` first, which
stalls every new connection for the full `DATABASE_CONNECT_TIMEOUT` (measured
at about 5 s against 0.05 s).

Stopping the database:

```bash
docker compose stop db      # stop; data is kept
docker compose down         # remove the container and network; data is kept
docker compose down -v      # also DELETE the labsentinel-pgdata volume
```

**Option B: a local PostgreSQL install.** Create the role and database once,
as a superuser:

```sql
CREATE ROLE labsentinel WITH LOGIN PASSWORD 'labsentinel';
CREATE DATABASE labsentinel OWNER labsentinel;
```

### 4. Apply migrations

```bash
alembic upgrade head        # create or upgrade the schema
alembic current             # show the applied revision
alembic history             # list revisions
alembic upgrade head --sql  # print the SQL without touching a database
alembic downgrade base      # drop everything the migrations created
```

Tables are created **only** through Alembic. The application never calls
`create_all`.

`alembic downgrade 0001` is refused while seeded observations exist. It would
have to restore `NOT NULL` on `received_datetime`, and the seeded rows have no
receipt time, so the migration fails and PostgreSQL rolls the whole downgrade
back rather than inventing a value. On the disposable development database,
empty the tables first, then reseed after upgrading.

### 5. Start the API

```bash
uvicorn app.main:app --reload --port 8000
```

- Interactive API documentation: <http://127.0.0.1:8000/docs>
- ReDoc: <http://127.0.0.1:8000/redoc>
- OpenAPI schema: <http://127.0.0.1:8000/openapi.json>

The API starts even when PostgreSQL is down. Only the database health check
reports the problem.

## API endpoints

| Method | Path | Success | Failure |
|---|---|---|---|
| GET | `/api/health` | `200` `{"status": "healthy", "service": "LabSentinel API", "version": "0.1.0"}` | n/a. It does not touch the database. |
| GET | `/api/health/database` | `200` `{"status": "healthy", "database": "connected"}` | `503` `{"status": "unhealthy", "database": "unavailable"}` |

When the database check fails, the response and the server log contain only
the exception class. No host, user, password or connection string is exposed.

### Data endpoints (read-only)

Every data endpoint is `GET`. `POST`, `PUT`, `PATCH` and `DELETE` return
`405`. Data enters the database only through `python -m app.seed` or the
development-only [FHIR ingestion endpoint](#fhir-r4-laboratory-ingestion-development).
Observations from either path are returned identically.

| Path | Returns | Errors |
|---|---|---|
| `/api/facilities` | All active facilities, ordered by code | none |
| `/api/facilities/{id}` | One facility | `404` |
| `/api/observations` | One page of observations, oldest first (see below) | `422` for invalid filters |
| `/api/observations/{id}` | One observation | `404` |
| `/api/signals` | Signal history, ordered by `signal_date` | none |
| `/api/signals/current?day=1..5` | The signal for a capstone simulation day | `422` for a missing or out-of-range day |
| `/api/signals/{id}` | One signal | `404` |

`day` is a **capstone simulation control**, not a production concept. It
lets the demonstration request "the current signal" as its simulated clock
advances.

Timestamps are ISO-8601 with an offset. Scores and rates are JSON numbers.
Responses are Pydantic schemas, never ORM objects.

**Observation filters and pagination.**

| Parameter | Meaning |
|---|---|
| `day` | Simulation day 1–5: that local calendar day |
| `through_day` | Simulation days 1 through N inclusive (the Laboratory Data "cumulative" scope). Bounded on both sides: nothing dated before Day 1 |
| `facility_id` | Facility id (from `/api/facilities`) |
| `origin` | `fhir`: FHIR-ingested observations (`source_system` starting `fhir:`); `seed`: the seeded dataset |
| `source_system` | Exact source system: a seeded facility environment (e.g. `Simulated Epic Environment`) or a FHIR source (`fhir:...`) |
| `vendor` | Facility vendor label, exact, for example `MEDITECH` |
| `loinc_code` | For example `92142-9` |
| `result` | `Positive` or `Negative` (exact case) |
| `q` | Case-insensitive text search, up to 100 characters. It matches a substring of the observation id, patient reference, facility name, vendor, test name, LOINC code, area and result, joined by spaces, exactly as the prototype's browser search does. `%` and `_` are matched literally |
| `sort` | `effective_datetime` (default), `received_datetime`, `facility_name`, `vendor`, `patient_reference`, `result` or `test_name` |
| `order` | `asc` (default) or `desc`. Rows with equal values always stay in source order |
| `limit` | Page size. Default **100**, maximum **500** |
| `offset` | Rows to skip. Default 0 |

The response is `{"items": [...], "total": N, "limit": L, "offset": O}`,
where `total` counts every match. To page, repeat with
`offset = offset + limit` while `offset < total`. The full dataset is never
returned by default.

```bash
curl "http://127.0.0.1:8000/api/observations?day=5&result=Positive"          # total 34
curl "http://127.0.0.1:8000/api/observations?loinc_code=92142-9&limit=50"
curl "http://127.0.0.1:8000/api/observations?facility_id=3&limit=100&offset=100"
curl "http://127.0.0.1:8000/api/signals/current?day=5"
```

### Demo endpoint (capstone demonstration only)

| Path | Returns |
|---|---|
| `/api/demo/summary?day=1..5` | Headline figures for one simulated day: day, date, stage, description, tests, positives, negatives, positivity, baselines, affected facilities and areas, persistence, Composite Outbreak Signal Score, severity, Data Confidence, and a synthetic-data notice |
| `/api/demo/days` | The same summary for every seeded day, in order. The frontend's five-day storyline (stage names) in one request |

It lives under `/api/demo` so it stays separate from the resource endpoints,
and it is not a future production surveillance API. A missing or
out-of-range `day` returns `422`.

## CORS

Only explicitly listed origins are allowed. The defaults are the Vite
development server (`http://localhost:5173`, `http://127.0.0.1:5173`) and
`vite preview` (`:4173`). A wildcard `*` is rejected at startup, and only
`GET` is allowed, since the API is read-only. There is no production CORS
configuration yet.

## Running tests

The tests come in two layers.

### Unit tests (no database needed)

```bash
pytest
```

The unit suite does **not** need PostgreSQL. The PostgreSQL integration tests
are reported as skipped unless their database is configured.

- Model and relationship tests run against a temporary SQLite database whose
  schema is built by the real Alembic migration, so every test run also
  applies the migration.
- A drift test compares the migrated schema with the ORM models and fails on
  any difference.
- The PostgreSQL DDL is checked by rendering the migration offline for the
  PostgreSQL dialect (JSONB, BIGSERIAL, `timestamptz` defaults, and every
  named constraint and index).
- The database health endpoint is tested connected (SQLite) and unreachable
  (a real psycopg connection attempt to a closed port), including a check that
  no connection details leak.

SQLite is used here for speed and convenience only. The application itself
accepts only PostgreSQL URLs.

### PostgreSQL integration tests

These run against a real PostgreSQL, in a **separate** database so they never
touch development data. They reset that database with `alembic downgrade base`
and `alembic upgrade head`, so the suite refuses any database whose name does
not end in `_test`.

```bash
# once: create the disposable test database in the running container
docker compose exec db createdb -U labsentinel labsentinel_test

# from backend/ — Git Bash, macOS or Linux
LABSENTINEL_TEST_DATABASE_URL=postgresql+psycopg://labsentinel:labsentinel@127.0.0.1:5432/labsentinel_test \
  pytest tests/integration

# from backend/ — PowerShell
$env:LABSENTINEL_TEST_DATABASE_URL = "postgresql+psycopg://labsentinel:labsentinel@127.0.0.1:5432/labsentinel_test"
pytest tests/integration
```

They verify on PostgreSQL itself:

- the migration reaches the current head revision, and the live schema matches the ORM
  models, including server defaults
- JSONB, BIGINT identities and `timestamptz` defaults
- insert and read-back through the Facility → LabObservation relationship
- the JSONB `@>` containment query
- `updated_at` advancing on update
- the exact PostgreSQL error for each rule: unique (source record, facility
  code), foreign key (missing facility, and `ON DELETE RESTRICT`), every CHECK
  constraint, and enforced `VARCHAR` length
- `GET /api/health/database` returning 200 with no connection details in the
  body
- a `downgrade base` → `upgrade head` round trip
- the whole seed suite (`tests/test_seed.py`) and read-only API contract
  suite (`tests/test_api_data.py`), re-run on PostgreSQL through
  `test_seed_postgres.py` and `test_api_postgres.py`. That covers exact
  counts, a second seed run changing nothing, field-for-field parity with the
  frontend, every endpoint, filters, pagination, `404`s and invalid-day
  `422`s.

With `LABSENTINEL_TEST_DATABASE_URL` set, a plain `pytest` runs both layers.

## Full-stack development (API capstone mode)

The React app reads its data through one interface
(`src/data-access/`) with two explicit implementations, chosen at build time
by `VITE_DATA_SOURCE`:

| Mode | `VITE_DATA_SOURCE` | Data comes from | Used by |
|---|---|---|---|
| Local Demo Mode | `local` (default) | The prototype's TypeScript modules, in the browser | GitHub Pages, `npm run dev` |
| API Capstone Mode | `api` | FastAPI → PostgreSQL at `VITE_API_BASE_URL` (default `http://127.0.0.1:8000`) | Full-stack development |

API mode currently uses persisted synthetic demonstration data. Real FHIR
ingestion has not yet been implemented.

Any other `VITE_DATA_SOURCE` value stops the app with a configuration error.
There is **no automatic fallback**. If the API is unreachable in API mode,
the app shows "LabSentinel API is currently unavailable." with a Retry button,
and shows no data rather than silently switching to local data. Otherwise
there would be no way to prove the backend is really working.

### Starting the full stack on Windows (PowerShell)

Terminal 1, from the repository root:

```powershell
docker compose up -d db
docker compose ps            # wait for "(healthy)"
```

Terminal 2, from `backend\`:

```powershell
.venv\Scripts\Activate.ps1
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

Terminal 3, from the repository root:

```powershell
$env:VITE_DATA_SOURCE = "api"
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
# open http://localhost:5173/labsentinel/
```

Use `localhost:5173` or `127.0.0.1:5173`: those are the origins the API's CORS
allows. The variables last only for that PowerShell window. To go back to
local mode, open a new window, or run
`Remove-Item Env:VITE_DATA_SOURCE, Env:VITE_API_BASE_URL`. You can also put
the two lines in a git-ignored `.env.local` (see `.env.example` at the
repository root).

### Verifying that API mode really uses the API

- The top bar shows **API ● Connected**, which becomes **Unavailable** if a
  health check fails. It checks on load, about once a minute, and when
  clicked. Local mode shows **Synthetic Demo Data** instead.
- Browser developer tools, Network tab: requests go to `127.0.0.1:8000`, for
  example `/api/demo/summary?day=3` each time the simulated day changes and
  `/api/observations?...&limit=10` on the Laboratory Data page. In local mode
  there are none.
- Stop Uvicorn and reload. The app shows the unavailable screen, not data.
- Parity with local mode, against the running API:

  ```powershell
  npx vite-node scripts/verify-api-parity.ts
  ```

  This compares both data sources on facilities, all five days (stage, tests,
  positives, positivity, affected facilities and areas, persistence, score,
  severity, Data Confidence), single observations and 21 Laboratory Data
  queries, and exits non-zero on any difference. `--record` also refreshes
  the recorded responses that `npm test` replays offline.

### What is API-backed and what is still frontend-local

| API-backed in API mode | Still frontend-local in both modes |
|---|---|
| Facilities (hospital tabs, sidecar identity, filter options) | The current simulation day and autoplay (demo state) |
| Observations (Laboratory Data: filtering, search, sort and paging on the server) | Per-facility and per-area daily breakdowns (Outbreak Map, hospital dashboards, sidecar figures), which are not persisted yet |
| Each day's signal: tests, positives, positivity, affected facilities and areas, persistence, Composite Outbreak Signal Score, severity, Data Confidence | Alert detection and alert snapshots |
| Dashboard headline, Signals, Simulation page, Analytics trend, Day-over-Day | Feed-health simulation and the Data Confidence component breakdown |
| Cumulative totals (summed from persisted days) | Human investigation workflow and acknowledgements (browser storage) |
| | Simulated public-health reports (browser storage) |

Frontend-local views are cross-checked, not trusted blindly. In API mode:
- The app refuses to render if the API's facilities are not the prototype's.
- It refuses to render if a persisted score does not match its own inputs.
- It refuses to render if a persisted Data Confidence value does not match the
  feed-health model.
- It refuses to render if `/api/demo/summary` and `/api/signals` disagree.

The score's explanatory breakdown is rebuilt from the persisted inputs with
the prototype's unchanged scorer, and must reproduce the persisted composite
score exactly.

## FHIR R4 laboratory ingestion (development)

> **This endpoint is a capstone development ingestion endpoint and is not
> production-secured.** FHIR ingestion is development-only. There is no
> SMART on FHIR authorization, no production authentication, and no live EHR
> vendor connection (Epic, Oracle Health, MEDITECH or any other). It accepts
> synthetic data only.

```
Synthetic FHIR R4 JSON (Observation, or a Bundle)
   │  app/fhir/parser.py       JSON → each resource validated with fhir.resources
   │  app/fhir/validator.py    status · laboratory category · LOINC · effective time
   │  app/fhir/terminology.py  LOINC → test → syndrome · qualitative result codes
   │  app/fhir/resolver.py     facility · geography · Specimen · DiagnosticReport
   │  app/fhir/normalizer.py   result values · source identity · patient pseudonym
   ▼
app/services/fhir_ingestion.py  best effort per Observation, duplicate detection
   ▼
lab_observation (PostgreSQL)  ──►  GET /api/observations  ──►  React (unchanged)
```

Once normalized, an ingested observation is an ordinary `lab_observation` row.
The read API and the frontend treat it exactly like a seeded one. FHIR logic
lives only in `app/fhir/` and the ingestion service, never in route handlers
or SQLAlchemy models.

### FHIR library

**`fhir.resources` 8.3.0** (with `fhir-core` 1.1.11), pinned exactly in
`requirements.txt`. We use its **`fhir.resources.R4B`** models, FHIR 4.3.0.

Why: it is the maintained FHIR model library built on Pydantic v2, which the
rest of the backend already uses. It has no R4 (4.0.1) model set for
Pydantic v2. The last R4 release (6.5.0) requires Pydantic v1 and cannot be
installed alongside FastAPI and pydantic-settings. R4B is a technical-
correction release of R4, and the resources LabSentinel reads (Observation,
DiagnosticReport, Organization, Location, Specimen, Bundle, Patient) are
wire-compatible with R4 for every element used here.

The library validates structure and datatypes. It rejects unknown elements,
wrong types, two `value[x]` at once, and a date-time with a time but no
timezone. It does **not** enforce every required element or code binding (it
accepts an explicit `"code": null` or `"status": "done"`), so LabSentinel
checks those itself in `validator.py`. Library error text can echo input
values, so it is never passed on: responses carry only the element path and
the error type.

### Supported resources

| Resource | How it is used |
|---|---|
| **Observation** | Required. The laboratory result that is normalized and stored |
| DiagnosticReport | Groups results. `result[]` links Observations to the report (stored as `source_report_id`), and its `performer` and `specimen` are fallbacks. Observations are never duplicated because a report lists them |
| Organization | Resolves the performing facility |
| Location | Cross-checks geography: its postal code must match the facility's area, otherwise a `GEOGRAPHY_MISMATCH` warning. Addresses are never stored |
| Specimen | Its `type` is stored as `specimen_type` (for example "Nasopharyngeal swab"). Nothing else is kept |
| Patient, ServiceRequest | Accepted in a Bundle as reference targets only, and **never read**. No Patient table exists |
| Anything else | `UNSUPPORTED_RESOURCE` warning; ignored |

A request is a single Observation, or a Bundle of type `collection`,
`transaction` or `batch`. References resolve by `fullUrl`, by `Type/id` (also
the tail of an absolute URL), and by `#id` for contained resources.
LabSentinel ingests resources. It does not implement FHIR transaction, server
or search semantics.

### Observation rules

Applied in this order. The first failure rejects the Observation with the
code shown.

| Rule | Rejected as |
|---|---|
| Structure and datatypes valid for FHIR (library) | `INVALID_FHIR` |
| `status` is a FHIR status; only **final**, **amended** and **corrected** are ingested | `INVALID_FHIR` / `NON_FINAL_STATUS` |
| **Laboratory.** If `category` is present, it must include `laboratory` (`http://terminology.hl7.org/CodeSystem/observation-category`), so vital signs, device and other clinical observations are refused. If `category` is absent, the Observation is accepted only when its code is a *mapped* LabSentinel laboratory LOINC; an unrecognized code without a category is not assumed to be laboratory | `NON_LAB_OBSERVATION` |
| `code` has exactly one LOINC code (`system` = `http://loinc.org`), well formed (digits, hyphen, correct mod-10 check digit) | `INVALID_LOINC` |
| Effective time: `effectiveDateTime`, `effectiveInstant` or `effectivePeriod.start`, a full date-time **with a timezone offset**, not in the future (5 minutes of clock skew allowed) | `MISSING_EFFECTIVE_TIME` / `INVALID_EFFECTIVE_TIME` |
| The performing facility resolves (see below) | `UNRESOLVED_FACILITY` |
| `identifier` (system and value) or `id` exists, so resubmissions can be recognized | `MISSING_IDENTIFIER` |
| Effective time is **outside the frozen demonstration period** (Nov 3–7, 2025, America/New_York) | `DEMO_PERIOD_RESERVED` |
| The result can be normalized (see below) | `INVALID_RESULT` |

**Timezones.** Times are never guessed. A date-only or partial value
(`2026-01-12`, `2026-01`) is rejected. A time without an offset is already
invalid FHIR (the specification requires an offset whenever a time is given)
and fails validation. Accepted times keep their instant, are stored in UTC,
and are returned by the read API in the simulation zone with the offset.

**`received_datetime`** is set by LabSentinel to the moment of ingestion
(UTC), for every ingested observation. Seeded observations have none, because
the prototype never recorded one.

### Terminology (LOINC → test → syndrome)

`app/fhir/terminology.py` is the only mapping, and a test pins it to the
prototype's test catalogue:

| LOINC | Test | Syndrome | Results |
|---|---|---|---|
| 92142-9 | Influenza A RNA | Respiratory Viral Syndrome | Positive / Negative |
| 94500-6 | SARS-CoV-2 RNA | Respiratory Viral Syndrome | Positive / Negative |
| 85479-4 | RSV RNA | Respiratory Viral Syndrome | Positive / Negative |

**Unmapped LOINC.** A well-formed code that is not in the table is
**stored**, with `terminology_status = 'unmapped'`, **no syndrome**, the
source's display in `code_display`, and an `UNMAPPED_LOINC` warning. It is
never given a guessed syndrome. A database CHECK enforces that a syndrome is
present exactly when the code is mapped. Seeded rows are all `mapped`.
Surveillance views filter by syndrome, so unmapped results wait for
terminology review instead of skewing a signal.

### Result normalization

| `value[x]` | Mapped qualitative tests | Other (unmapped) tests |
|---|---|---|
| `valueCodeableConcept` | SNOMED CT 10828004 *Positive* / 260373001 *Detected* → **Positive**; 260385009 *Negative* / 260415000 *Not detected* → **Negative**. Otherwise its text or display, if it is exactly one of those words. Otherwise `INVALID_RESULT` | Same normalization when recognized, else the concept's text kept. The coding is stored in `result_code_system` / `result_code` |
| `valueString` | Only those words (case- and space-insensitive) | Kept as given (≤ 255 characters) |
| `valueQuantity` | `INVALID_RESULT` (a qualitative test cannot have a number) | `result_numeric`, `result_unit`, `result_unit_system` (e.g. UCUM `http://unitsofmeasure.org`), `result_unit_code`; a comparator is kept in `result_value` (`<5`). No unit conversion |
| `valueBoolean` | `INVALID_RESULT` | `true` / `false` |
| Range, Ratio, SampledData, Integer, Time, DateTime, Period, none | `INVALID_RESULT` | `INVALID_RESULT` (not supported yet) |

### Facility resolution and geography

Deterministic and configured (`app/fhir/resolver.py`), never inferred from
free text or vendor names. For each `Observation.performer`:
1. If it references an Organization in the submission (or contained), use
   that Organization's identifier with system
   **`urn:labsentinel:facility-code`** (value = facility code, e.g.
   `HOSP-A`). Failing that, use its id from the development map:
   `org-worcester-central` → HOSP-A, `org-central-mass-regional` → HOSP-B,
   `org-shrewsbury-community` → HOSP-C.
2. An unresolved `Organization/<id>` reference is looked up in the same map.
3. A logical reference (`performer.identifier`) with that system is used as
   given.

If the Observation names no resolvable performer, the performer of the
DiagnosticReport that lists it is tried. The result must be exactly one
**active LabSentinel facility**. Anything else (none, conflicting, unknown
code) is `UNRESOLVED_FACILITY`, and nothing is stored. Facilities are never
created by ingestion.

`geographic_unit` is the resolved facility's configured surveillance area
(its postal code). No patient or street address is read or stored.

### Privacy

The data are synthetic, and the pipeline behaves as if they were not:
- The subject becomes a **salted one-way pseudonym**, `FHIR-PT-<24 hex>`,
  computed as HMAC-SHA256 over the source system and `subject.reference`, or
  failing that `subject.identifier`. Set the salt with `FHIR_PSEUDONYM_SALT`.
  The reference itself is never stored. `subject.display`, which can be a
  name, is never read. With no subject, the pseudonym is `FHIR-NO-SUBJECT`.
- Patient resources are never read, so their names, addresses, birth dates,
  telecom and identifiers are never stored or logged. A test puts all of
  these into a Bundle and confirms none appear in the database or the log.
- Error messages and labels never include Patient ids or input values.
- Logs record resource type and id, source id, facility, and outcome only.
  Payloads are never logged.

### Duplicates and transactions

- **Idempotent.** The key is the existing unique pair
  `(source_system, source_observation_id)`:
  - When there is an identifier, it is `fhir:<identifier.system>` +
    `identifier.value`. Resubmitting from anywhere is recognized.
  - Otherwise it is `fhir:resource-id:<facility>` + `Observation/<id>`. A
    server id is only unique within its source.

  A resubmission is reported as `duplicate`, and nothing is written. If its
  content differs, the response says so, but **amendments are not applied**
  in this phase.
- **Best effort, per Observation.** Each Observation is validated and
  inserted in its own savepoint. Valid ones persist, rejected ones return
  structured errors, and one failure never undoes another. The request
  commits once at the end.
- All FHIR `source_system` values start with `fhir:`, so ingested rows are
  always distinguishable from the seed.

### The frozen demonstration is protected

- Effective times inside Nov 3–7, 2025 are rejected (`DEMO_PERIOD_RESERVED`).
- `through_day` now means Day 1 through Day N (it is bounded below too), so
  data dated before Day 1 cannot enter the demo's cumulative counts.
- `python -m app.seed.verify` compares only seeded rows.
- Signals, demo days and audit events are never written by ingestion.

With FHIR data present, the frontend's API mode still matches local mode and
the frozen `submission-v1.4` build on every screen.

### Endpoint

Also development-only: `GET /api/fhir/examples` lists the synthetic
fixtures (id, title, description, kind, expected outcome), and
`GET /api/fhir/examples/{id}` returns one fixture's content exactly as
stored. No filesystem path is ever exposed.

`POST /api/fhir/ingest`, Content-Type `application/fhir+json` (or
`application/json`), maximum body `FHIR_MAX_REQUEST_BYTES` (default 5 MB).
It **exists only with `APP_ENV=development`** and returns `404` otherwise.
In development, CORS also allows `POST` for the FHIR Ingestion page (below).
Everywhere else it is `GET`-only. There are no other write endpoints: `POST`, `PUT` and `DELETE` on
facilities and observations return `405`.

Response (HTTP 200 whenever the request itself was readable):

```json
{
  "resources_received": 8,
  "observations_received": 3,
  "observations_validated": 3,
  "observations_created": 3,
  "duplicates": 0,
  "rejected": 0,
  "errors": [],
  "warnings": [],
  "results": [
    {"resource": "Observation/lab-e-flu", "outcome": "created", "observation_id": 701,
     "source_system": "fhir:urn:labsentinel:synthetic:hosp-c:lab-result",
     "source_observation_id": "C-PANEL-20260116-0001-FLUA", "message": null}
  ]
}
```

Each error or warning is `{code, message, resource, severity}`. There is
never a stack trace, and `resource` is a safe label. Request-level failures
use the same shape: `400` for invalid JSON or an unsupported top-level
resource, `413` for a body that is too large, `415` for the wrong content
type.

| Code | Meaning |
|---|---|
| `INVALID_FHIR` | Not JSON, or not valid FHIR |
| `UNSUPPORTED_RESOURCE` | A resource or Bundle type LabSentinel does not ingest |
| `NON_LAB_OBSERVATION` | Not a laboratory result |
| `NON_FINAL_STATUS` | Not final, amended or corrected |
| `INVALID_LOINC` | No LOINC, conflicting LOINC, or malformed code |
| `UNMAPPED_LOINC` | *Warning*: stored as unmapped |
| `UNRESOLVED_FACILITY` | No single active facility |
| `INVALID_RESULT` | Missing or uninterpretable value |
| `MISSING_EFFECTIVE_TIME` / `INVALID_EFFECTIVE_TIME` | Missing, partial, offset-less or future time |
| `DEMO_PERIOD_RESERVED` | Inside the frozen demonstration period |
| `MISSING_IDENTIFIER` | Neither an identifier nor an id |
| `UNRESOLVED_REFERENCE` | *Warning*: a Specimen or report result not in the submission |
| `GEOGRAPHY_MISMATCH` | *Warning*: Location postal code differs from the facility's |
| `DUPLICATE` | *Warning*: already ingested |

### Manual demo (Windows PowerShell)

With PostgreSQL and the API running (see
[Full-stack development](#full-stack-development-api-capstone-mode)), from
`backend\`:

```powershell
$base = "http://127.0.0.1:8000"
function Ingest($file) {
  $body = Get-Content -Raw -Encoding UTF8 $file
  try { Invoke-RestMethod -Method Post -Uri "$base/api/fhir/ingest" -ContentType "application/fhir+json" -Body $body }
  catch { $_.ErrorDetails.Message | ConvertFrom-Json }   # 400/413/415 bodies
}

# 1. A synthetic Influenza A Observation: created = 1
Ingest examples\fhir\case-a-influenza-a-positive.json

# 2. Read it back as a normalized LabObservation
(Invoke-RestMethod "$base/api/observations?source_system=fhir:urn:labsentinel:synthetic:hosp-a:lab-result").items

# 3. The same Observation again: duplicates = 1, created = 0
Ingest examples\fhir\case-a-influenza-a-positive.json

# 4. A Bundle with Organization, Location, Specimen, DiagnosticReport: created = 3
Ingest examples\fhir\case-e-bundle-respiratory-panel.json

# 5. Structured rejections
Ingest examples\fhir\case-g-invalid-loinc.json              # INVALID_LOINC
Ingest examples\fhir\case-j-vital-signs-not-laboratory.json # NON_LAB_OBSERVATION
Ingest examples\fhir\case-k-malformed-json.txt              # INVALID_FHIR (HTTP 400)
```

The fixtures are described in [`examples/fhir/README.md`](examples/fhir/README.md).
Ingested rows stay alongside the seed. To start a presentation from a clean
slate, remove only the FHIR rows:

```powershell
docker compose exec db psql -U labsentinel -d labsentinel -c "DELETE FROM lab_observation WHERE source_system LIKE 'fhir:%'"
```

### FHIR Ingestion Demo page (API capstone mode)

> This is a synthetic FHIR ingestion demonstration. No live Epic, Oracle
> Health or MEDITECH connection exists.

The React app has a **FHIR Ingestion** page (`/fhir-ingestion`) that makes
this pipeline visible in class. It appears in the navigation **only in API
Capstone Mode** (`VITE_DATA_SOURCE=api`) against a backend running with
`APP_ENV=development`.

In Local Demo Mode, which the GitHub Pages site uses, the navigation is
unchanged. The route only shows *"FHIR ingestion requires LabSentinel API
Capstone Mode."*, with no controls, and the page never builds an API client
or sends a request.

What the page shows, all from the backend's actual responses:

| Section | Source |
|---|---|
| **FHIR Ingestion API / PostgreSQL / API** status | `GET /api/fhir/examples` (404 means "disabled: not development"), `/api/health`, `/api/health/database` |
| **Example fixture** selector | `GET /api/fhir/examples` and `/api/fhir/examples/{id}`, served from `backend/examples/fhir` (development only; no paths exposed). Grouped as valid, Bundle and invalid |
| **Synthetic FHIR JSON** editor | A plain monospaced text area, with **Format JSON**, **Reset** and **Load Example** |
| **Ingest Synthetic FHIR** / **Ingest Again** | One `POST /api/fhir/ingest` each. While it runs, "Validating FHIR… Normalizing terminology… Resolving facility… Persisting observation…" describe what that single request does; they are not separate calls |
| **Result summary** | Resources received, observations validated, created, duplicates, rejected. For a Bundle, also its contents by resource type and a note that processing is best effort per Observation |
| **Pipeline** | FHIR R4 → Validation → Facility resolution → LOINC/result normalization → PostgreSQL → LabSentinel observation, in the backend's real order. Each stage shows *Success / Warning / Failed / Not reached* as text and icon (not color alone), from the result's `issue_code`, `warnings` and outcome. Nothing after a failure is shown as succeeded |
| **Source FHIR vs Normalized LabSentinel record** | The submitted Observation next to the stored record, fetched with `GET /api/observations/{id}` |
| **Terminology** card | The FHIR LOINC coding → the stored test and syndrome (or "not mapped") |
| **Facility resolution** card | The configured rule the backend reports in `facility_resolution` → the fictional facility and its simulated environment |
| **Effective vs received time** | When the synthetic event occurred vs when LabSentinel ingested it |
| **Structured issues** | `code`, plain-language explanation and message. Never a stack trace |
| **Recent FHIR ingestions** | `GET /api/observations?origin=fhir&sort=received_datetime&order=desc&limit=8`. Never the 699 seeded rows |

Ingestion results carry `facility_code`, `facility_resolution`,
`issue_code` and per-Observation `warnings`, so the page explains what the
backend actually did instead of inferring it. In development the API's CORS
allows `POST` for this page, and every other environment stays `GET`-only.

**Laboratory Data is unchanged on purpose.** It is the frozen five-day
simulation's view (Nov 3–7, 2025), and ingested observations are dated
outside that window, so they do not appear there. That is what keeps the
Day 1–Day 5 figures (scores 0, 24, 50, 74, 87) identical. Find ingested rows
in the page's **Recent FHIR ingestions** table or with
`GET /api/observations?origin=fhir`.

#### Running the full-stack demonstration

1. `docker compose up -d db` (repository root).
2. From `backend\`: `.venv\Scripts\Activate.ps1`, `alembic upgrade head`,
   `python -m app.seed`, then `uvicorn app.main:app --reload --port 8000`
   (`APP_ENV` defaults to `development`).
3. From the repository root, in PowerShell:
   `$env:VITE_DATA_SOURCE = "api"; $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"; npm run dev`
4. Open <http://localhost:5173/labsentinel/fhir-ingestion>.

To start a presentation from a clean slate, first remove earlier FHIR rows
(the command above under *Manual demo*). Otherwise the first ingestion is,
correctly, reported as a duplicate.

#### Suggested presentation sequence (about 5 minutes)

1. Point at the status row (API and PostgreSQL connected) and the
   synthetic-data banner.
2. **Influenza A positive Observation**: Load Example → Ingest. The result
   is *Created 1*, with all stages *Success*. Walk through Source FHIR vs the
   Normalized record, then the terminology, facility and time cards.
3. **Ingest Again**: *Created 0, Duplicates 1*. PostgreSQL shows a warning
   because the same source system + source observation ID was detected, so
   nothing was written.
4. **Multi-resource Bundle**: 8 resources received, 3 Observations created.
   Choose each Observation from the selector, and show that the facility came
   from the DiagnosticReport's performer.
5. **Non-laboratory Observation**: *Rejected 1*, `NON_LAB_OBSERVATION`.
   The pipeline stops at Validation and later stages show *Not reached*.
   Optionally, **Unresolved facility** stops at Facility resolution, and
   **Malformed FHIR JSON** is an HTTP 400.
6. Show **Recent FHIR ingestions**, then open **Simulation** or **Dashboard**:
   the five-day scores are still 0, 24, 50, 74, 87.

### Tests

- `tests/test_fhir_rules.py` (70 tests, no database): parsing, safe error
  text, status, laboratory detection, LOINC check digits, mapping, results,
  timezones, source identity and pseudonyms.
- `tests/test_fhir_ingestion.py` (29 tests), also re-run on PostgreSQL by
  `tests/integration/test_fhir_postgres.py`. It covers the endpoint
  end to end:
  - every fixture, duplicates and changed resubmissions, Bundles, and
    best-effort partial success
  - `received_datetime`, and read-after-write through `GET /api/observations`
  - the reserved demo period, and that the five-day demonstration's figures
    are unchanged after ingesting every fixture
  - content types, size limit, and 404 outside development
  - privacy of the database and the log

## Current limitations

- FHIR ingestion is development-only: no SMART on FHIR authorization, no
  authentication, no rate limiting, and no live Epic, Oracle Health or MEDITECH
  connection. Synthetic data only.
- FHIR models are R4B (4.3.0) from `fhir.resources`. There is no strict R4
  (4.0.1) profile validation, and no validation against US Core or other
  implementation-guide profiles.
- Only three LOINC codes are mapped. Other laboratory codes are kept as
  unmapped. There is no terminology server, no unit conversion, and no
  Range, Ratio or SampledData results.
- The FHIR Ingestion page is a development demonstration: it runs only in
  API mode against a development backend, and has no file upload,
  authentication or audit of who ingested what.
- Resubmitted amendments (same identifier, changed content) are reported,
  not applied. Ingested rows are not yet aggregated into surveillance
  signals: the five-day demonstration stays frozen.
- No authentication, users or role-based access control. The API is for local
  development only.
- No production security hardening, TLS or secrets management.
- The data are synthetic capstone demonstration data. Only the seed and the
  development FHIR endpoint write data.
- Apart from FHIR ingestion, the API is read-only. There is no endpoint for
  audit events. Investigation and report state stay in the browser.
- No signal computation in the backend. Scores and Data Confidence are the
  prototype's own values, persisted as exported. Nothing is recalculated.
- `received_datetime` is null for every seeded observation, because the
  prototype records no receipt time. FHIR-ingested observations always have
  one.
- The frontend calls this API only in API mode (`VITE_DATA_SOURCE=api`).
  Per-facility and per-area daily breakdowns, alert detection and feed health
  are still computed in the browser, because they are not persisted yet.
- The API is not deployed anywhere. API mode is for local development, and
  the public GitHub Pages site stays in local mode.
- No statistical detection (CUSUM, EWMA) and no machine learning.
- No real public-health reporting.
