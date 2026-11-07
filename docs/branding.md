# Branding: Signal by ProbeSyQ (formerly LabSentinel)

| | |
|---|---|
| Company | **ProbeSyQ** — Healthcare Technology Systems |
| Product | **Signal by ProbeSyQ** — Outbreak Intelligence |
| AI assistant | **Roella** — by ProbeSyQ (the in-app assistant, *Ask Roella*) |
| Former product names | LabSentinel (internal name), then briefly ProbeSyQ Signal |

Everything a user sees says **Signal by ProbeSyQ**, **ProbeSyQ** or **Roella**.
The repository and the GitHub Pages path are `signal-by-probesyq`.
"LabSentinel" remains only as an **internal** identifier wherever changing it
would break compatibility, stored data or history. Seeing it in code or in
storage is expected; it is no longer in any public URL.

Ownership: ProbeSyQ™ and Signal by ProbeSyQ™ are claimed, unregistered
trademarks (™, never ®). The copyright line names the owner, Munyaradzi Chinorumba
(`OWNER_LEGAL_NAME` in `src/lib/brand.ts`); no company entity is implied.

## Visible names (renamed)

- Sign-in screen, sidebar, browser title (`Signal by ProbeSyQ — Outbreak Intelligence`), favicon.
- The PSQ mark (`src/components/common/BrandMark.tsx`, `public/favicon.svg`):
  a "PSQ" monogram whose Q is a detection ring with a teal signal node. Below
  28 px, and in the favicon, only the Q's ring, tail and node are drawn.
- Roella's mark (`src/components/assistant/RoellaMark.tsx`): an "R" on the
  same navy tile with the same teal node.
- Page text, error messages, the vendor sidecar, the SMART pages, and the
  backend messages a user can see: the API title and health service name
  (`Signal by ProbeSyQ API`), FHIR validation messages, example descriptions and
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
| GitHub Pages path `/signal-by-probesyq/` | Set by the repository name (`signal-by-probesyq`, formerly `labsentinel`); links and SMART redirects are derived from it |
| SMART client id `labsentinel-capstone-sandbox` | The public SMART Health IT sandbox accepts any id and any redirect; nothing is registered. Launch and redirect URLs are derived from the base path at build time |
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
