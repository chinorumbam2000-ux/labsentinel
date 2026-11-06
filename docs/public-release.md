# Public portfolio release — plan

Status: **prepared, not released.** Nothing in this document has been
performed: no push, no merge, no tag, no deployment.

| | |
|---|---|
| Release branch | `signal-convergence` |
| Public URL | https://chinorumbam2000-ux.github.io/labsentinel/ (unchanged base path `/labsentinel/`) |
| Build | `npm run build` with `VITE_DATA_SOURCE=local` (static; no backend, database, API key or external AI) |
| Workflow | `.github/workflows/deploy.yml` — runs `npm ci`, `npm test`, `npm run build`, publishes `dist/` on every push to `main` (and by hand) |
| Recommended tag | `signal-v1.0`, annotated, on the release commit |
| Unchanged | `submission-v1.0` … `submission-v1.4`, `capstone-development` |

## 1. Moving `main`

`main` (e1474c9) is **not** an ancestor of `signal-convergence`: it holds four
later demo commits ("Add authentication entry…", "Add Ask LabSentinel
assistant…", two panel fixes) that `signal-convergence` superseded. A plain
fast-forward is therefore impossible.

Recommended — **record main's history, then fast-forward** (no force push,
nothing lost):

```bash
git switch signal-convergence
git merge -s ours main -m "Signal by ProbeSyQ: supersede the prototype demo on main"
#   creates a merge commit whose tree is exactly signal-convergence,
#   with e1474c9 as a parent (its history stays reachable from main)
npm ci && npm test && npm run build           # same tree, re-verify anyway
git switch main
git merge --ff-only signal-convergence        # now a fast-forward
git tag -a signal-v1.0 -m "Signal by ProbeSyQ v1.0 — public portfolio release"
git push origin main signal-v1.0              # triggers the Pages workflow
```

Alternative — a normal merge of `signal-convergence` into `main`: produces
conflicts in the files both lines touched (the demo's sign-in and assistant
panel), which must all be resolved in favour of `signal-convergence`; the
outcome is the same tree with more work and more risk.

Not recommended — resetting `main` and force-pushing: it rewrites the public
default branch.

## 2. Deployment

1. Complete the release checklist below on the release commit.
2. Push `main` (step 1). The workflow tests, builds and deploys; watch it
   under *Actions → Build and deploy to GitHub Pages*.
3. Smoke-test the live URL (checklist, "after deploy").
4. Push the tag.

Settings → Pages must use **GitHub Actions** as the source — the workflow
publishes with `actions/deploy-pages`. Check this once before the push.

## 3. Rollback

The previous site is the build of e1474c9.

- **Fastest:** in *Actions*, open the last successful deployment from before
  the release and choose *Re-run all jobs*. It rebuilds from that run's commit
  (e1474c9) and republishes the prototype within minutes; `main` is untouched.
- **Durable:** on `main`, `git revert -m 2 <release merge>` and push. With
  the `-s ours` merge, parent 2 is e1474c9, so this restores the prototype's
  exact tree; the workflow redeploys it. No history is rewritten.
- The `submission-v1.4` tag and the e1474c9 commit are never modified, so the
  prototype can always be rebuilt.

## 4. Release checklist

Before pushing:

- [ ] `npm ci && npm test` — all frontend tests pass
- [ ] `npx tsc -b --force` — no type errors
- [ ] `npm run build` (static) — succeeds (the API-mode default URL constant is in the bundle but never requested)
- [ ] API build (`VITE_DATA_SOURCE=api VITE_API_BASE_URL=…`) — succeeds
- [ ] `pytest` in `backend/` with `LABSENTINEL_TEST_DATABASE_URL` — all pass, none skipped
- [ ] Static build served under `/labsentinel/` with the 404 fallback:
      sign-in → dashboard; deep links (`/labsentinel/map?profile=covid-19`,
      `/labsentinel/live`, `/labsentinel/replay`) survive a reload and return
      after sign-in; unknown paths show the branded 404 route
- [ ] Zero network requests for data in the static build (only map tiles)
- [ ] Console: no errors, no unhandled rejections, no missing assets
- [ ] axe: no violations in Scenario Replay and Live Surveillance
- [ ] 375 / 768 / 1024 / 1280 / 1440 px: no horizontal overflow; top bar one row at 1280 and 1440
- [ ] Live Surveillance: Start / Pause / Resume / Reset / 1× / 2× / 4×; runs to completion; one timer
- [ ] No visible "LabSentinel", "Demo Environment", "Classroom Demo", "API Capstone"
- [ ] Submission tags unchanged (`git rev-parse submission-v1.4^{commit}` = 4a61c67)

After deploy:

- [ ] https://chinorumbam2000-ux.github.io/labsentinel/ loads the sign-in screen with the PSQ mark and favicon
- [ ] Sign in → Dashboard; "Start here" → Live Surveillance runs
- [ ] Reload on `/labsentinel/live` and `/labsentinel/map?profile=covid-19` works
- [ ] Ask Roella "What is Signal by ProbeSyQ?" and "Is this real patient data?"
- [ ] Browser devtools: no failed requests, no console errors
