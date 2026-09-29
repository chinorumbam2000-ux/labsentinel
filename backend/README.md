# LabSentinel API — backend foundation

> This backend is the development foundation for the LabSentinel capstone.
> FHIR ingestion, SMART on FHIR authentication, production security, and live
> healthcare-system connectivity are not implemented in this phase.

**All data is synthetic.** Nothing in this service connects to a real EHR,
laboratory system or public-health authority.

> The data persisted in Phase 2 are synthetic capstone demonstration data.
> FHIR ingestion is not yet implemented.

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
│   ├── api/               health, facilities, observations, signals, demo routes
│   ├── core/vocabulary.py controlled vocabularies shared with the frontend
│   ├── core/simulation.py capstone simulation calendar and time zone
│   ├── models/            Facility, LabObservation, SurveillanceSignal,
│   │                      AuditEvent, DemoSimulationDay
│   ├── schemas/           Pydantic response models (never ORM objects)
│   ├── services/          query logic used by the routes
│   └── seed/              dataset fixture, idempotent seed, parity check
├── alembic/               migration environment and versions/
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
`405`. In this phase, data enters the database only through `python -m
app.seed`; FHIR ingestion will later be the real way observations arrive.

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
| `through_day` | Simulation days 1 through N inclusive (the Laboratory Data "cumulative" scope) |
| `facility_id` | Facility id (from `/api/facilities`) |
| `vendor` | Facility vendor label, exact, for example `MEDITECH` |
| `loinc_code` | For example `92142-9` |
| `result` | `Positive` or `Negative` (exact case) |
| `q` | Case-insensitive text search, up to 100 characters. It matches a substring of the observation id, patient reference, facility name, vendor, test name, LOINC code, area and result, joined by spaces, exactly as the prototype's browser search does. `%` and `_` are matched literally |
| `sort` | `effective_datetime` (default), `facility_name`, `vendor`, `patient_reference`, `result` or `test_name` |
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

## Current limitations

- No FHIR ingestion, SMART on FHIR, or Epic, Oracle Health or MEDITECH
  connectivity.
- No authentication, users or role-based access control. The API is for local
  development only.
- No production security hardening, TLS or secrets management.
- The data are synthetic capstone demonstration data from the prototype. FHIR
  ingestion is not yet implemented, and the seed is the only way data enters.
- The API is read-only. There is no endpoint for audit events. Investigation
  and report state stay in the browser.
- No signal computation in the backend. Scores and Data Confidence are the
  prototype's own values, persisted as exported. Nothing is recalculated.
- `received_datetime` is null for every seeded observation, because the
  prototype records no receipt time.
- The frontend calls this API only in API mode (`VITE_DATA_SOURCE=api`).
  Per-facility and per-area daily breakdowns, alert detection and feed health
  are still computed in the browser, because they are not persisted yet.
- The API is not deployed anywhere. API mode is for local development, and
  the public GitHub Pages site stays in local mode.
- No statistical detection (CUSUM, EWMA) and no machine learning.
- No real public-health reporting.
