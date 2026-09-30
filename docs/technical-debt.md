# Known technical debt

Recorded during final capstone polish (Phase 11, 2026-09-30). Nothing here was
"fixed" by a risky upgrade during the polish phase; each item has an owner
action for after the capstone.

## Dependency security advisories (`npm audit`)

`npm audit` reports 7 advisories (5 moderate, 1 high, 1 critical). **Every
available fix is a major-version upgrade**, so none was applied during final
polish (no framework upgrades and no React Router major change in this phase).

| Package (installed) | Severity | Advisory | In the production bundle? | Fix |
|---|---|---|---|---|
| react-router / react-router-dom 6.30.6 | moderate | [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) open redirect via backslash in `<Link>` / `useNavigate` | **Yes** | react-router-dom 7.18+ (major) |
| react-router 6.30.6 | moderate | [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) constructor injection in SSR hydration `deserializeErrors()` | Yes, but LabSentinel does no server-side rendering | react-router 7.18+ (major) |
| vite 5.4 | high | path traversal in optimized-deps `.map` handling; `server.fs.deny` bypass on Windows; launch-editor NTLM hash disclosure | No — development server only | vite 8 (major) |
| esbuild ≤ 0.24 (via vite) | moderate | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) any website can query the dev server | No — development server only | via vite 8 |
| vitest 2.1 / @vitest/mocker / vite-node | critical / moderate | Vitest UI server file read/execute; mocker path traversal | No — test tooling only (the UI server is never started) | vitest 5 (major) |

`npm audit --omit=dev` (production dependencies only) reports just the two
react-router advisories.

**Exposure today.**

- The React Router open-redirect advisory concerns links or navigation built
  from untrusted input. LabSentinel's routes and `navigate()` targets are
  hard-coded constants; the only external redirect (SMART) is handled by
  `fhirclient` against configured, validated URLs.
- The SSR advisory does not apply: the app is a client-side SPA.
- The Vite / esbuild / Vitest advisories affect a developer's machine while the
  dev or test server runs. Run `npm run dev` only on trusted networks; the
  built static site does not include them.

**Plan after the capstone.** Upgrade in this order, each on its own branch
with the full test suite and the 36-view walk:

1. Vitest 5 and Vite 6+ (then 8), updating `vite.config.ts` and test setup.
2. React Router 7 (library mode), with the future flags the tests already
   warn about (`v7_startTransition`, `v7_relativeSplatPath`) enabled first on
   6.x to shrink the diff.

The Python backend was not audited with a dedicated tool (`pip-audit` is not
installed); its dependency ranges in `backend/requirements.txt` stay on the
current major versions, and `fhir.resources` is pinned exactly.

## Other known debt

- **No authentication or RBAC.** Development-only write endpoints are gated by
  environment (`APP_ENV`, `DEMO_ENDPOINTS_ENABLED`), not by identity. A
  presentation deployment that enables them must stay private.
- **Investigation / reporting state in the browser.** It lives in
  `sessionStorage`, not the database.
- **React Router future-flag warnings** in test output (v7 behaviour changes);
  harmless today, to be addressed with the upgrade above.
- **`starlette.testclient` deprecation warning** (httpx) in backend tests;
  harmless, to be resolved when upgrading FastAPI/Starlette.
- **Leaflet in jsdom.** The dashboard's map cannot render in jsdom, so
  frontend tests exercise the dashboard indirectly; the headless-browser walk
  covers it for real.
- **Evaluation methods** have known weaknesses, documented as future work and
  deliberately not re-tuned (see `/architecture`).
