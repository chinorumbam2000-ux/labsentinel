# LabSentinel API — backend foundation

> This backend is the development foundation for the LabSentinel capstone.
> FHIR ingestion, SMART on FHIR authentication, production security, and live
> healthcare-system connectivity are not implemented in this phase.

**All data is synthetic.** Nothing in this service connects to a real EHR,
laboratory system or public-health authority.

## Purpose

The LabSentinel React prototype (in `../src`) computes everything in the
browser from a synthetic dataset. This backend is the first step toward real
persistence: a FastAPI service with a PostgreSQL schema for facilities, lab
observations, surveillance signals and audit events, managed by Alembic
migrations.

In this phase the backend runs **beside** the frontend and is not connected to
it. The frontend is unchanged and still runs on its own with `npm run dev`.

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
│   ├── api/health.py      GET /api/health, GET /api/health/database
│   ├── core/vocabulary.py controlled vocabularies shared with the frontend
│   ├── models/            Facility, LabObservation, SurveillanceSignal, AuditEvent
│   ├── schemas/           Pydantic response models
│   └── services/          empty; business logic arrives in later phases
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

surveillance_signal      (one syndrome on one date)
audit_event              (append-only event log)
```

- **facility**: a participating organization. `vendor` is a descriptive
  platform label only and implies no ranking or comparison of vendors.
  `facility_code` is unique.
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
- **audit_event**: event type, entity and description. There is no actor
  column yet because there are no users yet.

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

## CORS

Only explicitly listed origins are allowed. The defaults are the Vite
development server (`http://localhost:5173`, `http://127.0.0.1:5173`) and
`vite preview` (`:4173`). A wildcard `*` is rejected at startup. There is no
production CORS configuration yet.

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

- the migration reaches revision `0001`, and the live schema matches the ORM
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

With `LABSENTINEL_TEST_DATABASE_URL` set, a plain `pytest` runs both layers.

## Current limitations

- No FHIR ingestion, SMART on FHIR, or Epic, Oracle Health or MEDITECH
  connectivity.
- No authentication, users or role-based access control. The API is for local
  development only.
- No production security hardening, TLS or secrets management.
- No endpoints yet for facilities, observations, signals or audit events.
  Only the health checks exist.
- No signal computation. The Composite Outbreak Signal Score and Data
  Confidence Score are still computed by the frontend from its own synthetic
  dataset.
- The frontend does not call this API yet.
- No statistical detection (CUSUM, EWMA) and no machine learning.
- No real public-health reporting.
