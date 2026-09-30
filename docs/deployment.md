# LabSentinel — final capstone deployment plan

Status: **designed and locally validated, not deployed.** Nothing has been
provisioned or purchased. Synthetic data only.

## 1. What gets deployed

| Piece | Today | Full-stack capstone deployment |
|---|---|---|
| Public classroom demo | GitHub Pages, Local Demo Mode, built from `main` by `.github/workflows/deploy.yml` | **Unchanged.** Stays available as the zero-backend public demo. |
| React app (API Capstone Mode) | Local `npm run dev` | Static hosting over HTTPS, built with `VITE_DATA_SOURCE=api` |
| FastAPI | Local `uvicorn` | Container from `backend/Dockerfile` on a managed web service, HTTPS terminated by the platform |
| PostgreSQL 16 | Local docker compose | Managed PostgreSQL with TLS (`sslmode=require`) |

```
 browser ──HTTPS──► static host (React build, API mode)
    │                     
    ├──HTTPS──► web service (FastAPI container) ──TLS──► managed PostgreSQL
    │              CORS: exactly the static host's origin
    └──HTTPS──► launch.smarthealthit.org (SMART sandbox, PKCE, public client)
```

## 2. Environments

| | development | presentation / staging | production-like |
|---|---|---|---|
| `APP_ENV` | `development` | `presentation` | `production` |
| Development-only endpoints (FHIR ingest, recalculations, evaluation reads, readiness) | on | **off unless `DEMO_ENDPOINTS_ENABLED=true`** | always off (the flag is rejected) |
| CORS methods | GET, POST | GET, POST only when enabled | GET only |
| `FHIR_PSEUDONYM_SALT` | development default | own secret (**required** when demo endpoints are on) | own secret |
| Demo reset / prepare commands | allowed | allowed (`--yes`) | refused |
| Template | [`deploy/env/backend.development.env.example`](../deploy/env/backend.development.env.example) | [`backend.presentation.env.example`](../deploy/env/backend.presentation.env.example) | [`backend.production.env.example`](../deploy/env/backend.production.env.example) |

Frontend templates: [`frontend.fullstack.env.example`](../deploy/env/frontend.fullstack.env.example)
and [`frontend.pages.env.example`](../deploy/env/frontend.pages.env.example).
Every `VITE_*` value is public (compiled into the JavaScript): no secret,
token, password or salt may ever go there. Secrets live only in the hosting
platform's environment variables; nothing secret is committed, and
`backend/.env` is git-ignored and excluded from the Docker image.

**For the final presentation** use `presentation` with
`DEMO_ENDPOINTS_ENABLED=true`, share the URL only with the audience, and set
the flag back to `false` (or suspend the service) afterwards: those endpoints
have no authentication.

## 3. Requirements checklist

- **HTTPS everywhere:** static host, API and database connections (TLS).
- **CORS:** `CORS_ORIGINS` = the exact frontend origin (wildcards are rejected
  at startup).
- **Development-only endpoints disabled** outside development unless a private
  presentation deployment opts in (verified: in `production` they all answer
  404 and CORS allows GET only).
- **SMART redirect URI:** `VITE_SMART_REDIRECT_URI=https://<frontend-host><base>smart/callback`
  (with `LABSENTINEL_BASE_PATH=/`, that is `https://<frontend-host>/smart/callback`).
  It must be HTTPS; the SMART Health IT sandbox accepts any redirect URI for a
  public client, so no registration step is needed. The launch URL is
  `https://<frontend-host>/smart/launch`.
- **SPA routing:** the static host must rewrite unknown paths to `index.html`
  (GitHub Pages uses `public/404.html` for the same purpose).
- **Base path:** `LABSENTINEL_BASE_PATH=/` at a domain root; the default
  `/labsentinel/` is kept for GitHub Pages.
- **Migrations are an explicit release step** (`alembic upgrade head`), never
  run implicitly by the container.

## 4. Hosting options (student capstone)

Criteria: cost, setup complexity, HTTPS, environment variables, PostgreSQL,
sleep / cold start, SMART redirect support. Pricing and free-tier rules change
often — **check each provider's current terms before provisioning**; the notes
below are general and were not verified live.

