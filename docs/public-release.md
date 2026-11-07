# Public portfolio release

| | |
|---|---|
| Repository | https://github.com/chinorumbam2000-ux/signal-by-probesyq (formerly `labsentinel`) |
| Public URL | https://chinorumbam2000-ux.github.io/signal-by-probesyq/ |
| Base path | `/signal-by-probesyq/` (`PAGES_BASE_PATH` in `vite.config.ts`) |
| Build | `npm run build` with `VITE_DATA_SOURCE=local` (static; no backend, database, API key or external AI) |
| Workflow | `.github/workflows/deploy.yml` — `npm ci`, `npm test`, `npm run build`, publishes `dist/` on every push to `main` (and by hand) |
| Pages source | GitHub Actions (`build_type: workflow`) |
| Unchanged | `submission-v1.0` … `submission-v1.4`, `capstone-development` |

## Releases

| Tag | Commit | What |
|---|---|---|
| `signal-v1.0` | `3f061da` | First public portfolio release, served at the old path `/labsentinel/`. `main` took `signal-convergence` through a `git merge -s ours main` (history kept, tree unchanged) and a fast-forward. |
| *(next)* | — | Public identity and Pages path: `Sign in` button, sidebar scrollbar, ownership notice, base path `/signal-by-probesyq/`. |

## Renaming the repository and the Pages path

GitHub serves a project site at `/<repository name>/`, so the repository
name *is* the public path. The code is built for `/signal-by-probesyq/`.

What happens at the rename (`labsentinel` → `signal-by-probesyq`):

- **Git** redirects the old repository URL (clone, fetch, push, web), so
  nothing breaks for Git. The local remote is still updated to the new URL.
- **Pages** does **not** redirect a project site: the old
  `https://chinorumbam2000-ux.github.io/labsentinel/` stops working.
- The **currently deployed build** (`signal-v1.0`) was built for
  `/labsentinel/`. Served at `/signal-by-probesyq/`, its asset URLs point to
  the old path, so the site does not load until a build for the new path is
  deployed. **Rename and deploy together**, or accept a gap.

Order:

1. Prepare and validate the new base path locally; commit on `signal-convergence`.
2. Rename the repository in *Settings → General → Repository name*.
3. `git remote set-url origin https://github.com/chinorumbam2000-ux/signal-by-probesyq.git`; `git remote -v`.
4. Fast-forward `main` to `signal-convergence` and push (no force): the
   workflow builds and deploys for the new path.
5. Validate the live site at the new URL; then tag.

### SMART on FHIR

The launch and redirect URLs are derived from the build's base path
(`<origin><base>smart/launch`, `<origin><base>smart/callback`), so the code
needs no change. The public SMART Health IT sandbox has no app registration
(it accepts any client id and redirect). The Pages build does not enable
SMART. The only external change: anyone who launches from the sandbox
launcher with a saved launch URL must use the new one —
`https://chinorumbam2000-ux.github.io/signal-by-probesyq/smart/launch` for a
SMART-enabled Pages build, or `http://localhost:5173/signal-by-probesyq/smart/launch`
locally.

## Rollback

- **Code:** on `main`, `git revert` the release commit (or the range) and
  push; the workflow redeploys. No history is rewritten.
- **Name:** renaming the repository back to `labsentinel` restores the old
  path, but the deployed build must then match it (redeploy `signal-v1.0`).
- Submission tags and `capstone-development` are never modified.

## Release checklist

Before pushing:

- [ ] Owner legal name supplied (`OWNER_LEGAL_NAME` in `src/lib/brand.ts`, README *Ownership*)
- [ ] `npm ci && npm test`, `npx tsc -b --force`, `npm run build` pass
- [ ] Static build served under `/signal-by-probesyq/` with the 404 fallback:
      sign-in → dashboard; deep links (`/signal-by-probesyq/map?profile=covid-19`,
      `/signal-by-probesyq/live`, `/signal-by-probesyq/replay`) survive a reload
      and return after sign-in
- [ ] Zero network requests for data (map tiles excepted); no console errors
- [ ] axe clean in both modes; 375 / 768 / 1024 / 1280 / 1440 px without overflow
- [ ] Repository renamed; local remote updated
- [ ] Submission tags unchanged (`git rev-parse submission-v1.4^{commit}` = 4a61c67)

After deploy:

- [ ] https://chinorumbam2000-ux.github.io/signal-by-probesyq/ loads the sign-in screen with the PSQ mark and favicon
- [ ] Sign in → Dashboard; "Start here" → Live Surveillance runs
- [ ] Reload on `/signal-by-probesyq/live` and `/signal-by-probesyq/map?profile=covid-19` works
- [ ] Browser devtools: no failed requests, no console errors
