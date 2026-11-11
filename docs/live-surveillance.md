# Live Surveillance (synthetic source simulation)

Live Surveillance shows that Signal by ProbeSyQ does not display pre-fixed
analytics: synthetic laboratory observations arrive over time, and every score
the analyst sees is recalculated from them.

```
simulated source message (FHIR R4 · HL7 v2 · LIS/API)
  -> adapter: parse, validate (facility, LOINC check digit, result, time)
  -> normalize (LOINC test; Positive / Negative)
  -> route to every applicable profile (the shared registry, once each)
  -> aggregate (profile × facility × day)
  -> engine: rolling 7-day baseline, affected facilities, areas, persistence,
     the five components and the Composite Outbreak Signal Score
  -> audit entry; at 19:30 the day closes and becomes the current signal
  -> Dashboard, Map, Facilities, Laboratory Data, Analytics, Signals, Roella
```

It runs entirely in the browser — no backend, database, API key, paid service
or external model — so the static GitHub Pages build is enough. The full stack
(FHIR ingestion, PostgreSQL, the dynamic engine, EWMA, CUSUM) remains the
engineering implementation and is unchanged.

## Two modes

Live Surveillance is the primary experience and the default. Scenario Replay
is the secondary, training mode.

| | Live Surveillance (primary) | Scenario Replay (training) |
|---|---|---|
| What | Synthetic observations arriving through three simulated feeds — "Simulated source feeds" | The controlled five-day Respiratory Viral Activity scenario — "Historical training scenario" |
| Used for | The normal analyst view | Training, walkthroughs and controlled review of a known progression |
| Dates | "Live surveillance date": its own simulated feed timeline (seven history days, then ten live days) | "Replay date": the original five-day sequence |
| Scores | The backend engine's rules: rolling 7-day baseline | Day 1 baseline (frozen: 0 / 24 / 50 / 74 / 87) |
| Profiles | Respiratory Viral Activity (aggregate), Influenza A, COVID-19, RSV (Cholera and Gastrointestinal are inactive here) | All six |
| Controls | Start · Pause · Resume · Reset · 1× / 2× / 4× | Replay day |

The two are separate synthetic scenarios, so their dates are intentionally
independent; neither is out of step with the other.

The switch sits at the top of the sidebar, Live Surveillance first.

- **A fresh session opens in Live Surveillance** — the first page after
  sign-in, and any session with no stored mode. Before Start, the Dashboard
  says "Live Surveillance ready" and shows the live feed's latest closed
  history day, never the replay's values.
- **An explicit choice is kept for the browser session** (`sessionStorage`,
  key `labsentinel.surveillanceMode.v1`, still named for compatibility):
  choosing Scenario Replay keeps it — through page changes and refreshes —
  until the analyst switches back or the browser session ends. Sign Out does
  not change it.
- Visiting Scenario Replay switches to replay; visiting Live Surveillance
  switches to live. Scenario Replay never reads live state.

## Simulated sources

| Facility | Simulated connection | Behaviour |
|---|---|---|
| Worcester Central Medical Center | FHIR R4 Observation | Pushes each result 2–6 minutes after collection |
| Central Massachusetts Regional Hospital | HL7 v2 ORU^R01 | Batches every 15 minutes; one result a day under an unmapped LOINC code |
| Shrewsbury Community Medical Center | LIS/API JSON | Polled every 20 minutes; one result in eight lacks its specimen type; outage on Feb 13, 10:00–13:30 |

These are synthetic formats built for the portfolio. They imply no real Epic,
Oracle Health or MEDITECH integration or partnership.

Source status uses the existing feed-health rules (`deriveFeedStatus`): a
source is DELAYED after more than 30 minutes without contact. A batch or a
poll is a contact even when it delivers nothing; the FHIR source makes
contact only by delivering. Only Shrewsbury Community's outage produces a
DELAYED state.

The panel (and Roella) also say whether the simulation is running: "not
started" before Start, "paused" with each source's status when paused, and
"live period complete" at the end. A source is never shown as active while
nothing is being sent.

## The dataset

`src/lib/live/dataset.ts`: integer tests and positives per facility, test and
day, written as literals. Seven days of history (Feb 1–7 2026) load at the
start to establish the rolling baseline; ten live days (Feb 8–17) stream. The
clock runs 07:00–19:30 each day and skips the night; one day takes about
25 seconds at 1× (one 15-minute step every 500 ms), 12.5 seconds at 2× and
6.25 seconds at 4×; the full ten live days take about 4 minutes at 1×. The
speed changes only how fast the simulated clock moves in real time, never the
results. No random values, no clock input: the same results arrive
in the same order every time. Nothing in the dataset is a score.

