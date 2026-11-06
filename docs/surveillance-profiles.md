# Surveillance profiles (multi-profile surveillance)

Signal by ProbeSyQ watches several **surveillance profiles** at once. A profile
is one surveillance target: a syndrome (Respiratory Viral Syndrome) or a single
pathogen (Influenza A). Each profile has its own daily counts, its own baseline
and its own Composite Outbreak Signal Score. **Scores are never combined across
profiles.**

All profile data is synthetic. Every setting is an *illustrative default*
inherited unchanged from the existing Respiratory Viral Syndrome configuration;
none is clinically or epidemiologically validated for any profile.

## One registry

`backend/app/profiles/registry.json` is the single source of truth. Both stacks
read it:

- frontend: `src/lib/profiles/registry.ts`
- backend: `app/profiles/registry.py`, which validates it on load and refuses
  duplicate ids or codes, unknown references, a profile with no tests, or a
  "live" profile without an engine key.

Each profile has an id, display name, category, active flag, description, test
membership (derived from the membership list), baseline and signal configuration
references, replay availability and live availability.

| Profile | Category | Tests | Data | Replay | Live engine |
|---|---|---|---|---|---|
| Respiratory Viral Syndrome (default) | Syndrome | Influenza A, SARS-CoV-2, RSV RNA | The narrated Scenario Replay | Yes | Yes |
| Influenza A | Pathogen | Influenza A RNA | Derived from the replay results | No | No |
| COVID-19 | Pathogen | SARS-CoV-2 RNA | Derived from the replay results | No | No |
| RSV | Pathogen | RSV RNA | Derived from the replay results | No | No |
| Cholera | Pathogen | V. cholerae (demo code) | Synthetic portfolio data | No | No |
| Gastrointestinal Syndrome | Syndrome | GI panel, V. cholerae (demo codes) | Synthetic portfolio data | No | No |

"Replay" means the narrated five-day Scenario Replay. "Live engine" means the
backend's dynamic engine (and EWMA / CUSUM) calculates the profile from ingested
results. Only Respiratory Viral Syndrome has both today.

## Many-to-many test membership

One result counts towards every profile its test belongs to:

| Test code | Profiles |
|---|---|
| 92142-9 Influenza A RNA | Respiratory Viral Syndrome, Influenza A |
| 94500-6 SARS-CoV-2 RNA | Respiratory Viral Syndrome, COVID-19 |
| 85479-4 RSV RNA | Respiratory Viral Syndrome, RSV |
| DEMO-VCH V. cholerae (synthetic) | Cholera, Gastrointestinal Syndrome |
| DEMO-GIP GI pathogen panel (synthetic) | Gastrointestinal Syndrome |

`profilesForTest(code)` (frontend) and `profiles_for_test(code)` (backend,
`GET /api/profiles/test-routing?code=`) are the routing rule. An unmapped code
reaches no profile: nothing is ever classified by guesswork. The FHIR parser,
validator, normalizer and terminology are unchanged; the `DEMO-` codes are not
LOINC and are not accepted by FHIR ingestion.

`lab_observation.syndrome` stays single-valued and unchanged. A profile's
`legacy_syndrome` names the engine key it is calculated under.

## Database (migration 0008, additive)

- `surveillance_profile` — `id` (PK), `display_name` (unique), `short_name`,
  `category` (check: Syndrome / Pathogen), `active`, `description`,
  `legacy_syndrome` (nullable), `baseline_config_ref`, `signal_config_ref`,
  `replay_available`, `live_available`, `data_origin` (check), timestamps; check
  `live_needs_engine_key`.
- `lab_test_profile_membership` — (`test_code`, `profile_id`) primary key,
  `profile_id` → `surveillance_profile.id` (ON DELETE CASCADE, indexed),
  `code_system`, `test_name`.

The migration seeds a frozen copy of the registry; a test checks the two agree.
Downgrade to 0007 drops both tables and nothing else. Migrations 0001–0007 are
untouched. Read-only API: `GET /api/profiles`, `GET /api/profiles/{id}`,
`GET /api/profiles/test-routing?code=`.

