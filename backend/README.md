# LabSentinel API — backend foundation

> This backend is the development foundation for the LabSentinel capstone.
> Production security and live healthcare-system connectivity are not
> implemented. FHIR R4 laboratory ingestion exists as a **development-only**
> foundation for synthetic data (see
> [FHIR R4 laboratory ingestion](#fhir-r4-laboratory-ingestion-development)),
> and the frontend can be launched as a SMART on FHIR app against the public
> SMART Health IT **sandbox** (see
> [SMART on FHIR sandbox launch](#smart-on-fhir-sandbox-launch-development)).
> SMART sandbox integration demonstrates standards-based launch and FHIR
> access using synthetic data. It is not a live Epic, Oracle Health or
> MEDITECH production connection.
>
> A **dynamic surveillance engine** calculates surveillance signals from the
> stored observations, kept apart from the frozen five-day classroom
> demonstration (see
> [Dynamic surveillance engine](#dynamic-surveillance-engine-development)).
> The Dynamic Surveillance Engine is a capstone prototype model and is not
> epidemiologically validated for production public-health decision-making.
>
> An **experimental EWMA statistical detector** runs beside the Composite
> Outbreak Signal Score and never modifies it (see
> [EWMA statistical detector](#ewma-statistical-detector-experimental)).
> EWMA is an experimental statistical surveillance method in this capstone
> and has not been validated for production epidemiological decision-making.
>
> A third method, an **experimental CUSUM detector**, completes the
> capstone's detector set (Composite, EWMA, CUSUM). The three are compared,
> never combined (see
> [CUSUM statistical detector](#cusum-statistical-detector-and-three-method-comparison-experimental)).
> CUSUM is an experimental statistical surveillance method in this capstone
> and has not been epidemiologically validated for production decision-making.
>
> A **capstone evaluation framework** (`app/evaluation`) runs the three
> methods, unchanged, on 15 synthetic scenarios with known ground truth
> (100 seeded repetitions each). It measures sensitivity, timeliness,
> false alerts, stability and robustness to data-quality problems, and
> describes the tradeoffs without naming a winner (see
> [Capstone evaluation framework](#capstone-evaluation-framework-synthetic-scenarios)).
> These evaluations use synthetic scenarios and demonstrate technical
> behavior only. They do not establish clinical or epidemiological
> validation.

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
│   │                      fhir (development ingestion), surveillance
│   │                      (dynamic signals) routes
│   ├── fhir/              FHIR R4 parsing, validation, terminology, resolution,
│   │                      normalization (no HTTP, no ORM)
│   ├── core/vocabulary.py controlled vocabularies shared with the frontend
│   ├── core/simulation.py capstone simulation calendar and time zone
│   ├── models/            Facility, LabObservation, SurveillanceSignal,
│   │                      AuditEvent, DemoSimulationDay
│   ├── schemas/           Pydantic response models (never ORM objects)
│   ├── services/          query logic and FHIR ingestion used by the routes
│   ├── surveillance/      dynamic surveillance engine: aggregation, baseline,
│   │                      scoring, persistence, `run` command
│   ├── statistics/        experimental EWMA and CUSUM detectors: formulas,
│   │                      series, comparison, persistence, `run` command
│   ├── evaluation/        capstone evaluation: synthetic scenarios, generator,
│   │                      runner, metrics, reports, `run` command
│   └── seed/              dataset fixture, idempotent seed, parity check,
│                          SMART sandbox facility, dynamic dataset
├── alembic/               migration environment and versions/
├── evaluation-results/    committed evaluation artifacts (JSON, CSV, report)
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
| `/api/facilities` | All active participating facilities, ordered by code. `?participation=all` also lists development facilities (the [SMART sandbox](#smart-on-fhir-sandbox-launch-development) facility) | `422` for another `participation` value |
| `/api/facilities/{id}` | One facility | `404` |
| `/api/observations` | One page of observations, oldest first (see below) | `422` for invalid filters |
| `/api/observations/{id}` | One observation | `404` |
| `/api/signals` | The frozen demonstration's signal history, ordered by `signal_date` (never a dynamic signal; see the [dynamic surveillance API](#api)) | none |
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
`vite preview` (`:4173`). A wildcard `*` is rejected at startup. Only `GET`
is allowed, except that `APP_ENV=development` also allows `POST` for the two
development-only endpoints (FHIR ingestion and dynamic recalculation). There
is no production CORS configuration yet.

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

Only when neither resolves, a configured **development source** rule
applies: an `Observation.meta.source` starting with
`https://launch.smarthealthit.org/` maps to the development facility
`SMART-SANDBOX`, if it has been provisioned (see the
[SMART → LabSentinel bridge](#smart--labsentinel-ingestion-bridge)). A
development facility is never reachable as a performer.

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
- `tests/test_fhir_ingestion.py` (44 tests), also re-run on PostgreSQL by
  `tests/integration/test_fhir_postgres.py`. It covers the endpoint
  end to end:
  - every fixture, duplicates and changed resubmissions, Bundles, and
    best-effort partial success
  - `received_datetime`, and read-after-write through `GET /api/observations`
  - the reserved demo period, and that the five-day demonstration's figures
    are unchanged after ingesting every fixture
  - content types, size limit, and 404 outside development
  - privacy of the database and the log
  - the SMART sandbox development-source mapping (see below)

## SMART on FHIR sandbox launch (development)

> SMART sandbox integration demonstrates standards-based launch and FHIR
> access using synthetic data. It is not a live Epic, Oracle Health or
> MEDITECH production connection.

LabSentinel can be launched as a real SMART on FHIR app against the public
[SMART Health IT sandbox](https://launch.smarthealthit.org), following
SMART App Launch 2.2.0. Everything it reads is synthetic sandbox data. It is
off by default: the GitHub Pages site and a default local build contain no
SMART controls and make no SMART requests.

### Three different things

| | Simulated vendor sidecar | Live SMART sandbox session | Future production integration |
|---|---|---|---|
| Where | `/hospitals` (Simulated Epic / Oracle Health / MEDITECH shells) | `/smart/sidecar`, launched by the SMART Health IT sandbox | A registered app inside a real EHR |
| Authorization | None: a demonstration of placement | Real OAuth 2.0 authorization code flow with PKCE (public client) | Vendor app registration, organisation approval, confidential or asymmetric client auth as the vendor requires |
| FHIR data | None | Synthetic sandbox Patients and Observations, read live | Real patient data under a data-use agreement |
| Status | Unchanged prototype | Implemented (Phase 6, development only) | Not implemented |

### Architecture

```
SMART Health IT launcher ──(iss + launch)──▶ /smart/launch
        │                                         │ discovery: <iss>/.well-known/smart-configuration
        │                                         ▼
        │                          sandbox /auth/authorize (PKCE S256, scopes)
        │                                         │ code + state
        ▼                                         ▼
  Standalone: /smart-demo button ──────────▶ /smart/callback ──token exchange──▶ /smart/sidecar
                                                                                    │
                        read-only: Observation?patient=…&category=laboratory ◀──────┤
                                                                                    │ (API mode, on click)
                        POST /api/fhir/ingest  (meta.source = issuer) ◀─────────────┘
                              → the Phase 4 validator, resolver, normalizer, duplicate check
```

- **Client library:** [`fhirclient`](https://github.com/smart-on-fhir/client-js)
  **3.0.0**, pinned exactly and loaded lazily (a separate ~34 KB chunk), so
  a build with SMART disabled never downloads or runs it. 2.6.3 was not
  used: it depends on `isomorphic-webcrypto`, which pulls the Expo toolchain
  and ten moderate `npm audit` findings into the install. 3.0.0 ships
  incomplete TypeScript declarations for its browser entry point, so
  `src/smart/client.ts` wraps it in a small typed adapter. The only calls are
  `authorize()` and `ready()`.
- **Code:** `src/smart/` (configuration, launch parsing, the adapter,
  display helpers and the bridge), `src/pages/smart/` (the four routes) and
  `src/components/smart/`.
- **Routes:** `/smart/launch` and `/smart/callback` are full-screen and
  outside the application shell. `/smart/sidecar` is a compact full-screen
  panel sized for an EHR side frame. `/smart-demo` is in the shell and is
  listed in the navigation only when SMART is enabled.

### Configuration

Frontend build variables (see [`.env.example`](../.env.example)). None of
them is secret, and none may ever hold a secret: every `VITE_*` value is
compiled into the JavaScript the browser downloads.

| Variable | Default | Notes |
|---|---|---|
| `VITE_SMART_ENABLED` | `false` | Only `true` / `false`. Anything else stops the app with a configuration error. |
| `VITE_SMART_CLIENT_ID` | `labsentinel-capstone-sandbox` | The sandbox accepts any id for a public client. |
| `VITE_SMART_SCOPES` | `openid fhirUser patient/Observation.rs` | Validated at startup (below). |
| `VITE_SMART_REDIRECT_URI` | `<origin><base>smart/callback` | https, or http only on `localhost` / `127.0.0.1`. |
| `VITE_SMART_STANDALONE_ISS` | SMART Health IT R4, patient standalone | The sandbox reads standalone launch options from the issuer path (`/v/r4/sim/<options>/fhir`); the default asks for its patient login and approval screens, public client, PKCE. Its plain R4 base rejects a standalone launch as "Invalid launch options". |

**Local URLs** (Vite dev server):

- Launch URL: `http://localhost:5173/labsentinel/smart/launch`
- Redirect URL: `http://localhost:5173/labsentinel/smart/callback`

### Security model

- **Public client, PKCE.** There is no client secret anywhere in the
  frontend. `fhirclient` uses PKCE S256 when the server advertises it
  (`pkceMode: 'ifSupported'`), and the sandbox does.
- **Least-privilege scopes.**

  | Launch | Scopes requested | Why |
  |---|---|---|
  | EHR launch | `launch openid fhirUser patient/Observation.rs` | `launch` exchanges the EHR's launch token for its patient context; `openid fhirUser` identify the launching user (shown as a FHIR reference only); `patient/Observation.rs` reads and searches that patient's Observations, and nothing else. |
  | Standalone | `launch/patient openid fhirUser patient/Observation.rs` | `launch/patient` asks the server to choose a patient. The rest is identical. |

  There is no Patient read (no demographics are fetched or shown), no write
  or `*` scope, and no `offline_access` (no refresh token is requested; the
  sandbox issued none). Startup rejects a `VITE_SMART_SCOPES` containing any
  of those, or a `launch` scope (it is added per launch type). The sandbox's
  approval screen describes `launch/patient` as "Read all data about the
  selected patient", but the granted scope, shown in the technical details,
  is exactly the requested set.
- **Tokens.** `fhirclient` keeps its state in `sessionStorage` (this tab
  only, cleared when the tab closes). LabSentinel adds no token storage of
  its own. The object the UI receives (`SmartSession`) has no field for an
  access token, refresh token, ID token, authorization code or PKCE
  verifier. The technical-details panel is a fixed whitelist. The
  authorization code is removed from the address bar after the exchange.
  **End SMART session** removes the library's state.
- **Errors** are reduced to plain text: an OAuth error code and description
  (tags stripped), never a stack trace or a server response body. Only
  `access_denied` is shown as *Authorization Denied*. Any other OAuth error
  (for example `invalid_request`, `invalid_scope`) is a *SMART Configuration
  Error*.
- **Nothing from the sandbox is persisted** except an Observation the user
  explicitly sends through the bridge (below), and then only as the Phase 4
  pipeline stores any Observation: pseudonymised patient reference, no
  demographics, no Patient resource, no user identity.

**Connection states:** Not Configured, Ready to Launch, Authorizing,
Connected, Authorization Denied, FHIR Server Error, Session Expired, SMART
Configuration Error. Each has an icon and a text label (never colour alone).

### The sidecar

After authorization, `/smart/sidecar` shows:

- **SMART context:** connection state, FHIR server (host only), launch type,
  the launching user as a FHIR reference (e.g. `Practitioner/…`), and the
  patient context ID. No name, birth date or other demographics.
- **Regional Respiratory Activity:** LabSentinel's own regional intelligence
  (severity, Composite Outbreak Signal Score, Data Confidence) for the
  current simulation day, with a link to the full view. It comes from the
  existing data source (local or API) and is not derived from the sandbox.
- **Sandbox laboratory Observations:** up to ten, read live with
  `Observation?patient=<id>&category=laboratory&_sort=-date&_count=10`,
  labelled "Sandbox FHIR data — not LabSentinel surveillance data."
- **View SMART Technical Details:** SMART profile, FHIR base URL and
  version, launch type, granted scopes, whether patient and user context
  were supplied, PKCE (from the server's discovery document), authorization
  status and token expiry time. Tokens are never displayed.

### SMART → LabSentinel ingestion bridge

In API mode, each sandbox Observation has **Send Eligible Lab Observation to
LabSentinel**. It posts that one Observation to `POST /api/fhir/ingest`,
unchanged except that `meta.source` is set to the SMART server's base URL.
It goes through the **same** Phase 4 validation, facility resolution,
terminology normalization and duplicate detection as any other submission:
nothing is bypassed.

**Facility mapping.** A sandbox Observation names no LabSentinel facility,
and it must never be attributed to one of the three participating
facilities (or to Epic, Oracle Health or MEDITECH). The resolver therefore
has one extra, configured rule, tried only when no performer or
DiagnosticReport performer resolves:

| `Observation.meta.source` starts with | Facility |
|---|---|
| `https://launch.smarthealthit.org/` | `SMART-SANDBOX` (development) |

`SMART-SANDBOX` is a fictional **development** facility
(`participation = 'development'`, country `ZZ`, area `SANDBOX`). It is not
created by migrations, seeding or ingestion. It exists only after:

```powershell
# from backend\
python -m app.seed.smart_sandbox           # create it (refused when APP_ENV=production)
python -m app.seed.smart_sandbox --remove  # delete it and its sandbox-ingested observations
```

- Without it, the bridge answers: *SMART source connected, but no
  LabSentinel participating-facility mapping is configured.* Nothing is
  stored.
- With it, the Observation is validated and stored against `SMART-SANDBOX`.
  Sending it again is reported as a duplicate. Laboratory codes outside the
  three mapped respiratory tests are kept as `unmapped`, with no syndrome.
- A development facility can be reached **only** through this rule: naming
  `SMART-SANDBOX` as a performer (by identifier or reference) is rejected.
- `GET /api/facilities` still returns only participating facilities
  (`?participation=all` includes development ones), so API-mode parity, the
  five-day demonstration and its scores (0, 24, 50, 74, 87) are unchanged.
  Migration `0004` adds the `participation` column; every existing facility
  is `participating`.

### Running the sandbox demonstration (Windows PowerShell)

```powershell
# 1. Backend, as for API mode
docker compose up -d db                       # from the repository root
cd backend
.venv\Scripts\Activate.ps1
alembic upgrade head                          # includes 0004
python -m app.seed                            # if not already seeded
uvicorn app.main:app --reload --port 8000

# 2. Frontend with SMART enabled (from the repository root, new terminal)
$env:VITE_DATA_SOURCE = "api"
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
$env:VITE_SMART_ENABLED = "true"
npm run dev
```

Then open <http://localhost:5173/labsentinel/smart-demo>.

- **EHR launch:** follow the page's *SMART Health IT launcher (prefilled)*
  link. On the launcher choose *Provider EHR Launch*, pick a patient
  (Synthea-generated patients have laboratory results) and a provider, and
  press *Launch*. The launcher opens `/smart/launch?iss=…&launch=…`.
- **Standalone launch:** press **Launch SMART Sandbox (Standalone)**, choose
  a patient on the sandbox login page (any password), then **Approve**.

The bridge needs API mode and, to store anything, `python -m app.seed.smart_sandbox`.

#### Presentation story (about 5 minutes)

1. Open **SMART on FHIR Sandbox** (`/smart-demo`). Read the disclaimer: synthetic
   sandbox data, not a production vendor connection.
2. Show the configuration: public client, no secret, the least-privilege
   scopes, and the launch and redirect URLs.
3. Open the prefilled SMART Health IT launcher and start a **Provider EHR
   Launch** for a synthetic patient.
4. LabSentinel receives `iss` + `launch`, fetches the server's SMART
   configuration and redirects to its authorization endpoint with PKCE.
5. Back at `/smart/callback`, the code is exchanged and removed from the
   address bar. The sidecar opens **Connected**, showing the EHR launch type,
   the practitioner reference and the patient context ID.
6. Open **View SMART Technical Details**: granted scopes, PKCE S256, expiry.
   No token appears anywhere on the page.
7. Point at **Regional Respiratory Activity**: LabSentinel's regional
   intelligence alongside the patient, the point of a sidecar.
8. Scroll to the sandbox laboratory Observations, labelled as sandbox data.
9. Press **Send Eligible Lab Observation to LabSentinel** before the sandbox
   facility exists: *no participating-facility mapping is configured*, and
   nothing is stored. Run `python -m app.seed.smart_sandbox`, send again: it
   is validated, normalized and stored against `SMART-SANDBOX`. Send once
   more: duplicate.
10. Return to **Dashboard** or **Simulation**: the five-day scores are still 0,
    24, 50, 74, 87. Close with the comparison table: simulated vendor sidecar,
    live SMART sandbox session, future production integration.

### Tests

- Frontend, no network: `src/smart/__tests__/` (configuration and scope
  validation, launch parsing, the adapter with `fhirclient` mocked, token
  hygiene, bridge payload and outcomes) and `src/pages/smart/__tests__/`
  (every route and state with SMART enabled and a mocked adapter; with SMART
  disabled, that no route loads the library or makes a request).
- Backend: the SMART tests in `tests/test_fhir_ingestion.py` (also run on
  PostgreSQL): no mapping, mapping only to the development facility (hidden
  from `/api/facilities`, demonstration unchanged), performer claims
  rejected, other sources not mapped, and the provisioning command.
- The live sandbox flow is **not** part of any automated suite. It was
  verified manually (headless Edge) against launch.smarthealthit.org: EHR
  and standalone launch, PKCE S256, granted scopes equal to the requested
  scopes, no token in the page or console, and the bridge's
  unmapped → created → duplicate sequence.

### Sandbox limitations

- Sandbox only. No Epic, Oracle Health or MEDITECH registration, and no
  production SMART server has been used.
- Public client only: no confidential or asymmetric (`private_key_jwt`)
  client authentication, no backend services, no token refresh. An expired
  session must be launched again.
- The SMART Health IT sandbox is a shared public service: its data are
  synthetic, can change, and include resources uploaded by other users.
- One patient compartment and one resource type (`Observation`) are read.
  The bridge sends one Observation at a time, on request. There is no
  scheduled or bulk (`$export`) retrieval.
- The launch and callback run in the browser. There is no server-side
  session, no CDS Hooks, and no audit of who launched or what was sent
  beyond the backend's ingestion audit.

## Dynamic surveillance engine (development)

> The Dynamic Surveillance Engine is a capstone prototype model and is not
> epidemiologically validated for production public-health decision-making.

The dynamic surveillance engine calculates surveillance signals from the
laboratory observations stored in PostgreSQL, instead of reading the frozen
demonstration's exported values:

```
FHIR / normalized laboratory observations
  -> PostgreSQL (lab_observation)
  -> daily aggregation            app/surveillance/aggregator.py
  -> dynamic baseline             app/surveillance/baseline.py
  -> facility rule, geography,    app/surveillance/engine.py, geography.py
     persistence
  -> components, Composite Outbreak Signal Score,
     Data Confidence              app/surveillance/scorer.py
  -> persisted dynamic signal     app/surveillance/persistence.py
     + audit events
  -> /api/surveillance/dynamic -> Dynamic Surveillance page, SMART sidecar
```

No calculation happens in a route handler. The engine is pure Python plus
one query per calculation, so it runs unchanged on PostgreSQL and on the
SQLite unit-test database.

### Two surveillance modes

| | Classroom Demo Mode | Dynamic Surveillance Mode |
|---|---|---|
| Data | The frozen five-day simulation (699 seeded observations, Nov 3-7 2025) | Observations in PostgreSQL outside the demonstration period |
| Signals | 5 seeded signals, `mode = 'demo'`, never recalculated | Calculated by the engine, `mode = 'dynamic'` |
| Baseline | Fixed: 100 tests, 8 % | Rolling mean of prior days (below) |
| Scores | 0 / 24 / 50 / 74 / 87 (Low, Watch, Moderate, High, Critical) | Whatever the data produce |
| API | `/api/signals`, `/api/demo` (unchanged) | `/api/surveillance/dynamic` |
| UI | Dashboard, Map, Signals, Simulation, header | `/dynamic-surveillance` (API mode), SMART sidecar when chosen |

The two are never mixed: every query filters on `mode`, the demo endpoints
return only demo signals, the dynamic endpoints only dynamic ones, and a
dynamic signal's id is not found at `/api/signals/{id}` (and vice versa).

### How the existing models are reused

Inspection before building the engine found:

- **LabObservation** already holds everything the engine needs: the mapped
  syndrome, the normalized `Positive` / `Negative` result, facility,
  surveillance area, effective and received times, specimen type and
  terminology status. No observation column was added.
- **SurveillanceSignal** had one row per (syndrome, date) and required a
  score. Migration `0005` adds `mode`, keys signals on
  (mode, syndrome, date), allows an unscored dynamic signal, and adds the
  explainability columns. Demo rows are untouched.
- **The scorer and Data Confidence** existed only in the frontend
  (`src/lib/signalScore.ts`, `src/lib/dataConfidence.ts`); the backend
  persisted their exported results. `app/surveillance/scorer.py` ports them
  exactly: same weights, same normalization, same severity and confidence
  bands, and the same half-up rounding as JavaScript's `Math.round`. A test
  reads the weights out of the TypeScript source, and another feeds the
  frozen demonstration's own inputs through the Python scorer and gets
  0 / 24 / 50 / 74 / 87 (the demonstration itself is never recalculated).
- **The demo-period rule** (FHIR ingestion rejects effective times inside
  Nov 3-7 2025) is kept: the engine never reads that period and refuses to
  score a date inside it.
- **Facility participation** (Phase 6) decides who counts: development
  sources such as the SMART sandbox facility never do.
- **SimulationContext** and the classroom pages are not touched. The
  dynamic UI is a separate route with its own client.

### Eligible observations

An observation counts towards a syndrome on a surveillance day when:

1. its LOINC code is mapped to that syndrome (`terminology_status = 'mapped'`);
2. its status is `final`, `amended` or `corrected`;
3. it comes from an active **participating** facility;
4. its effective time falls on that calendar day in `America/New_York`;
5. it is outside the frozen demonstration period.

Each such observation is one **test**. For **positivity**, only normalized
`Positive` and `Negative` results count; any other result (a number, text)
is a test with an indeterminate result, never a positive or a negative, and
lowers Data Integrity. Unmapped observations are read only to measure
terminology mapping quality.

### Baseline method

For surveillance date D, with `baseline_window_days = 7` and
`min_baseline_days = 5` (development defaults, `app/surveillance/types.py`):

- The window is **D-7 through D-1**. D and later days are never read: no
  data leakage. (A test ingests 30 later observations and shows an earlier
  day's calculation is unchanged.)
- An **observed day** is a window day with at least one eligible test. Days
  without data are left out, not counted as zero: a silent feed is unknown,
  not a quiet day.
- **Baseline volume** = total eligible tests / observed days.
- **Baseline positivity** = total positives / total Positive-or-Negative
  results over the observed days (pooled).
- With fewer than 5 observed days there is **no baseline**: the signal is
  stored as `INSUFFICIENT_BASELINE`, with no score, severity or baseline,
  and the UI says: *Insufficient historical data to calculate a dynamic
  surveillance baseline.* A date with no eligible observations is `NO_DATA`
  (*absence of data is not evidence of normal activity*). Nothing is
  invented.

The same method gives each facility its own baseline.

The frozen demonstration's 100 tests / 8 % is **not** used. For a
demonstration, the synthetic dynamic dataset (below) provides 14 days of
history. A plain rolling mean absorbs a sustained rise into its own baseline
within a week; that is a known limitation of this first method.

### Components and the Composite Outbreak Signal Score

The existing LabSentinel weights, unchanged:

| Component | Weight | Raw value | Normalized (0-100) |
|---|---|---|---|
| Test Volume | 25 % | (tests - baseline tests) / baseline tests x 100 | the percentage, clamped to 0-100 |
| Positivity | 30 % | positivity - baseline positivity, in points | points / 15 x 100, clamped |
| Affected Facilities | 20 % | abnormal / participating facilities | share x 100 |
| Geographic Spread | 15 % | affected / participating surveillance areas | share x 100 |
| Persistence | 10 % | consecutive abnormal days | days / 4 x 100, clamped |

Composite = sum of normalized x weight, rounded half up. Severity:
0-19 Low, 20-39 Watch, 40-64 Moderate, 65-84 High, 85-100 Critical.

**Participating facilities** are the participating facilities that reported
the syndrome on D or on any day of the baseline window. A facility that goes
silent stays in the denominator (its silence lowers Data Confidence).
**Participating areas** are those facilities' surveillance areas.

### Affected-facility rule

A facility is **ABNORMAL** on D when all hold:

1. it has its own sufficient baseline;
2. it reported at least **10** eligible tests on D (minimum observation count);
3. its test volume is at least **+25 %** above its baseline mean, **or** its
   positivity is at least **+5 percentage points** above its baseline
   positivity (both thresholds inclusive).

Otherwise it is NORMAL, BELOW_MINIMUM, INSUFFICIENT_BASELINE or
NOT_REPORTING, and is not counted as affected. The reasons that met the rule
are stored with each facility (for example `volume +30.0% (threshold +25%)`).

### Geographic spread

Affected areas are the surveillance areas (configured postal codes, with
their subregion / region / country from the facility geography) of the
abnormal facilities. No patient location is read. Counts are aggregates;
the UI applies the existing small-count rule (fewer than 5 positives are
shown as `<5` and reported at the broader level).

### Persistence rule

A day is **abnormal** when at least one facility is ABNORMAL. Persistence on
D is 0 when D is not abnormal; otherwise 1 + the persistence of the stored
dynamic signal for D-1 when that day was abnormal, else 1 (it resets). It is
read from the **dynamic** signal history, never from the classroom
demonstration. A range is always recalculated in date order, so each day
builds on the one before.

### Data Confidence

Calculated with the prototype's framework and weights, stored in its own
columns, never combined with the outbreak score:

| Input (weight) | From the stored observations |
|---|---|
| Feed Freshness (30 %) | Each reporting facility's median reporting delay (received - effective time) through the prototype's curve (100 at 5 minutes or less, 0 at 120 or more), averaged; a facility without received times scores 0 |
| Completeness (25 %) | Specimen type and received time populated, pooled |
| Terminology Mapping (20 %) | Laboratory observations whose LOINC code is mapped, pooled |
| Facility Participation (15 %) | Reporting / participating facilities |
| Data Integrity (10 %) | 4 points lost per 1 % of eligible observations with an indeterminate result or a received time before the effective time |

### Explainability

Every dynamic signal stores its score and severity together with:

- `calculation_status`
- the five normalized component scores, as columns
- `calculated_at`
- `calculation_metadata`, a JSON object holding:
  - the engine version and configuration, plus the method descriptions;
  - current counts (tests, positive, negative, indeterminate);
  - the baseline window, its observed days and its values;
  - the volume and positivity changes;
  - each component's raw values, normalized score, weighted contribution and points;
  - the unrounded composite;
  - per facility: tests, positives, positivity, own baseline, changes, status and reasons;
  - participating and affected areas;
  - persistence and the previous day it built on;
  - the Data Confidence components.

It holds aggregate counts only: no patient reference is stored or shown.

### Database: migration 0005

`alembic upgrade head` applies `0005_dynamic_surveillance_signals`:

- `surveillance_signal.mode` (`demo` | `dynamic`, default `demo`: every
  existing row becomes a demo signal);
- unique key `(mode, syndrome, signal_date)` instead of `(syndrome, signal_date)`;
- `calculation_status` (`CALCULATED` | `INSUFFICIENT_BASELINE` | `NO_DATA`);
- `composite_score`, `severity`, `baseline_volume`, `baseline_positivity_rate`
  become nullable. A check still requires them on every CALCULATED signal,
  and another requires every demo signal to be CALCULATED;
- five component-score columns (0-100 checked), `calculation_metadata`
  (JSONB) and `calculated_at`.

The downgrade refuses to run while dynamic signals exist (restoring NOT NULL
would need values that were never calculated); clear them first with
`python -m app.surveillance.run --clear`.

### API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/surveillance/dynamic/signals` | Dynamic signal history, oldest first. Filters: `syndrome`, `date_from`, `date_to`, `facility` (signals that facility contributed abnormal activity to) |
| GET | `/api/surveillance/dynamic/signals/current` | The latest dynamic signal, or the one for `date`; `404` if none |
| GET | `/api/surveillance/dynamic/signals/{id}` | One dynamic signal with its full `calculation`; `404` for a demo signal's id |
| GET | `/api/surveillance/dynamic/summary` | Latest signal, history extent, method, weights, disclaimer, `recalculation_available` |
| POST | `/api/surveillance/dynamic/recalculate` | **Development only** (`404` otherwise). Body `{}` (every date with eligible observations) or `{"date_from": "...", "date_to": "..."}`; runs the engine and returns what changed. It accepts no signal values, and demo-period dates are skipped |

There is no endpoint that writes a signal's values. CORS allows `POST` only
when `APP_ENV=development`.

### Commands

```powershell
# from backend\
python -m app.seed.dynamic_dataset                   # synthetic dynamic dataset, every phase (48 days)
python -m app.seed.dynamic_dataset --phase history   # Nov 27-Dec 24 only (the EWMA reference)
python -m app.seed.dynamic_dataset --phase baseline  # Jan 1-14 only
python -m app.seed.dynamic_dataset --phase outbreak  # Jan 15-20 only
python -m app.seed.dynamic_dataset --remove          # remove its observations

python -m app.surveillance.run                       # every date with eligible observations
python -m app.surveillance.run --date 2026-01-20     # one date (persistence reads 2026-01-19)
python -m app.surveillance.run --from 2026-01-01 --to 2026-01-20
python -m app.surveillance.run --clear               # remove every dynamic signal
```

Both refuse to run with `APP_ENV=production`. The engine is idempotent:
running a date again reconciles its signal (`unchanged` if nothing
changed) instead of adding one.

**Recalculation is manual.** FHIR ingestion does not trigger it, so a
failed recalculation can never fail an ingestion. The FHIR Ingestion page
offers a **Recalculate Dynamic Surveillance** button after a successful
ingestion instead.

Audit events use only aggregate figures:
- `surveillance.dynamic.calculated`, when a new signal is stored;
- `surveillance.dynamic.recalculated`, when a stored signal's values changed;
- `surveillance.dynamic.severity_changed`;
- `surveillance.dynamic.cleared`;
- `seed.dynamic_dataset` and `seed.dynamic_dataset.removed`.

The FHIR cleanup command above (`DELETE ... LIKE 'fhir:%'`) also removes
the dynamic dataset, which is FHIR-ingested. To keep the dataset, add
`AND source_system NOT LIKE 'fhir:urn:labsentinel:synthetic:dynamic-surveillance:%'`.

### The synthetic dynamic dataset and its story

`app/seed/dynamic_dataset.py` holds 2,589 deterministic synthetic FHIR R4
Observations at the three participating facilities, in three phases:

- **history**: Nov 27-Dec 24 2025, 1,422 observations. Added in Phase 8 as
  the EWMA reference period.
- **baseline**: Jan 1-14 2026, 687 observations.
- **outbreak**: Jan 15-20 2026, 480 observations.

A reporting gap (Dec 25-31, no results) separates the history from January.
The gap keeps the history outside every January composite baseline window,
so the January results below are the same as in Phase 7. They
are sent through the **real FHIR ingestion pipeline**, each with a simulated
delivery time 12-54 minutes after collection. They are ordinary
FHIR-ingested rows, separate from the demonstration's 699, and never reuse
them. Shrewsbury Community also sends one SARS-CoV-2 result a day under
LOINC 94309-2, which is not mapped: it is stored and never counted, and it
shows in terminology mapping quality.

What the engine calculates from them (dataset alone):

| Date | What happens | Score |
|---|---|---|
| Nov 27-Dec 24 | In-control history with ordinary Poisson / binomial variation | Nov 27-Dec 1 insufficient; then mostly Low, with Watch on 7 days and Moderate on 4 from small-count noise (see [EWMA](#early-detection-analysis-predefined-parameters-dataset-alone)) |
| Dec 25-31 | Reporting gap | NO_DATA |
| Jan 1-5 | Too little recent history for the 7-day window | INSUFFICIENT_BASELINE |
| Jan 6-14 | Steady baseline, about 48 tests and 8 % positive a day | 0-6, Low |
| Jan 15 | Worcester Central (HOSP-A): tests +30 %, positivity 15 % | 25, Watch |
| Jan 16 | Central Mass Regional (HOSP-B) abnormal by positivity | 54, Moderate |
| Jan 17 | Shrewsbury Community (HOSP-C) joins: all 3 facilities, 3 areas | 80, High |
| Jan 18 | Persistence reaches 4 days | 85, Critical |
| Jan 19-20 | Positivity keeps climbing | 90, Critical |

Nothing sets a score: change the data and the scores change (the FHIR
fixtures, for example, add results on Jan 12 and Jan 16).

### Hand-calculated validation

Jan 6, Jan 15, Jan 17 and Jan 20 were calculated by hand from the dataset's
own table and are asserted exactly in `tests/test_dynamic_surveillance.py`,
with the arithmetic in each test's docstring. Jan 15 is worked through here:

```
Baseline window Jan 8-14 (7 observed days)
  tests      48+49+47+48+49+48+47 = 336  -> 48.0 a day
  positives   3+ 4+ 3+ 4+ 3+ 5+ 3 =  25  -> 25/336 = 7.4405 %
Jan 15: 26 + 16 + 12 = 54 tests, 4 + 1 + 1 = 6 positive -> 11.1111 %
  volume      (54-48)/48 = +12.5 %                    -> 12.5000 x 0.25 =  3.1250
  positivity  11.1111 - 7.4405 = +3.6706 pts / 15     -> 24.4709 x 0.30 =  7.3413
  facilities  HOSP-A: 26 vs 20.0 (+30 %), 15.4 % vs 7.1 % -> abnormal
              HOSP-B, HOSP-C within thresholds         -> 1/3 = 33.33 x 0.20 = 6.6667
  geography   01604 of 3 areas                         -> 33.33 x 0.15 =  5.0000
  persistence 1 day (Jan 14 not abnormal)              -> 25.00 x 0.10 =  2.5000
  composite   24.6329 -> 25, Watch
```

### Frontend

- **Dynamic Surveillance** (`/dynamic-surveillance`, listed in the
  navigation in API mode only; local mode shows a notice and sends nothing).
  It shows:
  - a *DYNAMIC SURVEILLANCE MODE* banner, saying the classroom pages and the
    header still show the frozen simulation;
  - a surveillance date selector;
  - syndrome, date, current and baseline tests, volume change, current and
    baseline positivity, positivity change, affected facilities and areas,
    persistence, the Composite Outbreak Signal Score, severity, Data
    Confidence and last calculated time;
  - the insufficient-baseline message;
  - **Why this dynamic signal?** (the five questions and the weighted table,
    labelled *Dynamic calculation from persisted laboratory observations*);
  - aggregate provenance per facility, using the existing privacy rule;
  - Data Confidence;
  - the signal history and the method;
  - **Recalculate Dynamic Surveillance** (development only).
- **FHIR Ingestion**: after a successful ingestion, *Observation persisted.
  Dynamic surveillance can now be recalculated.* with the recalculate button.
- **SMART sidecar**: in API mode the Regional Respiratory Activity panel has
  a **Demo Surveillance / Dynamic Surveillance** choice. The default is Demo,
  and each view is labelled, so it never switches silently.

### Manual full-stack demonstration (Windows PowerShell)

```powershell
# 1-2. PostgreSQL and FastAPI (from the repository root, then backend\)
docker compose up -d db
cd backend; .venv\Scripts\Activate.ps1; alembic upgrade head; python -m app.seed
uvicorn app.main:app --reload --port 8000

# 3. React in API mode (repository root, new terminal; add VITE_SMART_ENABLED=true for step 13)
$env:VITE_DATA_SOURCE = "api"; $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"; npm run dev
```

4. Open <http://localhost:5173/labsentinel/dynamic-surveillance>. With
   nothing calculated it says so.
5. `python -m app.seed.dynamic_dataset --phase baseline`, then
   **Recalculate Dynamic Surveillance**. Jan 14 is Low with a baseline of
   about 48 tests. Pick Jan 3 to show *Insufficient historical data*.
6. `python -m app.seed.dynamic_dataset --phase outbreak` (FHIR observations
   arriving). Optionally ingest the *Influenza A positive* fixture on the
   FHIR Ingestion page and use its recalculate prompt.
7. **Recalculate Dynamic Surveillance**.
8-10. Jan 20: tests, positivity, affected facilities and areas, and the score
   and severity. The history shows Watch, Moderate, High, then Critical.
11. **Why this dynamic signal?** and the weighted table.
12. Data Confidence, and why it is separate.
13. Launch the SMART sidecar
    ([SMART on FHIR sandbox launch](#smart-on-fhir-sandbox-launch-development)).
14. Choose **Dynamic Surveillance** in its regional panel: the same dynamic
    regional signal, labelled.
15. Open **Simulation**: the frozen Day 1-5 scores are still 0, 24, 50, 74, 87.

### Tests

- `tests/test_surveillance_scorer.py` (no database, 28 tests):
  - weights read from the TypeScript source;
  - the frozen 0/24/50/74/87 reproduced from its own inputs;
  - rounding, severity bands and each component;
  - a hand-calculated composite and Data Confidence;
  - the baseline window, leakage, days without data, insufficient history
    and indeterminate results.
- `tests/test_dynamic_surveillance.py` (27 tests), re-run on PostgreSQL by
  `tests/integration/test_dynamic_surveillance_postgres.py`:
  - the dataset through the FHIR pipeline;
  - the hand-calculated dates, the facility rule (including the inclusive
    +25 % boundary), geography, persistence progression and reset, no
    leakage, and exclusion of development sources and the demonstration
    period;
  - Data Confidence, and the explainability metadata;
  - idempotency, recalculation of the same row, and the audit events,
    including a severity change;
  - demo/dynamic separation, including that re-seeding the demonstration
    leaves dynamic signals alone;
  - the API with its filters and the development-only recalculation;
  - the commands.
- `tests/test_migrations.py`: 0005 keeps demo rows, enforces the new
  constraints, and refuses to downgrade over dynamic signals.

### Dynamic surveillance limitations

- A capstone prototype model, not epidemiologically validated. The
  thresholds (+25 %, +5 points, 10 tests, 5 of 7 days) are illustrative, not
  production outbreak thresholds.
- The baseline is a plain rolling mean: no seasonality, day-of-week
  adjustment or guard band, so a sustained rise raises its own baseline.
  CUSUM, EWMA, Farrington-type methods and machine learning are later phases.
- Daily aggregation only, one time zone, one syndrome surveilled today.
- Small counts make the facility rule noisy; the minimum-test rule only
  partly guards against it.
- Recalculation is manual (CLI or the development endpoint); there is no
  scheduler or event-driven trigger, and a very long history is recalculated
  in one request (up to 366 days).
- On realistic day-to-day variation (the Phase 8 history), the facility
  rule raises Watch/Moderate on some in-control days: it is sensitive to
  small counts.
- Data Confidence's freshness is reporting delay (timeliness) of the stored
  results, not a live feed heartbeat; there is no record of failed or
  duplicate deliveries to feed Data Integrity.
- The classroom pages (Dashboard, Map, Signals, Simulation, header) show only
  the frozen demonstration. Dynamic signals appear on the Dynamic
  Surveillance page and, when chosen, in the SMART sidecar.

## EWMA statistical detector (experimental)

> **Experimental Statistical Surveillance.** EWMA is an experimental
> statistical surveillance method in this capstone and has not been validated
> for production epidemiological decision-making. A statistical alert is not a
> confirmed outbreak.

### Why EWMA was added

The Composite Outbreak Signal Score is a rule-based, multi-factor score. Phase 8
adds a secondary, independent **statistical time-series** detector to ask:

> Does a statistical time-series method independently detect a sustained shift
> in laboratory activity?

EWMA runs **beside** the composite and never modifies it:

```
persisted observations -> dynamic aggregation (same eligibility as the engine)
   ├── Composite Outbreak Signal Score   (surveillance_signal, unchanged)
   └── EWMA per metric                   (statistical_signal, new)
            -> alert state -> side-by-side comparison, never combined
```

The code is in `backend/app/statistics/`:

| Module | Contents |
|---|---|
| `types.py` | Configuration and result types |
| `ewma.py` | The pure formulas |
| `service.py` | Daily series, agreement, early-detection and sensitivity analysis |
| `persistence.py` | Idempotent storage and audit events |
| `run.py` | The command |

### The formula

For each metric's daily regional series Y_t (test volume, or positivity in
percent, computed from eligible Positive and Negative results only, exactly
as the dynamic engine does):

```
reference   mu = mean, s = sample SD of Y over the reference period
start       EWMA_0 = mu
recursion   EWMA_t = lambda * Y_t + (1 - lambda) * EWMA_(t-1)
limits      sigma_t = s * sqrt( lambda / (2 - lambda) * (1 - (1 - lambda)^(2t)) )
            UCL_t   = mu + k * sigma_t
            WL_t    = mu + warning_fraction * k * sigma_t
state       STATISTICAL ALERT if EWMA_t > UCL_t
            WATCH             if EWMA_t > WL_t
            NORMAL            otherwise
```

- **t** counts EWMA updates, that is, days with data since monitoring began.
  A day without data (for example the Dec 25-31 reporting gap) does not
  update the EWMA; the value is carried forward and stored as `NO_DATA`.
- **Control limits** are the exact **time-varying** limits (Montgomery,
  *Introduction to Statistical Quality Control*). They are narrower for the
  first few updates and converge to the long-run limit
  mu + k·s·sqrt(lambda / (2 - lambda)), which is stored alongside for
  reference.
- **One-sided:** only the upper limit is used. LabSentinel watches for
  increases, so falls are never flagged.

| Parameter | Default | Notes |
|---|---|---|
| lambda | **0.25** | A common textbook starting point, **not** an epidemiologically validated choice. Configurable (`EwmaConfig.lam`) |
| k | **3** | Control-limit multiplier |
| warning fraction | **2/3** | WATCH begins two thirds of the way from the mean to the UCL: a 2-sigma warning limit when k = 3 |
| reference days | **28** | The reference period is the first 28 calendar days of eligible history; monitoring starts the day after |
| minimum reference days | **21** | Days with data required in the reference period |

Every stored result records lambda, k and the full configuration.

### Baseline (reference) requirements

- The reference period is fixed and strictly **before** every monitored date.
  Each day's EWMA uses only that day and earlier days, so there is no
  future-data leakage; a test adds a huge later value and shows earlier days
  are unchanged.
- Fewer than 21 reference days with data gives `INSUFFICIENT_BASELINE`. A
  reference SD of zero gives `INSUFFICIENT_VARIANCE`. Neither produces a
  limit or a state: nothing divides by zero and no limit is invented.
- **The Phase 7 dataset was not enough.** Its 14 baseline days are nearly
  constant (regional volume SD 0.73 tests a day, against about 6.9 expected
  from ordinary Poisson variation at 48 tests). That would give a volume UCL
  of 48.9 tests, so an ordinary 49-test day would push EWMA toward an alert.
  The synthetic dataset therefore gained an in-control **history** phase:
  - Nov 27-Dec 24 2025, 28 days and 1,422 observations;
  - drawn once from Poisson(20 / 16 / 12) tests and Binomial(n, 8 %)
    positives with a fixed seed, then frozen as literal tables;
  - the first draw was kept as it came.

  A Dec 25-31 reporting gap keeps this history outside every January
  composite baseline window, so every Phase 7 composite result is unchanged.
  The frozen classroom dataset is not touched.

  Reference statistics:

  | Metric | Mean | SD |
  |---|---|---|
  | Volume | 49.79 tests | 7.99 |
  | Positivity | 7.49 % | 4.21 points |

### Volume EWMA and positivity EWMA

The two metrics are calculated, stored and shown **separately**, never merged
into one number. For each date and metric, `statistical_signal` stores and the
API returns:
- the observed value;
- the reference mean and SD;
- the previous EWMA and the EWMA;
- the UCL, the warning limit and the distance from the UCL;
- the state, lambda and k;
- the update count and the reference period;
- a plain-language interpretation, for example *"The exponentially weighted
  positivity signal exceeded its historical control limit."*

**Overall state:** STATISTICAL ALERT if either metric is above its UCL, WATCH
if either is above its warning limit, otherwise NORMAL (shown as *No
statistical alert*). This is not a score.

### Composite vs EWMA, and agreement

The UI shows the composite (score, severity) and EWMA (volume state,
positivity state, overall) side by side. An agreement state only describes
whether they concur:

| Agreement | When |
|---|---|
| BOTH METHODS SIGNAL | Composite High/Critical **and** EWMA above a UCL |
| COMPOSITE ONLY | Composite High/Critical, EWMA not above a UCL |
| EWMA ONLY | EWMA above a UCL, composite below High |
| NEITHER | Neither |
| NOT AVAILABLE | One method has no result for the date |

Each method's *signal* is its alert level: composite High or Critical, and
EWMA STATISTICAL ALERT. Composite Watch/Moderate and EWMA WATCH are early
warnings: they are shown but do not count as a signal.

### Early detection analysis (predefined parameters, dataset alone)

Parameters were fixed before looking at the results (lambda 0.25, k 3). The
evaluation period is the EWMA monitoring period (Dec 25 2025 - Jan 20 2026);
the synthetic outbreak begins Jan 15.

| Method | Watch | Moderate | High / Statistical Alert | Critical |
|---|---|---|---|---|
| Composite | Jan 15 | Jan 16 | Jan 17 | Jan 18 |
| Volume EWMA | Jan 17 | — | Jan 18 | — |
| Positivity EWMA | Jan 16 | — | Jan 17 | — |

EWMA lead (+) or lag (−) in days against the composite's bands:

| | vs Watch | vs Moderate | vs High | vs Critical |
|---|---|---|---|---|
| Positivity EWMA alert (Jan 17) | −2 | −1 | **0** | +1 |
| Volume EWMA alert (Jan 18) | −3 | −2 | −1 | 0 |
| Positivity EWMA watch (Jan 16) | −1 | 0 | +1 | +2 |

**Finding.** On this dataset EWMA does **not** detect earlier than the
composite:
- its first statistical alert (positivity, Jan 17) comes the same day the
  composite reaches High, and 2 days after the composite's first Watch;
- volume EWMA is a day later again.

EWMA independently **confirms** the shift, from a different principle.

Neither method alarmed on the in-control January days (Jan 1-14) that both
monitored. On the realistic in-control history (the EWMA reference period, not
monitored by EWMA), the composite's facility rule reached Watch on 7 and
Moderate on 4 of its 23 scored days, from ordinary day-to-day noise at small
counts. That is a
documented limitation of the rule, and a reason a statistical detector is
worth having alongside it.

With the Phase 5 FHIR fixtures also ingested (extra results on Jan 12 and
Jan 16), the composite reaches High on Jan 16, so EWMA's first alert is then
one day **after** High. On Jan 16 the agreement reads COMPOSITE ONLY.

### Lambda sensitivity (development analysis only)

`python -m app.statistics.run --report` recomputes EWMA for lambda 0.15,
0.20, 0.25 and 0.30. Nothing is stored and no alternative becomes an alert.
Dataset alone, k 3:

| lambda | Volume watch / alert | Positivity watch / alert | Overall alert vs composite High | State changes (vol / pos) | Non-normal days before onset |
|---|---|---|---|---|---|
| 0.15 | Jan 18 / Jan 18 | Jan 17 / Jan 17 | same day | 1 / 1 | 0 |
| 0.20 | Jan 17 / Jan 18 | Jan 17 / Jan 17 | same day | 2 / 1 | 0 |
| 0.25 | Jan 17 / Jan 18 | Jan 16 / Jan 17 | same day | 2 / 2 | 0 |
| 0.30 | Jan 17 / Jan 18 | Jan 16 / Jan 17 | same day | 2 / 2 | 0 |

- **Alert dates do not depend on lambda** over this range; only the WATCH
  (early-warning) dates move, by at most a day.
- Smaller lambda smooths more. At 0.15 both metrics jump straight from NORMAL
  to STATISTICAL ALERT, so the warning stage is lost.
- No lambda raised a false WATCH before the onset.
- 0.25 stays the default because it was chosen in advance and keeps a
  one-day warning stage on positivity. It was **not** chosen for the earliest
  alert, since all four alert on the same day. One synthetic outbreak cannot
  validate any value.

### Hand-calculated validation

The following are calculated by hand and asserted in
`tests/test_ewma_surveillance.py`, with the arithmetic in each docstring:
- the reference mean and SD;
- positivity on Jan 15, 16 and 17;
- volume on Jan 16, 17 and 18.

Small examples in `tests/test_ewma.py` check the recursion, the limit
factors (sigma_1 = lambda·s exactly) and the three states.

| Positivity | Jan 15 | Jan 16 | Jan 17 |
|---|---|---|---|
| Previous EWMA | 7.6272 | 8.4982 | 10.8091 |
| Observed | 6/54 = 11.1111 % | 11/62 = 17.7419 % | 17/73 = 23.2877 % |
| EWMA = 0.25·Y + 0.75·prev | 8.4982 | 10.8091 | 13.9287 |
| Mean / SD | 7.4874 / 4.2133 | same | same |
| t, factor | 15, 0.377931 | 16, 0.377945 | 17, 0.377954 |
| UCL = mean + 3·SD·factor | 12.2644 | 12.2645 | 12.2647 |
| WL = mean + 2·SD·factor | 10.6720 | 10.6722 | 10.6722 |
| Result | NORMAL | **WATCH** (above WL) | **STATISTICAL ALERT** (above UCL) |

### Database: migration 0006

`statistical_signal` is a new table. It never touches `surveillance_signal`.

- **Key:** unique on (mode, method, syndrome, signal_date, metric). The
  method is part of the key so a later detector can sit beside EWMA.
- **Values:** the stored values listed above, plus `calculation_metadata`
  (the reference period, update number, limit factors, formula and
  configuration).
- **Checks:**
  - mode, method, metric, status and state;
  - every CALCULATED row is complete;
  - 0 < lambda ≤ 1 and k > 0.
- **Downgrade:** drops the table.

### API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/statistics/ewma` | Label, disclaimer, configuration, formula, reference statistics, extent, early-detection analysis, agreement rule |
| GET | `/api/statistics/ewma/current` | Both metrics for `date` (default: the latest monitored date), the overall state, the composite for that date, and the agreement |
| GET | `/api/statistics/ewma/history` | Daily results; filters `metric`, `date_from`, `date_to`, `syndrome` |
| POST | `/api/statistics/ewma/recalculate` | **Development only** (`404` otherwise). Recomputes from persisted observations; accepts no values |

### Commands and recalculation

```powershell
python -m app.statistics.run            # recompute and store (idempotent)
python -m app.statistics.run --report   # plus early-detection and lambda sensitivity (not stored)
python -m app.statistics.run --clear    # remove stored EWMA results
```

Because EWMA is recursive, a recalculation recomputes the whole series from
the persisted observations. It reconciles one row per date and metric,
leaves unchanged rows alone and removes rows for dates no longer present.

The pipeline is: FHIR → PostgreSQL → dynamic aggregation → EWMA → UI. EWMA
is never calculated from browser data. After a FHIR ingestion, recalculate
Dynamic Surveillance (for the composite), then EWMA. They are separate on
purpose.

Audit events hold aggregate figures only:
- `statistics.ewma.calculated`
- `statistics.ewma.recalculated`
- `statistics.ewma.state_changed`, one per metric and date, for example
  *"Positivity EWMA … on 2026-01-16 changed from Watch to Statistical Alert
  (EWMA 15.82 vs UCL 12.26)"*
- `statistics.ewma.cleared`

### UI

- **Dynamic Surveillance → Statistical Surveillance**, labelled
  *Experimental Statistical Surveillance* with the prototype-detector note. It
  has:
  - **Test Volume EWMA** and **Positivity EWMA** panels, each with observed,
    historical mean (SD), previous and current EWMA, UCL, warning limit,
    whether the limit was crossed, lambda and k, the historical period, a
    plain-language interpretation and a small EWMA-vs-UCL trend;
  - **Detection Comparison** (composite vs EWMA, agreement and explanation,
    never combined);
  - an **EWMA trend** chart (observed, EWMA, historical mean, UCL) with a
    Test Volume / Positivity switch and a screen-reader table;
  - **Detection timing**;
  - **Recalculate EWMA** (development only).

  If EWMA fails to load, the composite view still works.
- **SMART sidecar** (Dynamic Surveillance chosen): one line, *Statistical
  Detector: EWMA Alert / Watch / Normal*, a note that it is experimental, and
  **View Statistical Details** (linking to the section). There is no
  control-chart maths in the sidecar.

### Manual full-stack demonstration

1. Open Dynamic Surveillance.
2. Load the dataset:
   `python -m app.seed.dynamic_dataset; python -m app.surveillance.run`.
   **Recalculate EWMA** from the empty state.
3. Pick **Jan 10**, a baseline day: composite 0, both EWMAs Normal,
   agreement Neither.
4. Step through **Jan 14 → Jan 20**:
   - positivity EWMA reaches WATCH on Jan 16 and STATISTICAL ALERT on Jan 17;
   - volume reaches WATCH on Jan 17 and alerts on Jan 18;
   - read **Detection timing**.
5. On FHIR Ingestion, ingest the *respiratory panel Bundle* (Jan 16), then:
   - **Recalculate Dynamic Surveillance** from the prompt;
   - **Recalculate EWMA**.

   Jan 16 changes, for example to COMPOSITE ONLY.
6. Launch the SMART sidecar and choose Dynamic Surveillance: *Statistical
   Detector: EWMA Alert*.
7. Check that Simulation (Day 1-5) is still 0 / 24 / 50 / 74 / 87.

### Tests

- `tests/test_ewma.py` (17, no database): recursion, lambda handling and
  validation, limit factors, reference mean and SD, insufficient baseline,
  zero variance, the hand-worked states, one-sidedness, carry-forward, no
  leakage, overall state and agreement.
- `tests/test_ewma_surveillance.py` (15), re-run on PostgreSQL by
  `tests/integration/test_ewma_surveillance_postgres.py`:
  - the dataset hand calculations and the reporting gap;
  - in-control normality;
  - detection analysis and sensitivity (nothing stored);
  - idempotency;
  - FHIR-driven recalculation with audit events;
  - that the composite and the demonstration are untouched;
  - the API with filters, and development-only recalculation;
  - the command.

### EWMA limitations

- Experimental and not validated: lambda, k, the warning fraction and the
  reference length are illustrative defaults.
- One fixed reference period, the first 28 days of history. It is not
  refreshed as time passes, and it assumes that period was in control.
- Daily regional series only: no per-facility EWMA, no day-of-week or
  seasonal adjustment.
- Positivity uses the empirical SD of daily rates, not a binomial variance
  that depends on each day's test count, so days with few tests are weighted
  like busy ones.
- One synthetic outbreak cannot establish sensitivity, specificity or
  timeliness.
- No multi-method combination and no machine learning. CUSUM was added in
  Phase 9 as a separate third method (below), never combined with EWMA.

## CUSUM statistical detector and three-method comparison (experimental)

> **Experimental Statistical Surveillance.** CUSUM is an experimental
> statistical surveillance method in this capstone and has not been
> epidemiologically validated for production decision-making. A statistical
> alert is not a confirmed outbreak.

### The capstone detector set is complete

| # | Method | Kind | Stored in |
|---|---|---|---|
| 1 | Composite Outbreak Signal Score | Multi-factor, rule-based | `surveillance_signal` |
| 2 | EWMA | Statistical: smoothed shift | `statistical_signal`, method `EWMA` |
| 3 | CUSUM | Statistical: cumulative sustained deviation | `statistical_signal`, method `CUSUM` |

The three run independently on the same dynamic aggregation, and are compared
but **never mathematically combined**. No further method (machine learning,
Shewhart, Bayesian detectors, scan statistics, other control charts) is part
of this build; those belong to future research.

### What CUSUM is

CUSUM (cumulative sum) adds up how far each day is above normal, and raises
an alert when the accumulated excess is large enough. A single high day adds a
little; several moderately high days in a row add up. Days at or below normal
drain the sum back towards zero.

### The formula (one-sided upper CUSUM, standardized)

```
z_t = (Y_t - mean) / SD                 standardized deviation
C_0 = 0
C_t = max(0, C_(t-1) + z_t - k)         k = reference (slack) value
STATISTICAL ALERT when C_t >= h         h = decision limit
```

| Parameter | Default | Meaning |
|---|---|---|
| k | **0.5** | A day must be more than k SDs above the mean to add to the sum |
| h | **5.0** | The sum at which CUSUM signals (inclusive: C_t ≥ h) |

- These are illustrative prototype values: a textbook pairing, not an
  epidemiologically validated one. Both are configurable (`CusumConfig`).
- **One-sided:** upper only, because LabSentinel watches for increases.
  There is no downward CUSUM.
- **Reset:** only the `max(0, …)`. An alert does not reset the sum, and
  nothing another detector does affects it. C_t depends only on C_(t−1),
  z_t and k.
- **Days without data** (the Dec 25-31 gap) do not update the sum; it is
  carried forward.
- **States:** the formal states are NORMAL and STATISTICAL ALERT only.
  *Approaching the limit* (C_t / h ≥ 0.75 while NORMAL) is an
  **informational display note**, not a statistical alarm: the formal state
  stays NORMAL until C_t reaches h.

### Baseline: the same reference as EWMA

For a fair comparison, CUSUM takes its reference from **EWMA's own reference
routine and settings** (`ewma.reference_for`, 28-day period, at least 21 days
with data). The baseline is therefore identical by construction:

| Metric | Mean | SD |
|---|---|---|
| Volume | 49.79 tests | 7.99 |
| Positivity | 7.49 % | 4.21 |

The reference period is Nov 27-Dec 24 2025. A test asserts that CUSUM and
EWMA store the same mean, SD and period. Fewer than 21 reference days gives
`INSUFFICIENT_BASELINE`; zero SD gives `INSUFFICIENT_VARIANCE`. Neither
produces a z-score, a sum or a state.

**Positivity:** CUSUM uses the same daily positivity series as EWMA
(Positive / (Positive + Negative) per day). Daily rates have **different
denominators**, and this CUSUM does **not** yet model binomial variance by
daily test count. That is a documented limitation, not something fixed mid-phase.

### Volume CUSUM and positivity CUSUM

The two metrics are calculated, stored and shown separately. Per date and
metric, `statistical_signal` (method `CUSUM`) and the API give:
- the observed value, and the baseline mean and SD;
- the z-score, today's addition (z − k), the previous CUSUM and the current
  CUSUM;
- k, h and the distance to the limit (h − C_t);
- the formal state and the informational approaching flag;
- the reference period, configuration and formula;
- a plain-language interpretation, for example *"Recent positivity values
  have accumulated enough sustained upward deviation from the historical
  baseline to cross the CUSUM decision limit."*

The overall state is STATISTICAL ALERT when either metric has reached h.

### Results (predefined k 0.5, h 5; dataset alone)

| Positivity CUSUM | Observed | z | Previous | Added (z − k) | CUSUM | State |
|---|---|---|---|---|---|---|
| Jan 13 | 10.42 % | 0.695 | 0.000 | +0.195 | 0.195 | Normal (accumulating) |
| Jan 14 | 6.38 % | −0.262 | 0.195 | −0.762 | **0.000** | Normal (reset) |
| Jan 15 | 11.11 % | 0.860 | 0.000 | +0.360 | 0.360 | Normal |
| Jan 16 | 17.74 % | 2.434 | 0.360 | +1.934 | 2.294 | Normal |
| Jan 17 | 23.29 % | 3.750 | 2.294 | +3.250 | **5.544** | **STATISTICAL ALERT** |

Volume CUSUM reaches 0.03 → 1.06 → 3.46 (Jan 15-17), then **7.25 on Jan 18
(alert)**.

**First signal dates (monitoring period Dec 25 - Jan 20):**

| Method | Watch | Moderate | High / Alert | Critical |
|---|---|---|---|---|
| Composite | Jan 15 | Jan 16 | **Jan 17** | Jan 18 |
| EWMA volume | Jan 17 | — | Jan 18 | — |
| EWMA positivity | Jan 16 | — | **Jan 17** | — |
| CUSUM volume | — | — | Jan 18 | — |
| CUSUM positivity | — | — | **Jan 17** | — |

**Lead (+) or lag (−) of CUSUM, in days:**

| CUSUM | vs Composite High | vs Composite Critical | vs EWMA alert (same metric) |
|---|---|---|---|
| Positivity (Jan 17) | 0 | +1 | 0 |
| Volume (Jan 18) | −1 | 0 | 0 |
| Either metric (Jan 17) | 0 | +1 | 0 |

**Finding.** On this synthetic outbreak, all three methods first signal on
the same day (Jan 17): **3 OF 3 METHODS SIGNAL** from Jan 17 onward. CUSUM
agrees with EWMA day for day. Neither statistical method detects earlier than
the composite's High, so they **corroborate** it rather than anticipate it.

This is one abrupt, steep synthetic outbreak. With it, the composite's
multi-factor evidence and the statistical detectors cross their thresholds
together. A slower rise would be needed to see whether CUSUM's accumulation
gives earlier warning.

### False-alert check

- **Monitored in-control days (Jan 1-14):** no CUSUM alert on either metric.
- **Reference period, in-sample (analysis only):** over the 28 in-control
  history days, the sum peaks at 1.68 (volume) and 3.00 (positivity), below h,
  so there are no alert days. This is optimistic, because those days define
  their own baseline.
- For contrast, on those same history days the composite's facility rule
  reached Watch on 7 and Moderate on 4 days (never High). By the comparison
  rule below, none of the three methods signalled falsely.

### Parameter sensitivity (development analysis only)

`python -m app.statistics.run --method cusum --report` runs the grid below.
Nothing is stored and no alternative is shown as an alert. Dataset alone:

| k | h | Volume alert | Positivity alert | False alerts before onset | Reference in-sample alert days | Overall vs composite High |
|---|---|---|---|---|---|---|
| 0.25 | 4 | Jan 17 | Jan 17 | 0 | 0 | same day |
| 0.25 | 5 | Jan 18 | Jan 17 | 0 | 0 | same day |
| 0.25 | 6 | Jan 18 | Jan 17 | 0 | 0 | same day |
| 0.50 | 4 | Jan 18 | Jan 17 | 0 | 0 | same day |
| **0.50** | **5** | **Jan 18** | **Jan 17** | **0** | **0** | **same day** |
| 0.50 | 6 | Jan 18 | Jan 18 | 0 | 0 | 1 day later |
| 0.75 | 4 | Jan 18 | Jan 17 | 0 | 0 | same day |
| 0.75 | 5 | Jan 18 | Jan 18 | 0 | 0 | 1 day later |
| 0.75 | 6 | Jan 18 | Jan 18 | 0 | 0 | 1 day later |

- Only the most permissive setting (k 0.25, h 4) moves volume a day earlier.
- The stricter settings delay positivity by a day.
- No setting produces a false alert.

The defaults stay k 0.5, h 5. They were fixed in advance, they are valid,
and they were not chosen because they alert earliest.

### Three-method comparison

**Signalling rule, for comparison only:**
- the composite signals at **High or Critical**;
- EWMA signals when its **overall state is STATISTICAL ALERT**;
- CUSUM signals when **either metric has reached h**.

Each method's own logic is unchanged. The summary is a descriptive count
(*3 OF 3 / 2 OF 3 / 1 OF 3 METHODS SIGNAL*, *NO METHODS SIGNAL*, or *n OF m
AVAILABLE* when a method has no result), with which methods signal
(Composite ✓ EWMA ✓ CUSUM ✓). **It is not a risk score.**

Live example: after the FHIR respiratory-panel Bundle is ingested (extra
results on Jan 16), the composite rises to High 69 on Jan 16. EWMA stays at
Watch and CUSUM at Normal (sum 2.46), so the panel reads **1 OF 3 METHODS
SIGNAL**.

### Database

The EWMA table `statistical_signal` was designed to be shared: its key already
includes `method`. **Migration 0007** reuses it rather than adding a table:
- `method` may be `EWMA` or `CUSUM`;
- CUSUM columns: `z_score`, `previous_cusum`, `cusum_value`, `cusum_k`,
  `cusum_h`;
- `lambda_value` and `k_value` become nullable (CUSUM has neither), but a
  check still requires them on every EWMA row, and `cusum_k` / `cusum_h` on
  every CUSUM row;
- a CALCULATED row must carry its own method's values;
- CUSUM cannot be WATCH;
- sums are ≥ 0, h > 0 and k ≥ 0.

Existing EWMA rows are unchanged. The downgrade is refused while CUSUM rows
exist.

### API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/statistics/cusum` | Label, disclaimer, k/h, formula, shared reference, extent, detection timing with lead/lag, the in-sample reference check, signalling rule, detector set |
| GET | `/api/statistics/cusum/current` | Both metrics for `date` (default: the latest), overall state |
| GET | `/api/statistics/cusum/history` | Daily CUSUM rows; filters `metric`, `date_from`, `date_to`, `syndrome` |
| GET | `/api/statistics/comparison` | Composite, EWMA and CUSUM on a date, the agreement count and which methods signal |
| POST | `/api/statistics/cusum/recalculate` | **Development only**; accepts no values; idempotent |

The EWMA endpoints are unchanged and never return CUSUM rows.

### Commands and recalculation

```powershell
python -m app.statistics.run                        # EWMA and CUSUM (idempotent)
python -m app.statistics.run --method cusum         # CUSUM only (or --method ewma)
python -m app.statistics.run --method cusum --report  # plus timing, false-alert check, k x h grid
python -m app.statistics.run --method cusum --clear   # remove stored CUSUM results
```

The pipeline is: FHIR → PostgreSQL → dynamic aggregation → EWMA / CUSUM → UI.
After a FHIR ingestion, recalculate Dynamic Surveillance, then EWMA and
CUSUM, from the commands or the development buttons. CUSUM is never
calculated from browser data.

Audit events hold aggregate figures only:
- `statistics.cusum.calculated`
- `statistics.cusum.recalculated`
- `statistics.cusum.state_changed`, for Normal → Statistical Alert and
  Statistical Alert → Normal (for example *"Positivity CUSUM … on 2026-01-17
  changed from Statistical Alert to Normal (C 0.02 vs h 5)"*)
- `statistics.cusum.cleared`

### UI

- **Three-Method Comparison** (Dynamic Surveillance, under the dynamic
  signal):
  - three columns: LabSentinel Composite (score, severity), EWMA (volume,
    positivity, overall) and CUSUM (volume, positivity, overall);
  - the agreement count with ✓ / ✗ per method and its explanation;
  - a method table (what it measures, current state, first alert,
    interpretation) in plain language.
- **CUSUM Surveillance**, a section of its own after EWMA (neither is hidden
  behind the other):
  - Test Volume CUSUM and Positivity CUSUM panels (observed today,
    historical mean, SD, standardized deviation, previous CUSUM, added today,
    current CUSUM, h, whether it crossed the limit, k, historical period,
    interpretation, and the informational "approaching limit" badge);
  - a **CUSUM trend** chart (the sum, the decision limit h and the shaded
    75-100 % band) with a Volume / Positivity switch, tooltips and a
    screen-reader table;
  - **CUSUM detection timing** and the false-alert check;
  - **Recalculate CUSUM** (development only).

  If CUSUM fails, the composite and EWMA still show.
- **SMART sidecar** (Dynamic Surveillance chosen): *Statistical detector:
  EWMA — EWMA Alert* and *Statistical detector: CUSUM — CUSUM Alert*, plus
  **View Statistical Details**. There is no CUSUM maths in the sidecar.

### Manual full-stack demonstration

1. Open Dynamic Surveillance. With CUSUM not yet calculated it says so;
   press **Recalculate CUSUM**.
2. Pick **Jan 10**: composite 0, EWMA Normal, CUSUM 0 — NO METHODS SIGNAL.
3. Step through **Jan 13 → Jan 20**:
   - the positivity sum reaches 0.20 on Jan 13 and resets to 0 on Jan 14;
   - it then accumulates 0.36 and 2.29, and reaches **5.54 ≥ h on Jan 17**;
   - volume follows on Jan 18.
4. Read the timing table. The **Three-Method Comparison** shows 3 OF 3 from
   Jan 17.
5. On FHIR Ingestion, ingest the respiratory-panel Bundle and **Recalculate
   Dynamic Surveillance**. Then **Recalculate EWMA** and **Recalculate
   CUSUM**. Jan 16 changes to 1 OF 3 (Composite only).
6. In the SMART sidecar (Dynamic Surveillance chosen): *EWMA Alert*,
   *CUSUM Alert*.
7. The Simulation Day 1-5 scores are still 0 / 24 / 50 / 74 / 87.

### Tests

- `tests/test_cusum.py` (15, no database):
  - the z-score and the recursion, k and h handling (h inclusive);
  - a hand-worked sequence including Normal → Alert → Normal;
  - reset to zero and no other reset;
  - approaching-the-limit being informational only, and carry-forward;
  - insufficient baseline and zero variance, no leakage;
  - the in-sample check, the overall state and three-method agreement.
- `tests/test_cusum_surveillance.py` (15), re-run on PostgreSQL by
  `tests/integration/test_cusum_surveillance_postgres.py`:
  - the shared baseline with EWMA;
  - hand calculations (positivity Jan 13-17, volume Jan 15-18);
  - the false-alert checks, detection timing and lead/lag, and the
    sensitivity grid (nothing stored);
  - idempotency, with EWMA values untouched;
  - FHIR-driven Normal → Alert, and Alert → Normal, with audit;
  - composite, demonstration and EWMA unchanged;
  - the API (summary, current, history, comparison, development-only
    recalculation) and the command's method selection.
- `tests/test_migrations.py`: 0007 admits CUSUM beside EWMA, enforces the
  method-specific rules and guards the downgrade.
- The EWMA test files are unchanged and pass.

### CUSUM limitations

- Experimental and not validated: k 0.5 and h 5 are illustrative.
- The same fixed reference as EWMA (the first 28 days, assumed in control).
- Positivity uses the empirical SD of daily rates. It does not model binomial
  variance by daily test count, so days with few tests carry the same weight
  as busy days.
- Upper-only, daily, regional. There is no per-facility CUSUM and no seasonal
  or day-of-week adjustment.
- No reset after an alert. During a long outbreak the sum stays high, so it
  signals ongoing excess, not the onset of new excess.
- One steep synthetic outbreak cannot establish sensitivity, specificity or
  timeliness, or distinguish the methods' speed on slower rises.

## Capstone evaluation framework (synthetic scenarios)

> **These evaluations use synthetic scenarios and demonstrate technical
> behavior only. They do not establish clinical or epidemiological
> validation.**

Experimental capstone evaluation using synthetic scenarios. It adds no
detector, changes no formula or parameter, and does not touch the frozen
Day 1-5 demonstration (still 0 / 24 / 50 / 74 / 87), the dynamic
development dataset, the FHIR fixtures or the SMART sandbox data. The
Composite Outbreak Signal Score, EWMA and CUSUM run **unchanged, with their
application defaults**, on synthetic scenarios whose ground truth is known
by design.

### Objectives

The evaluation answers, for each method:

- **Sensitivity**: does it detect a known synthetic outbreak?
- **Timeliness**: how many days after the true onset?
- **False alerts**: how often does it alert when nothing is happening?
- **Stability**: how often does it flip between states on normal days?
- **Data quality**: what do missing facilities, delayed results and
  unmapped terminology do to detection?
- **Coverage**: how do 3/3, 2/3 and 1/3 reporting facilities change it?
- **Tradeoffs**: how do Composite, EWMA and CUSUM differ? No method is
  declared best.

### Design

- **Calendar:** 28 reference days from 2024-03-01, then 42 monitored days
  (2024-03-29 to 2024-05-09). True onset for every outbreak scenario:
  **2024-04-19** (monitored day 21); outbreaks last to the end of the
  series.
- **Facilities:** three fictional facilities, `EVAL-A`, `EVAL-B` and `EVAL-C`
  (mean 20, 16 and 12 tests a day; postal areas E-001 to E-003; country
  `ZZ`). The small-count scenario uses means of 4, 3 and 2.
- **Generation:** daily tests are Poisson, positives Bernoulli at the
  scenario's positivity (baseline 5 %). Rows are ordinary `LabObservation`
  records with `source_system = eval:<scenario>` and synthetic `EVAL-PT-…`
  patient references. No real patient data.
- **Seeds:** every (repetition, facility, day) cell has its own seed:
  `base*1_000_003 + repetition*10_007 + facility*1_009 + day`. A scenario and
  its data-quality variant therefore share the same underlying draws
  (common random numbers), so differences come from the condition, not from
  chance.
- **Isolation:** each realization runs in its own throwaway SQLite database,
  built from the real Alembic migrations and deleted afterwards. The
  application's PostgreSQL database is never read or written. The
  PostgreSQL integration test shows identical results on PostgreSQL.
- **Detectors, unchanged:** `app.surveillance.persistence.recalculate`
  (Composite), `app.statistics.service.calculate` (EWMA) and
  `app.statistics.cusum_service.calculate` (CUSUM) run on that database
  exactly as they run on the application's.
- **Real-time replay (delayed data):** results arrive 1-3 days late. The
  scenario is replayed day by day: on each day D only the results received
  by the end of D are loaded, the last 3 days are recalculated as late
  results arrive, and a method "sees" the outbreak on the first D at which
  any of its results for a date between onset and D is an alert.

### Scenarios and ground truth

| # | Scenario | Ground truth | What it tests |
|---|---|---|---|
| S01 | No outbreak (control) | none | False alerts on stable data |
| S02 | Sudden sharp outbreak | all facilities from onset | Volume ×1.6, positivity 30 % from day 0 |
| S03 | Slow gradual outbreak | all facilities from onset | Volume +2 %/day (cap ×1.4), positivity +0.5 pp/day |
| S04 | Positivity-only rise | all facilities from onset | Positivity +1.5 pp/day (cap 26 %), volume flat |
| S05 | Volume-only surge | **none** | Volume +12 %/day (cap ×2.2), positivity flat: more testing, no more disease |
| S06 | Single-facility local cluster | EVAL-A only | Volume +8 %/day (cap ×1.6), positivity +2 pp/day (cap 28 %) at one facility |
| S07 | Multi-facility regional spread | A, then B (+4 d), then C (+8 d) | Staggered spread |
| S08 | Transient one-day spike | **none** | One day at ×2 volume and 25 % positivity |
| S09 | Reporting gap | all facilities from onset | S13 with EVAL-B silent for outbreak days 0-4 |
| S10 | Delayed data | all facilities from onset | S13 with results 1-3 days late from a week before onset; scored in real time |
| S11 | Terminology quality problem | all facilities from onset | S13 with 50 % unmapped code (LOINC 94309-2) at A and B, 25 % missing specimen |
| S12 | Small-count environment | none | Means 4 / 3 / 2 tests a day |
| S13 | Moderate regional outbreak | all facilities from onset | Clean reference: volume +5 %/day (cap ×1.5), positivity +1.5 pp/day (cap 23 %) |
| C2 | Coverage 2 of 3 | all facilities from onset | S13 with EVAL-C silent from a week before onset |
| C1 | Coverage 1 of 3 | all facilities from onset | S13 with EVAL-B and EVAL-C silent |

Each scenario records `outbreak_present`, `true_outbreak_start`,
`true_outbreak_end`, `true_affected_facilities`, `true_affected_geographies`
and a description. The coverage variants are reported separately and are not
pooled.

### Detection definitions (fixed before any result was seen)

| Method | Detection event |
|---|---|
| Composite | First monitored date with severity **High or Critical** |
| EWMA | First monitored date whose overall state is **STATISTICAL ALERT** |
| CUSUM | First monitored date on which **either metric's CUSUM ≥ h** |

Secondary (earlier, lower-level) events are reported but are not
detections: Composite Watch or above, Composite Moderate or above, and EWMA
Watch or above.

### Metrics and units

Two units of analysis, always labelled:

- **Realization (one simulated run).** In an outbreak scenario, TP if the
  method alerts on any outbreak day, otherwise FN. In a no-outbreak
  scenario, FP if it alerts on any monitored day, otherwise TN.
- **Day (one monitored day).** An outbreak day in alert is TP, not in alert
  FN; a normal day in alert is FP, not in alert TN.

For both units the evaluation reports:

- TP / FP / TN / FN, sensitivity, specificity, PPV (precision), NPV, false
  positive rate and false negative rate;
- every proportion as a count with a **Wilson 95 % interval**
  (z = 1.959964).

It also reports:

- **Timeliness:** the detection-delay distribution (days after true onset:
  median, mean, IQR, range and full counts), and pairwise lead/lag between
  methods.
- **Alert burden:** alert days and episodes, false-alert days and episodes,
  false-alert days per 100 normal days, and runs with any false alert.
- **Stability:** state changes on normal days per 100 normal days,
  false-episode length, and the share of normal days in alert.
- **Data quality:** Data Confidence on normal and outbreak days, and the mean
  outbreak composite score.

ROC/AUC is not reported. The methods run at fixed operational thresholds, so
threshold effects are shown in the separate sensitivity analyses instead.

### Repetitions and reproducibility

100 realizations per scenario, base seed 20260930: 1,500 realizations,
about 4 minutes on 12 worker processes. Two full runs produced
byte-identical report and CSV files and identical JSON. The same seed
always gives the same result; the tests check this.

```powershell
# from backend\
.\.venv\Scripts\python.exe -m app.evaluation.run --all --repetitions 100 --seed 20260930
# one or more scenarios, quicker
.\.venv\Scripts\python.exe -m app.evaluation.run --scenario S13-moderate --scenario S10-delayed-data --repetitions 20
```

Options: `--all`, `--scenario ID` (repeatable), `--repetitions N`
(default 100), `--seed N` (default 20260930), `--output DIR` (default
`backend/evaluation-results`) and `--workers N`.

Artifacts in `backend/evaluation-results/` (committed, about 440 KB):

- `evaluation-summary.json`: everything, including one representative daily
  timeline per scenario (repetition 0);
- `evaluation-summary.csv`: one row per scenario and method;
- `evaluation-report.md`: a readable report.

### Results (100 repetitions, seed 20260930)

Pooled over the 13 primary scenarios (900 outbreak and 400 no-outbreak
realizations):

| Metric | Composite | EWMA | CUSUM |
|---|---|---|---|
| Sensitivity (runs) | 710/900 = 78.9 % (76.1-81.4) | 900/900 = 100 % (99.6-100) | 900/900 = 100 % (99.6-100) |
| Specificity (runs) | 228/400 = 57.0 % (52.1-61.8) | 141/400 = 35.2 % (30.7-40.1) | 147/400 = 36.8 % (32.2-41.6) |
| PPV (runs, design-dependent) | 710/882 = 80.5 % | 900/1159 = 77.6 % | 900/1153 = 78.1 % |
| Sensitivity (days) | 1595/18900 = 8.4 % | 14734/18900 = 78.0 % | 14958/18900 = 79.1 % |
| Specificity (days) | 35407/35700 = 99.2 % | 32976/35700 = 92.4 % | 31934/35700 = 89.5 % |
| Median delay (IQR), days | 6 (3-9), n = 710 | 5 (3-6), n = 900 | 5 (3-6), n = 900 |
| False-alert days per 100 normal days | 0.82 | 7.63 | 10.55 |

By scenario (detected, or runs with a false alert; median delay in days):

| Scenario | Composite | EWMA | CUSUM |
|---|---|---|---|
| S01 control | 21/100 false | 26/100 false | 23/100 false |
| S02 sudden | 100/100, 0 | 100/100, 0 | 100/100, 0 |
| S03 gradual | 58/100, 11 | 100/100, 8 | 100/100, 8 |
| S04 positivity only | 82/100, 7.5 | 100/100, 4 | 100/100, 4 |
| S05 volume only | 51/100 false | 100/100 false | 100/100 false |
| S06 single facility | 37/100, 7 | 100/100, 5 | 100/100, 6 |
| S07 regional spread | 90/100, 8 | 100/100, 5 | 100/100, 5 |
| S08 one-day spike | 100/100 false | 95/100 false | 95/100 false |
| S09 reporting gap | 73/100, 6 | 100/100, 5 | 100/100, 5 |
| S10 delayed (real time) | 93/100, 8 | 100/100, 5 | 100/100, 5 |
| S11 terminology | 89/100, 6 | 100/100, 5 | 100/100, 5 |
| S12 small counts | 0/100 false | 38/100 false | 35/100 false |
| S13 moderate (clean) | 88/100, 5 | 100/100, 4 | 100/100, 4 |
| C2 coverage 2/3 | 97/100, 4 | 100/100, 4.5 | 100/100, 4 |
| C1 coverage 1/3 | 100/100, 3 | 100/100, 4.5 | 100/100, 4 |

### Interpretation: tradeoffs, not a winner

- **The statistical methods are more sensitive and usually earlier, at the
  cost of far more false-alert days.**
  - EWMA and CUSUM detected every synthetic outbreak, usually 1-3 days
    before the composite on gradual, positivity-only, spreading and
    moderate outbreaks.
  - They also produced 9-13× the composite's false-alert days on normal
    days, and alerted in every volume-only surge.
- **The composite is conservative.**
  - Its day-level specificity is 99.2 %.
  - Its day-level sensitivity is only 8.4 %: its rolling 7-day baseline
    absorbs a sustained rise, so it signals the change, not the ongoing
    elevation.
  - It missed 42 % of slow gradual and 63 % of single-facility outbreaks at
    the High cutoff.
- **EWMA and CUSUM behave very similarly here.**
  - They detected on the same day in most runs.
  - CUSUM had more false-alert days (10.5 vs 7.6 per 100), because it has
    no reset after an alert.
- **Volume-only surges** (more testing, no more disease) alert the volume
  metrics of EWMA and CUSUM in every run. The composite alerted in half of
  them.
- **Transient spikes** trigger all three methods. The composite reached High
  in every run: a one-day doubling of volume with a positivity jump moves
  several of its components at once. EWMA and CUSUM alerted in 95/100.
- **Small counts:** the composite never alerted: its affected-facility rule
  needs 10 tests. EWMA and CUSUM false-alerted in about a third of runs.
- **Secondary events:** Composite Moderate detects every outbreak with a
  median delay of 1 day, but at a false-alert burden (88.5 % of no-outbreak
  runs) similar to EWMA/CUSUM. This is an exploratory reading of the
  existing bands, not a change.

### Robustness to data-quality problems

Compared with the clean S13 (composite 88/100, median 5; EWMA/CUSUM
100/100, median 4):

- **Reporting gap (S09):** composite 73/100 (median 6); EWMA/CUSUM
  unchanged in detection, median +1 day. Data Confidence dips on outbreak
  days (mean 93.8, minimum 90).
- **Delayed results (S10, real time):**
  - composite 93/100, median 8; retrospectively 88/100, median 5;
  - EWMA/CUSUM median 5 in real time vs 4 retrospectively;
  - waiting for data costs about 1-3 days;
  - Data Confidence falls to 70 on outbreak days.
- **Terminology problems (S11):** 50 % unmapped codes at two facilities
  lower the counts the methods see. Composite 89/100 (median 6); EWMA/CUSUM
  median 5. Data Confidence falls to 84.4 (minimum 79).
- **Coverage (C2, C1):** fewer reporting facilities made the composite
  detect *more often and earlier* (97/100 and 100/100). Its facility
  denominator shrinks, so the one affected facility weighs more. This
  reflects less information, not better performance. Data Confidence
  returns to 95 on outbreak days, because a facility that stopped reporting
  more than a week earlier drops out of its window.

### Parameter and cutoff sensitivity (secondary, not persisted)

These are recomputed from each run's daily series. The defaults are not
changed.

- **EWMA λ 0.15-0.30:** detection unchanged (100 %), median delay 4-5 days,
  and 59-65 % of no-outbreak runs with a false alert. λ matters little
  here.
- **CUSUM k and h:** a clear speed-versus-false-alert tradeoff:
  - k 0.25, h 4: median delay 2 days, 88 % of no-outbreak runs false-alert;
  - default k 0.5, h 5: median delay 5, 63 %;
  - k 0.75, h 6: median delay 6, 47 %.
- **Composite cutoff (exploratory):**

  | Cutoff | Detected | Median delay (days) | No-outbreak runs with a false alert |
  |---|---|---|---|
  | Watch | 100 % | 0 | 100 % |
  | Moderate | 100 % | 1 | 88.5 % |
  | High (the default) | 78.3 % | 6 | 43 % |
  | Critical | 12.1 % | 0 (n = 109) | 22 % |

  The cutoff analysis uses retrospective states, so High shows 705
  rather than the primary 710 (the S10 real-time difference).

### CDC/WHO surveillance-evaluation attributes

| Attribute | Status here | How / why not |
|---|---|---|
| Sensitivity | evaluated technically | Share of synthetic outbreak runs (and days) detected |
| Positive predictive value | evaluated technically, design-dependent | Precision over the designed scenario mix; real PPV depends on real outbreak frequency |
| Timeliness | evaluated technically | Delay from the known onset, including real-time replay with delayed results |
| Data quality | evaluated technically | Missing facility, delays, unmapped terminology, incomplete records; Data Confidence alongside |
| Stability | evaluated technically | State changes, false-alert episodes, share of normal days in alert |
| Flexibility | partly (design only) | Configurable parameters, syndrome-agnostic engine; not exercised on other syndromes |
| Simplicity | described, not measured | Plain-language explanations; no user study |
| Representativeness | cannot be established | Synthetic facilities and populations; no real denominator |
| Acceptability | cannot be established | No real users, workflow or public-health partners |
| Usefulness | cannot be established | No real public-health action was informed by these signals |

### Threats to validity

- Synthetic scenarios may not reflect real outbreaks: their shapes, speeds
  and sizes were designed, not observed.
- The parameters (composite bands, EWMA λ/k, CUSUM k/h) are illustrative and
  were not clinically validated.
- Only one respiratory syndrome is evaluated.
- The facility and geographic structure is simplified: three fictional
  facilities in three areas.
- Test-seeking is synthetic (Poisson volumes, Bernoulli positives), with no
  weekday, holiday or policy effects.
- There is no real population denominator.
- There is no seasonality: every scenario starts from a flat baseline.
- No workflow or acceptability evaluation was done.
- There is no external epidemiological gold standard: the ground truth is
  the scenario design itself.
- Realization-level PPV depends on the designed mix of outbreak and
  no-outbreak scenarios.
- Outbreaks last to the end of each series, so recovery after an outbreak is
  not evaluated.

### What real-world validation would require

- Retrospective, de-identified laboratory data with governance approval
  (IRB, data-use agreements), covering several seasons and syndromes.
- An external reference standard: confirmed outbreak investigations,
  reportable-disease records or expert-adjudicated events.
- Real population denominators and facility catchments, with day-of-week,
  holiday and seasonal adjustment of the baselines.
- Prospective shadow-mode operation beside an existing surveillance system,
  measuring timeliness against it and alert burden on real analysts.
- Workflow, usability and acceptability studies with public-health staff.
- Parameters calibrated on data separate from the data used to evaluate
  them.

### Weaknesses found (recommendations, not redesigns)

Nothing below was changed in Phase 10. Each is a recommendation for future
work.

1. **Data Confidence forgets silent facilities.** A facility that stops
   reporting is penalised only while it is inside the 7-day window. After
   that, confidence returns to normal. Recommendation: compare coverage
   against the expected participating facilities, not recent reporters.
2. **The composite's facility denominator shrinks with coverage.** With
   fewer reporting facilities, one affected facility weighs more, so
   detection rises as information falls. Recommendation: use expected
   facilities as the denominator, or show coverage beside the score.
3. **Rolling-baseline absorption.** The composite's 7-day baseline follows
   a sustained rise, so it signals change rather than elevation, and slow or
   local outbreaks are often missed. Recommendation: consider a lagged or
   guarded baseline that excludes recent days.
4. **Small-count false alerts for EWMA and CUSUM.** With a few tests a day,
   positivity is very noisy. Recommendation: add a minimum-count guard, or
   binomial variance weighted by test count.
5. **Volume-only surges.** EWMA and CUSUM volume metrics alert on more
   testing without more disease. Recommendation: interpret volume alerts
   together with positivity, or label them "testing-volume anomaly".
6. **Transient spikes.** A single anomalous day triggers all three
   methods. Recommendation: add a persistence requirement (for example two
   consecutive days) as an option, and evaluate its delay cost.
7. **Real-time delay cost.** Late results delay detection by 1-3 days.
   Recommendation: nowcasting, or showing recent days as provisional, as
   already hinted by Data Confidence.

### API (development only, read-only)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/evaluation/summary` | The summary without per-scenario timelines |
| GET | `/api/evaluation/scenarios` | Scenario list and ground truth |
| GET | `/api/evaluation/scenarios/{id}` | One scenario with its representative timeline |

- The endpoints read the committed artifacts
  (`EVALUATION_RESULTS_DIR`, default `evaluation-results`).
- They answer **404** outside `ENVIRONMENT=development`, or when no results
  have been produced.
- There is **no endpoint that runs or writes an evaluation**. Evaluations
  run only through the command line.

### UI: `/evaluation` (API capstone mode)

The **Capstone Evaluation** page is in the API-mode navigation. It is
labelled *Experimental capstone evaluation using synthetic scenarios.* and
carries the disclaimer banner. It shows:

- how the run was made, and the fixed detection definitions;
- the overall comparison table (counts, Wilson intervals, no winner);
- confusion matrices, with the unit labelled;
- a scenario selector with the ground truth and data-quality conditions;
- the three methods' detection, timing, alert burden and stability;
- lead/lag between the methods, and the secondary events;
- a scenario timeline: tests and positivity with the true outbreak shaded,
  each method's first detection marked, and a daily state strip per method;
- **Robustness to Data Quality Problems**, facility coverage, the parameter
  and cutoff sensitivity tables, the CDC/WHO attributes and the threats to
  validity.

Local demo mode (GitHub Pages) shows a notice only and makes no request.

### Manual demonstration (Windows PowerShell)

Run the full stack as in
[Full-stack development](#full-stack-development-api-capstone-mode), then:

1. Open **Capstone Evaluation** in the sidebar. Read the disclaimer and the
   label.
2. Under *How this evaluation was run*: 100 repetitions, seed 20260930, and
   the reproduce command.
3. **Overall comparison:** composite 710/900 (78.9 %), EWMA and CUSUM
   900/900. Note that no method is declared best.
4. **Confusion matrices:** composite TP 710 / FN 190 per run. The day-level
   unit is shown separately.
5. Pick **S01 No outbreak (control)**: ground truth *No*; 21 / 26 / 23 runs
   with a false alert.
6. Pick **S13 Moderate regional outbreak**: onset 2024-04-19; composite
   88/100, median 5; EWMA and CUSUM 100/100, median 4.
7. Read the timeline: the shaded true outbreak, three detection markers and
   the state strip.
8. Read the lead/lag table: EWMA and CUSUM are usually first against the
   composite, and usually the same day as each other.
9. Pick **S03 Slow gradual outbreak**: composite 58/100, median 11.
10. Pick **S05 Volume-only surge**: no outbreak, and EWMA/CUSUM false-alert
    in 100/100 runs.
11. Pick **S12 Small-count environment**: composite 0/100, EWMA 38/100 and
    CUSUM 35/100 false.
12. Pick **S10 Delayed data**: the real-time timing is next to the
    retrospective timing.
13. **Robustness to Data Quality Problems:** compare S09, S10 and S11 with
    S13, and read Data Confidence.
14. **Facility coverage:** the composite detects more often with fewer
    facilities. This is recommendation 2 above.
15. The **sensitivity tables** show the CUSUM k/h tradeoff. Simulation Day
    1-5 still reads 0 / 24 / 50 / 74 / 87.

### Tests

- `tests/test_evaluation.py` (16, no PostgreSQL):
  - scenarios and ground truth;
  - reproducible, seed-dependent generation, and common random numbers;
  - the data-quality conditions and small counts;
  - the detectors running unchanged, and the as-of replay;
  - the Wilson interval and confusion metrics;
  - the outcome (delay, burden, stability), realization- and day-level
    summaries, lead/lag and repeated-run aggregation;
  - identical results from the same seed, and the artifacts;
  - the read-only, development-only API.
- `tests/integration/test_evaluation_postgres.py` (2): S13 and S10 give
  identical results on PostgreSQL and SQLite.
- `src/pages/__tests__/evaluationPage.test.tsx` (9), from a fixture trimmed
  from the real artifacts:
  - the label and disclaimer, and the pooled table with no winner;
  - confusion-matrix units, the scenario selector, ground truth, results,
    timeline and real-time detection;
  - robustness, sensitivity, attributes and threats;
  - the not-run and error states, and local mode.

### Evaluation limitations

- Everything is synthetic. See the threats to validity above.
- One run of 100 repetitions per scenario. The intervals describe
  simulation uncertainty, not real-world uncertainty.
- The representative timeline is one run (repetition 0), not an average.
- Parameter sensitivity is recomputed from each run's daily series. It is
  explanatory and never persisted.

## Current limitations

- FHIR ingestion is development-only: no authentication of the caller, no
  rate limiting, and no live Epic, Oracle Health or MEDITECH connection.
  Synthetic data only.
- SMART on FHIR is sandbox-only (SMART Health IT, public client). No vendor
  registration, no production SMART server, no token refresh (see
  [Sandbox limitations](#sandbox-limitations)).
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
  not applied. Ingested rows feed the dynamic surveillance engine; the
  five-day demonstration stays frozen.
- No authentication, users or role-based access control. The API is for local
  development only.
- No production security hardening, TLS or secrets management.
- The data are synthetic capstone demonstration data. Observations are
  written only by the seeds and the development FHIR endpoint; dynamic
  signals only by the dynamic surveillance engine.
- Apart from the two development-only POST endpoints, the API is read-only.
  There is no endpoint for audit events. Investigation and report state stay
  in the browser.
- The frozen demonstration's scores and Data Confidence are the prototype's
  own values, persisted as exported and never recalculated. Dynamic signals
  are calculated by the engine (see its own limitations above).
- `received_datetime` is null for every seeded observation, because the
  prototype records no receipt time. FHIR-ingested observations always have
  one.
- The frontend calls this API only in API mode (`VITE_DATA_SOURCE=api`).
  Per-facility and per-area daily breakdowns, alert detection and feed health
  are still computed in the browser, because they are not persisted yet.
- The API is not deployed anywhere. API mode is for local development, and
  the public GitHub Pages site stays in local mode.
- No machine learning. EWMA and CUSUM are experimental, and the capstone
  evaluation uses synthetic scenarios only (see its limitations above).
- No real public-health reporting.
