# Branding: ProbeSyQ Signal (formerly LabSentinel)

| | |
|---|---|
| Company | **ProbeSyQ** — Healthcare Technology Systems |
| Product | **ProbeSyQ Signal** — Outbreak Intelligence |
| AI assistant | **Roella** — by ProbeSyQ (the in-app assistant, *Ask Roella*) |
| Former product name | LabSentinel |

Everything a user sees says **ProbeSyQ Signal**, **ProbeSyQ** or **Roella**.
"LabSentinel" remains the product's **internal** name wherever changing it
would break compatibility, stored data or history. Seeing it in code, in
storage or in a URL is expected.

## Visible names (renamed)

- Sign-in screen, sidebar, browser title (`ProbeSyQ Signal — Outbreak Intelligence`), favicon.
- The PSQ mark (`src/components/common/BrandMark.tsx`, `public/favicon.svg`):
  a "PSQ" monogram whose Q is a detection ring with a teal signal node. Below
  28 px, and in the favicon, only the Q's ring, tail and node are drawn.
- Roella's mark (`src/components/assistant/RoellaMark.tsx`): an "R" on the
  same navy tile with the same teal node.
- Page text, error messages, the vendor sidecar, the SMART pages, and the
  backend messages a user can see: the API title and health service name
  (`ProbeSyQ Signal API`), FHIR validation messages, example descriptions and
  the EWMA agreement text.

## Renamed only where displayed

These texts still contain "LabSentinel" at their source and must not change
there. `withProductName()` (`src/lib/brand.ts`) renames them as they are shown:

- The frozen Day 1–5 narrative (`src/data/simulation.ts`, the seed JSON):
  the browser and the API are compared field by field by the parity checks.
- `SCORE_DISCLAIMER` in `src/lib/signalScore.ts` (scoring module, unchanged).
- Data Confidence evidence stored with each dynamic signal by the backend
  scorer ("…mapped to a LabSentinel test"): saved signal text is history.

## Internal names (kept on purpose)

| Identifier | Why it stays |
|---|---|
| `urn:labsentinel:facility-code` | FHIR senders identify facilities with it |
| `labsentinel-development-only-salt` | Changing the pseudonym salt changes every pseudonym |
| Browser storage keys `labsentinel.*` | Renaming them would reset every session |
| GitHub Pages path `/labsentinel/` | Set by the repository name; links and SMART redirects use it |
| SMART registered redirect addresses | Registered with the sandbox |
| Database, user and Render resource names (`labsentinel`, `labsentinel-api`, `labsentinel-db`) | Existing deployments and connection strings |
| Alembic migration names, seed file `labsentinel_demo_dataset.json`, package name `labsentinel` | Tooling and history |
| `LabSentinelDataSource` and other code identifiers | Internal |
| Submission tags, evaluation results and their report headings, CLI tool output | History |
| Text already saved in the database | History |

## Not authentication

The sign-in screen is presentation UX: any non-empty name and password are
accepted, the password is never stored, and only `{signedIn, name, role}` is
kept in `sessionStorage`. It protects nothing and must not be described as
security. The SMART launch, callback and sidecar routes are outside it.