## Per-profile settings

Every profile currently references `illustrative-defaults-v1`:

- replay: baseline Day 1, at least 10 tests on the baseline day, facility
  affected at +3 percentage points, positivity scale 15 points, persistence cap
  4 days, 3 facilities and 3 areas;
- engine: 7-day baseline window, at least 5 baseline days, at least 10 tests per
  facility, +25 % volume, +5 points positivity;
- EWMA: λ 0.25, k 3, warning at 2/3, 28-day reference (at least 21 days with data);
- CUSUM: k 0.5, h 5, approaching at 0.75.

Tests pin these to the backend's `EngineConfig`, `EwmaConfig` and `CusumConfig`
defaults. Severity bands are the same for every profile (Low < 20, Watch < 40,
Moderate < 65, High < 85, Critical ≥ 85). The scoring function, weights and
bands are unchanged.

## Status model

| Status | When |
|---|---|
| `INACTIVE` | The profile is switched off |
| `NO_DATA` | No results for the profile on the day |
| `INSUFFICIENT_BASELINE` | Fewer than the minimum tests on the baseline day — no score is calculated |
| `WITHIN_EXPECTED_RANGE` | Scored, severity Low |
| `ACTIVE_SIGNAL` | Scored, severity Watch or above |

No data and an insufficient baseline are counted on their own and are never
shown as "within expected range".

## Replay-period results

| Profile | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|---|---|---|---|---|---|
| Respiratory Viral Syndrome | 0 | 24 | 50 | 74 | 87 |
| Influenza A | 12 | 46 | 70 | 86 | 67 |
| COVID-19 | 0 | 20 | 48 | 51 | 93 |
| RSV | 12 | 17 | 28 | 59 | 66 |
| Gastrointestinal Syndrome | 0 | 0 | 1 | 2 | 1 |
| Cholera | no data | no data | insufficient baseline | insufficient baseline | insufficient baseline |

The pathogen profiles are the replay's own results filtered by test, so their
daily counts are about a third of the syndrome's and their scores move more.

## In the app

- **Dashboard** — *Active Surveillance*: "N signals require attention", the
  status counts kept apart, active-signal cards ranked by severity, then score,
  then name; "All profiles" shows all six. Below it, the selected profile's
  detail (for Respiratory Viral Syndrome, exactly the previous dashboard).
- **Selected profile** — `?profile=<id>` (default Respiratory Viral
  Syndrome); `active` and `all` are portfolio views that focus single-profile
  pages on the highest active signal. An unknown value falls back to the
  default and says so. The sidebar carries the value between the
  profile-aware pages (Dashboard, Map, Signals, Facilities, Laboratory Data,
  Analytics).
- **Map, Facilities, Laboratory Data, Analytics** follow the selected profile.
  Small-count suppression applies to each profile's own counts with the same
  rule; a profile without a score is drawn neutral, never in the Low colour.
- **Signals** lists every profile's alerts ("All profiles"), with profile and
  detection-time score, using the same alert rules. Acknowledgement works for
  every alert; the full investigation view covers Respiratory Viral Syndrome.
- **Scenario Replay** is unchanged and narrates Respiratory Viral Syndrome.
- **Roella** answers which profiles need attention, the highest or any Critical
  signal, what is happening with a profile, a comparison of two profiles, the
  facilities contributing to a profile, profiles within range or needing a
  baseline, and which profile is on screen — from the same portfolio the
  Dashboard shows. It names no profile outside the registry.

## Data Confidence

Data Confidence is **source-wide**: it describes the participating facilities'
feeds as a whole and is the same for every profile. It is still never part of
any score.

## Not in this phase

- No timer-driven or live ingestion. The routing rule (`routeObservations`)
  already sends each observation to every applicable profile.
- The backend engine, EWMA and CUSUM calculate Respiratory Viral Syndrome only;
  the other profiles need an aggregator that filters by test membership before
  they can be calculated live. The 28-day reference rule applies; the five-day
  replay never shows statistical confirmation for any profile.