What the engine then calculates (closed days, Feb 8–17):

| Profile | Scores |
|---|---|
| Respiratory Viral Activity | 0, 1, 21, 29, 66, 59, 68, 66, 62, 5 |
| Influenza A | 0, 1, 29, 56, 83, 84, 51, 1, 0, 0 |
| COVID-19 | 1, 1, 1, 1, 41, 70, 81, 87, 88, 75 |
| RSV | Low throughout |

Influenza A rises first and fades; COVID-19 rises later and moves to the top
of Active Surveillance; the rolling baseline then absorbs the higher volume.

## "Today so far" and the current signal

Each observation recalculates the open day ("today so far", provisional) and
writes an audit entry when a score moves. Volume is compared with a full-day
baseline, so a day's score builds up as its results arrive: a provisional
score is not comparable with a closed day's. At 19:30 the day
closes: its final calculation becomes the profile's current signal on every
page (Dashboard, Map, Facilities, Analytics, Signals, Roella). Laboratory Data
and the source panel update with every observation.

## Audit trail

Observation received (facility, simulated source type, test), unmapped code,
validation failure, score change (today so far), day closed, source status.
Every score change lists the components whose points moved, and the facilities
that became (or stopped being) affected — taken from the engine's own results.
The stream never shows a patient reference, a pseudonym or a result value.

## Synthetic test observation

The Live Surveillance page can send one synthetic TEST observation (facility,
test, positive or negative). It is encoded in the facility's own simulated
format and processed exactly like any other. There is no way to set a score:
the person changes data, never an outcome.

## Parity with the backend

`src/lib/live/engine.ts` follows the backend engine's rules (baseline,
facility assessment, participation, persistence) and scores with the app's one
scoring function, of which the backend scorer is a port. With all three
facilities participating — always true in this simulation, and checked — the
two are identical.

`npx vite-node scripts/export-live-parity.ts` writes
`backend/tests/fixtures/live_parity.json`: every result the simulated sources
send and the browser's signal for every closed day and live profile.
`backend/tests/test_live_parity.py` ingests the same results through the real
FHIR pipeline, runs the backend engine per profile engine key, and checks
status, volume, positives, baseline, affected facilities and areas,
persistence, every component, composite score and severity for all 17 days.
A frontend test checks the committed fixture is still what the browser
produces.

## EWMA and CUSUM

Not shown in Live Surveillance: the simulation holds seven days of history,
and EWMA and CUSUM need a 28-day reference period. The page says "Insufficient
reference history"; nothing is invented. The parity test confirms the backend
produces no statistical result from the same 17 days.

## Data Confidence

The existing Data Confidence formula (`calculateDataConfidence`), fed from the
live source telemetry: freshness (minutes since each source's last contact),
completeness (specimen type present), terminology mapping (mapped / received),
participation (sources reporting), integrity (validation failures). The
outage lowers freshness; it recovers when the backlog arrives.

## Privacy

The small-count rule applies to the live counts exactly as to the replay's:
area, facility and county counts under 5 — and the rates that would reveal
them — are withheld on every screen and in Roella's answers.

## Roella

In Live Surveillance Roella answers: what just changed (the last simulated
hour), why a score moved (component points), which source sent the latest
observation, which profile changed most recently, whether all sources are
active, what is driving a profile, why a facility became affected, and whether
this is real-time. She always calls the sources simulated and never claims a
real hospital, vendor or patient connection.

## Refresh and performance

The live simulation is not persisted: a refresh starts it again from the
beginning (deterministic, nothing stored). The mode survives the refresh: a
session that has not chosen Scenario Replay is back in Live Surveillance,
ready to start; one that chose Scenario Replay stays there. There is one interval timer; it
exists only while playing and is cleared on pause, reset, completion and
unmount. The activity stream keeps the last 300 entries.

## Local and API mode

Live Surveillance is the same in both modes: it runs in the browser. In API
mode Scenario Replay's Respiratory Viral Activity figures come from the API as
before; the backend's own dynamic engine (Detection Methods) is the full-stack
implementation of the same rules.

Laboratory Data follows the same split. In Live Surveillance it lists the
results the in-browser feed has delivered — in both builds — and asks the API
for nothing: `GET /api/observations` serves Scenario Replay's records and
accepts replay days 1–5 only, so a live day is never sent to it. In Scenario
Replay the API build reads `/api/observations` with the replay day, exactly as
before — except for the browser-only portfolio profiles (Cholera,
Gastrointestinal Syndrome), whose records exist only in the browser and for
which nothing is requested.