| Option | Cost | Setup | HTTPS / env vars | PostgreSQL | Sleep / cold start | SMART redirect |
|---|---|---|---|---|---|---|
| **A. Render** (static site + Docker web service + Render PostgreSQL) | Static free; web service free tier or a small paid always-on instance; free PostgreSQL has historically been time-limited | Low: one dashboard (or a blueprint), deploys from the repository | Automatic TLS; env vars and secrets in the dashboard | Managed, same platform | Free web services sleep when idle (cold start of tens of seconds); paid instances do not | Any HTTPS static URL works |
| **B. Render web service + Neon PostgreSQL** (+ Render or Netlify static) | Neon has a free tier; web service as in A | Low–medium: two providers | Automatic TLS; `sslmode=require` | Serverless PostgreSQL | Neon scales to zero (brief resume on first query); web service as in A | Yes |
| **C. Railway** (service + PostgreSQL) | Usage-based after trial credit | Low | Automatic TLS; env vars | Plugin PostgreSQL | No sleep by default | Yes (static site served separately or by a small static service) |
| **D. Fly.io** (container + managed PostgreSQL) | Usage-based | Medium: CLI, `fly.toml` | Automatic TLS; secrets via CLI | Managed PostgreSQL (paid) | Machines can auto-stop / start | Yes |
| **E. Azure / AWS / GCP student credits** | Credits | High for a capstone (networking, IAM) | Yes | Managed | Configurable | Yes |

## 5. Recommendation

**Option A or B on Render**, chosen for simplicity and reliability:

- **Frontend:** Render Static Site, build `npm ci && npm run build`, publish
  `dist/`, rewrite `/*` → `/index.html`, environment from
  `frontend.fullstack.env.example` with `LABSENTINEL_BASE_PATH=/`.
- **Backend:** Render Web Service from `backend/Dockerfile` (root directory
  `backend`), health check path `/api/health`, environment from
  `backend.presentation.env.example`. **Use an always-on (paid) instance for
  the presentation window** so the live demo never waits on a cold start; a
  free instance is acceptable only with a warm-up visit a few minutes before.
- **Database:** Render PostgreSQL, or Neon if the Render free database's time
  limit does not cover the grading period. Connection string with
  `postgresql+psycopg://…?sslmode=require`.
- **Keep** the GitHub Pages Local Demo Mode site as the public, always-available
  classroom demo and fallback.

This needs a decision from the project owner (cost and accounts) before
anything is provisioned.

## 6. Deployment steps (to run after approval — not yet executed)

1. Create the PostgreSQL database; note the TLS connection string (secret).
2. Create the web service from `backend/Dockerfile` with the presentation
   environment; set `DATABASE_URL`, `FHIR_PSEUDONYM_SALT` (new random value)
   and `CORS_ORIGINS` (the static site URL, known after step 5 — update then).
3. Release step, in the service shell or as one-off jobs:
   ```
   alembic upgrade head
   python -m app.seed                      # frozen Day 1-5 demonstration
   python -m app.demo.prepare              # dynamic dataset, detectors, checks → READY
   python -m app.seed.smart_sandbox        # optional: SMART sidecar ingestion bridge
   ```
4. Check `https://<api>/api/health`, `/api/health/database` and
   `/api/readiness` (READY).
5. Create the static site with the full-stack frontend environment
   (`VITE_API_BASE_URL=https://<api>`, `VITE_SMART_REDIRECT_URI=https://<site>/smart/callback`).
6. Set `CORS_ORIGINS` to the static site origin; redeploy the API.
7. Open `https://<site>/overview`: the readiness panel must show READY, then
   run the ten-step presentation (docs/presentation-guide.md) once end to end.
8. After the presentation: `DEMO_ENDPOINTS_ENABLED=false` (the app keeps
   working read-only) or suspend the service.

## 7. Local validation already done (Phase 11)

- `docker build -t labsentinel-api backend/` succeeds (Python 3.13 slim,
  non-root user `labsentinel`, no `.env` in the image).
- Container with `APP_ENV=production`: `/api/health`, `/api/health/database`,
  `/api/demo/days` → 200; `/api/readiness`, `/api/evaluation/summary`,
  `/api/fhir/examples` → 404.
- Container with `APP_ENV=presentation`, `DEMO_ENDPOINTS_ENABLED=true` and its
  own salt: the demo endpoints → 200, readiness READY (evaluation checksums
  match inside the image), CORS preflight for POST from the configured origin
  → 200.
- `APP_ENV=presentation` + `DEMO_ENDPOINTS_ENABLED=true` with the development
  salt, and `APP_ENV=production` + `DEMO_ENDPOINTS_ENABLED=true`, are rejected
  at startup.
