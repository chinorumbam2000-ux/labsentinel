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
membership (derived from the membership list), an engine key, baseline and
signal configuration references, replay availability and live availability.

| Profile | Category | Tests | Data | Replay | Live engine | Engine key |
|---|---|---|---|---|---|---|
| Respiratory Viral Syndrome (default) | Syndrome | Influenza A, SARS-CoV-2, RSV RNA | The narrated Scenario Replay | Yes | Yes | `Respiratory Viral Syndrome` (legacy) |
| Influenza A | Pathogen | Influenza A RNA | Derived from the replay results | No | Yes | `influenza-a` |
| COVID-19 | Pathogen | SARS-CoV-2 RNA | Derived from the replay results | No | Yes | `covid-19` |
| RSV | Pathogen | RSV RNA | Derived from the replay results | No | Yes | `rsv` |
| Cholera | Pathogen | V. cholerae (demo code) | Synthetic portfolio data | No | No | `cholera` |
| Gastrointestinal Syndrome | Syndrome | GI panel, V. cholerae (demo codes) | Synthetic portfolio data | No | No | `gastrointestinal-syndrome` |

"Replay" means the narrated five-day Scenario Replay. "Live engine" means the
backend's dynamic engine (and EWMA / CUSUM) can calculate the profile from
FHIR-ingested results: true for every profile whose tests are LOINC-mapped.
Cholera and Gastrointestinal Syndrome use demonstration codes that are never
ingested, so the engine has nothing to calculate for them.

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

## Global versus profile-specific

Every analyst-facing element is one or the other, never a mix.

| Global to Signal by ProbeSyQ | Specific to the selected profile |
|---|---|
| Signed-in analyst, Sign Out | Top bar reading: profile name, score and severity (or status words) |
| Replay Day and its controls (one calendar for every profile) | Composite score, severity, status, component breakdown |
| "Simulated surveillance data" disclosure | Volume, positives, positivity, baseline |
| Notification bell and Signals badge: alerts awaiting acknowledgement across **all** profiles | Affected facilities and areas, persistence |
| Active Surveillance counts (how many profiles are in each status) | Map, Facilities figures, Laboratory Data filter, Analytics series |
| Data Confidence — overall participating-source quality | The profile's alerts and day-to-day change |
| Feed health and facility reporting status | Small-count suppression of that profile's counts |

Scenario Replay is the exception that proves the rule: it narrates Respiratory
Viral Syndrome, so on that page the top bar names it as the *replay profile*
and shows the replay stage; on every other page the stage (an RVS narrative)
is not shown and the reading is the selected profile's. A profile with no data
or no baseline shows its status in words ("Insufficient baseline", "No current
data"); another profile's score is never shown in its place.

## Small counts (privacy)

The rule is unchanged (`geographicPrivacy.ts`: a count under 5 is withheld and
rolled up). It now applies at every level a positive count appears, for every
profile, through one function (`src/lib/profiles/display.ts`) that the
screens, reports and Roella share:

- **Area (ZIP)** — as before, per profile.
- **Facility** — a facility's positives (Facility level, rolled up to the
  county). Facilities cards, charts (withheld days are gaps, never values) and
  tooltips. The facility summary no longer lists individual results, which
  would let a small count be counted; record-level results are on Laboratory
  Data.
- **County** — a profile's network-wide positives. Respiratory Viral
  Syndrome's are always at least 5 (a test pins it), so nothing changes for
  it; a pathogen's may not be.
- A **rate** shown beside its test count would reveal its count, so a rate is
  withheld whenever its count is — including the positivity evidence of a
  score component (its points are still shown, for traceability).
- **Roella** answers from the displayed values: it says a ranking "cannot be
  made from the displayed data" when a withheld value could change it, and
  never names a "most affected" area or facility in that case.
- **Reports** store the displayed values beside the raw snapshot.

Laboratory Data is the record-level view: it lists individual synthetic
results and is not an aggregate display.

## Small numbers (volatility)

When a profile's baseline day has fewer positive results than the app may
display, one or two results move its positivity — and its score — sharply.
The profile heading and Roella then show a "Small numbers" caution. This
reuses the existing display threshold as a plain indicator; it is not a new
statistical threshold and changes no score.

## Investigations and reports

- Every profile's alert can be acknowledged, reviewed (Begin Review, Continue
  Monitoring, Escalate, Dismiss, Confirmed Concern, Close) and reported.
- Investigation records store their `profileId`; the Investigations list names
  each alert's profile.
- A non-RVS alert opens **its own** investigation shell: the alert's frozen
  detection-time values, the review workflow, and a clear statement that the
  detailed evidence view (step-by-step score breakdown and facility, area and
  data-quality trace) covers Respiratory Viral Syndrome only. Nothing stands
  in for it, and the page never switches to Respiratory Viral Syndrome.
- A report drafted from a COVID-19 alert describes COVID-19: its own figures,
  baseline, area disclosure and profile name. A profile without a score on the
  day cannot be reported, and the analyst is told why.
- The clinician sidecar is a Respiratory Viral Syndrome example and is labelled
  as such.

## Backend: one engine, once per profile

```
normalized observations
  -> route each observation to every applicable profile (test membership)
  -> aggregate the profile's observation set      (aggregator, engine key)
  -> the existing engine, baseline, scorer         (unchanged)
  -> persist under the profile's engine key        (surveillance_signal.syndrome)
  -> EWMA and CUSUM on the same set                (unchanged, 28-day reference)
```

`scope_for_key` (app/profiles/registry.py) turns an engine key into the
observations it covers. The legacy key selects exactly what it always did; a
profile key narrows the eligible observations to the profile's tests. Every
eligibility rule is otherwise unchanged. Migration 0009 adds
`surveillance_profile.engine_key`.

Endpoints: the dynamic, EWMA and CUSUM endpoints accept `?profile=<id>`
beside the older `?syndrome=`; neither means Respiratory Viral Syndrome. An
unknown profile is 404; a profile and a different syndrome together are 422.
The recalculation requests accept `"profile"` in their body.

EWMA and CUSUM run per profile only where history exists: the 28-day reference
(at least 21 days with data) is unchanged. A profile with no ingested history
(Cholera, Gastrointestinal Syndrome, or any profile on the five-day replay) has
no statistical result, and none is fabricated.

## In the app

- **Dashboard** — *Active Surveillance*: "N signals require attention", the
  status counts kept apart, active-signal cards ranked by severity, then score,
  then name; "All profiles" shows all six. Below it, the selected profile's
  detail (for Respiratory Viral Syndrome, exactly the previous dashboard).
- **Selected profile** — `?profile=<id>` (default Respiratory Viral
  Syndrome); `active` and `all` are portfolio views that focus single-profile
  pages on the highest active signal. An unknown value falls back to the
  default and says so. The sidebar carries the value to every analyst page
  (including Investigations, Reports and Scenario Replay), so it never resets
  on the way through; back and forward restore it.
- **Map, Facilities, Laboratory Data, Analytics** follow the selected profile.
  Small-count suppression applies to each profile's own counts with the same
  rule; a profile without a score is drawn neutral, never in the Low colour.
- **Signals** lists every profile's alerts ("All profiles"), with profile and
  detection-time score, using the same alert rules. Every alert can be
  acknowledged and reviewed (see Investigations and reports).
- **Scenario Replay** is unchanged and narrates Respiratory Viral Syndrome.
- **Roella** answers which profiles need attention, the highest or any Critical
  signal, what is happening with a profile, a comparison of two profiles, the
  facilities contributing to a profile, profiles within range or needing a
  baseline, and which profile is on screen — from the same portfolio the
  Dashboard shows. It names no profile outside the registry.

## Data Confidence

Data Confidence is **overall participating-source quality**: it describes the
participating facilities' feeds as a whole, is labelled so on screen, and is
the same for every profile. It is never part of any score. (When the backend
engine runs for one profile it computes its own data-quality inputs from that
profile's observations; the screens do not use those.)

## Data sources by profile

| Profile | Local mode | API mode |
|---|---|---|
| Respiratory Viral Syndrome | Browser | Scores and days from the API |
| Influenza A, COVID-19, RSV | Browser | Laboratory records from the API; scores derived in the browser from the replay feed |
| Cholera, Gastrointestinal Syndrome | Browser | Browser only — not in the API database, not ingestible through FHIR |

## Not in this phase

- No timer-driven or live ingestion. The routing rule (`routeObservations`,
  `profiles_for_test`) already sends each observation to every applicable
  profile, and the backend can calculate each profile under its engine key.
- The Detection Methods page still shows Respiratory Viral Syndrome; the API
  behind it already accepts `?profile=`.
