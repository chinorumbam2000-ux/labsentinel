# LabSentinel

**From laboratory signals to population-level outbreak intelligence**

A laboratory-first, vendor-agnostic public-health early-warning prototype.
**All data is synthetic.**

🔗 **Live demo:** https://chinorumbam2000-ux.github.io/labsentinel/
📦 **Repository:** https://github.com/chinorumbam2000-ux/labsentinel

---

## Contents

| # | Section |
|---|---------|
| 1 | [LabSentinel overview](#1-labsentinel-overview) |
| 2 | [Important prototype disclaimer](#2-important-prototype-disclaimer) |
| 3 | [Current routes](#3-current-routes) |
| 4 | [Five-day simulation](#4-five-day-simulation) |
| 5 | [Composite Outbreak Signal Score](#5-composite-outbreak-signal-score) |
| 6 | [Data Confidence Score](#6-data-confidence-score) |
| 7 | [Feed health monitoring](#7-feed-health-monitoring) |
| 8 | [Explainability](#8-explainability) |
| 9 | [Adaptive geographic privacy](#9-adaptive-geographic-privacy) |
| 10 | [Human-in-the-loop investigation](#10-human-in-the-loop-investigation) |
| 11 | [Public-health reporting simulation](#11-public-health-reporting-simulation) |
| 12 | [Vendor sidecar concept](#12-vendor-sidecar-concept) |
| 13 | [Laboratory standards](#13-laboratory-standards) |
| 14 | [Configurable geography](#14-configurable-geography) |
| 15 | [Current laboratory-first architecture](#15-current-laboratory-first-architecture) |
| 16 | [Future multi-source architecture](#16-future-multi-source-architecture) |
| 17 | [Future federated surveillance](#17-future-federated-surveillance) |
| 18 | [Architecture status](#18-architecture-status) |
| 19 | [Current limitations](#19-current-limitations) |
| 20 | [Planned next capstone stage](#20-planned-next-capstone-stage) |
| 21 | [Technology stack](#21-technology-stack) |
| 22 | [Local development](#22-local-development) |

---

## 1. LabSentinel overview

LabSentinel is a **laboratory-first, vendor-agnostic public-health early-warning
prototype**. It transforms synthetic laboratory signals into **explainable,
population-level surveillance intelligence**.

The premise is that laboratory results are among the earliest structured,
codable signals a health system produces. A single hospital sees only its own
slice of them. LabSentinel demonstrates what becomes visible when standardized
laboratory data from several independent organizations is normalized to common
terminology, combined into one regional signal, explained rather than merely
asserted, and pushed back into each organization's own EHR workspace as a
lightweight sidecar.

Three things distinguish it from a dashboard that simply displays numbers:

- **Explainability first.** Every score can be opened up into the evidence,
  normalization, weight and point contribution that produced it. Nothing is a
  black box and nothing is hard-coded.
- **Trust is scored separately from severity.** A Composite Outbreak Signal
  Score answers *"how concerning is this signal?"*; a separate Data Confidence
  Score answers *"how trustworthy is the data behind it?"* The two are never
  combined, because a Critical signal on Low-confidence data is a different
  situation from a Critical signal on Very High-confidence data.
- **Silence is not reassurance.** A facility that stops reporting is shown as
  *"No data currently available"*, never as *"no abnormal activity detected"*.

The demonstration centres on one surveillance syndrome — **Respiratory Viral
Syndrome** — across three fictional facilities in Worcester County, MA, over a
five-day simulated outbreak.

---

## 2. Important prototype disclaimer

**This is a prototype. Everything in it is fabricated.**

- **All data is synthetic.** Every test, result, count, timestamp and score is
  invented for demonstration.
- **All hospitals are fictional.** The three participating facilities do not
  exist and are not modelled on any real healthcare organization.
- **The Epic environment is simulated.** It is a generic demonstration shell,
  not Epic software and not a reproduction of any Epic interface.
- **The Oracle Health environment is simulated.** It is a generic demonstration
  shell, not Oracle Health software and not a reproduction of any Oracle Health
  interface.
- **The MEDITECH environment is simulated.** It is a generic demonstration
  shell, not MEDITECH software and not a reproduction of any MEDITECH
  interface.
- **There is no live production EHR connection.** No FHIR server, HL7 interface,
  laboratory information system or hospital network is contacted.
- **There is no live CDC, WHO, state or public-health authority connection.**
  No jurisdiction, agency or registry is contacted or represented.
- **No reports are actually transmitted externally.** The reporting workflow
  changes a status field in browser memory. Nothing leaves the browser.
- **The Composite Outbreak Signal Score is illustrative and non-validated.** It
  is a transparent demonstration model, not a clinically or epidemiologically
  validated instrument, and is not intended for clinical diagnosis or
  public-health decision-making.
- **The Data Confidence Score is illustrative and non-validated.** It is a
  prototype data-quality indicator only.

There are no patients, no PHI, no names, no addresses, no dates of birth and no
real identifiers anywhere in this repository. Patient references are synthetic
placeholders (`SYN-P0001` … `SYN-P0699`). The finest geography that exists is a
synthetic surveillance area; no patient location of any kind is stored or
displayed.

Every screen carries a persistent `DEMO ENVIRONMENT — Synthetic data only`
banner.

---

## 3. Current routes

| Route | Screen | What it contains |
|-------|--------|------------------|
| `/` | Landing page | Entry point, disclaimer and the way into the prototype |
| `/dashboard` | Public Health Dashboard | Six numbered sections: current situation (both scores), epidemiological indicators, geographic intelligence, data quality, current alert, day-to-day change |
| `/map` | Outbreak Map | Synthetic surveillance areas with zoom, pan, reset, legend, hover, click-to-detail, privacy-aware area panel |
| `/laboratory-data` | Laboratory Data (FHIR observations) | Search, filters, sorting and pagination over the 699 synthetic `Observation` records |
| `/signals` | Signals & Alerts | Alert table, acknowledgement, Signal Investigation breakdown, Why This Signal, human-in-the-loop investigation workflow |
| `/hospitals` | Hospitals | Per-facility dashboards, feed health, data confidence, FHIR/interoperability status and the vendor sidecar demonstration |
| `/analytics` | Analytics | Trends — test volume, positivity, signal score, geographic spread, each on its own scale |
| `/simulation` | Simulation | Full five-day simulation controls and the day-by-day progression |
| `/reports` | Reports | Simulated public-health reporting workflow and its audit timeline |
| `/architecture` | Architecture | Current and future architecture, multi-source hooks, federated concept, status legend |

`/index.html` redirects to `/dashboard`. Any unknown path renders an in-app 404
with a link back to the dashboard.

Routes are served from the GitHub Pages sub-path `/labsentinel/`, so the live
URLs are `https://chinorumbam2000-ux.github.io/labsentinel/dashboard` and so on.

### Accessibility and resilience notes

- Every surveillance area can be opened from the **Surveillance areas table** as
  well as from the map, so area selection does not depend on clicking an SVG
  polygon. Those cells are real buttons with descriptive labels.
- Map instructions sit outside the map canvas at every width, so they cannot
  overlap the zoom control, the attribution or the legend. The legend is an
  overlay only at `lg` and above; below that it moves into the card footer.
- A visible focus ring is applied globally via `:focus-visible`; heading levels
  run `h1 → h2` without skips; body text meets WCAG AA contrast.
- If the OpenStreetMap basemap fails to load, the map shows a labelled fallback
  notice and a **Retry basemap** control. Polygons, severity colours, tooltips,
  the detail panel and every figure on the page are unaffected, because none of
  them depend on the tile layer.
- Wide tables scroll inside their own container rather than pushing the page,
  and the app is usable down to 390px.

---

## 4. Five-day simulation

There is exactly one piece of global state: **`currentDay`**, held in
`SimulationContext` and ranging from 1 to 5. Every page reads it from that
single context, so no two screens can disagree.

These are **synthetic aggregate surveillance values** — authored regional counts
for a fictional county, not measurements of any real population.

| Day | Stage | Tests | Positives | Positivity | Facilities | Areas | Persistence | Score |
|-----|-------|-------|-----------|-----------|-----------|-------|-------------|-------|
| 1 | Baseline | 100 | 8 | 8.0% | 0 | 0 | 0 | 0 (Low) |
| 2 | Early Local Increase | 124 | 12 | 9.7% | 1 | 1 | 1 | ≈24 (Watch) |
| 3 | Rising Positivity | 141 | 19 | 13.5% | 2 | 2 | 2 | ≈50 (Moderate) |
| 4 | Multi-Site Cluster | 158 | 26 | 16.5% | 3 | 3 | 3 | ≈74 (High) |
| 5 | Regional Early-Warning Signal | 176 | 34 | 19.3% | 3 | 3 | 4 | ≈87 (Critical) |

Baseline test volume is 100; baseline positivity is 8.0% (Day 1 is the baseline
day). Scores are the rounded output of the weighted model in section 5 — they
are calculated on every render, never stored.

When the day changes, this cascade runs in a single render:

```
currentDay changes
   ├── observations filtered to day <= currentDay
   ├── aggregate scenario for the day selected
   ├── composite signal score recalculated
   ├── data confidence recalculated from feed health
   ├── severity and confidence bands reclassified
   ├── dashboard sections, KPIs and charts updated
   ├── map severity colours, privacy suppression and area panel updated
   ├── alerts regenerated from scratch, detection snapshots preserved
   ├── day-to-day comparison recomputed
   ├── hospital dashboards updated
   └── all three vendor sidecars updated
```

Controls are available in the top bar (Previous / Next / Reset) on every page,
and in full on `/simulation` (Previous Day, Advance Day, Auto Play, Pause, Reset
Simulation). Auto Play advances roughly every 3 seconds and stops at Day 5.
Previous cannot go below Day 1; Advance cannot go beyond Day 5; Reset always
returns to Day 1.

### The simulation calendar

Observations and alerts are stamped with a fixed simulation calendar running
**Mon 3 Nov 2025 → Fri 7 Nov 2025**. That is deliberately separate from the real
session clock, which only ever reports when this browser tab last recalculated.
Both are labelled wherever they appear (`Simulation date:` vs `Session updated`).

### The synthetic data

- **699 deterministic FHIR-style `Observation` records** — one per test counted
  in the dataset, ids `OBS-0001` … `OBS-0699`, patients `SYN-P0001` …
  `SYN-P0699`. The laboratory table therefore reconciles exactly with every
  facility, area and regional total. Generation is fully deterministic — no
  randomness, no dependence on the wall clock, identical on every render and
  reload.
- **Three fictional hospitals:**

  | ID | Hospital (fictional) | Simulated environment | ZIP |
  |----|----------------------|-----------------------|-----|
  | HOSP-A | Worcester Central Medical Center | Simulated Epic Environment | 01604 |
  | HOSP-B | Central Massachusetts Regional Hospital | Simulated Oracle Health Environment | 01605 |
  | HOSP-C | Shrewsbury Community Medical Center | Simulated MEDITECH Environment | 01545 |

The authoritative dataset is a table of **integer per-day, per-facility test and
positive counts** (`src/data/dataset.ts`). Regional and cumulative totals are
sums of it; positivity is always derived as positives ÷ tests and rounded only
for display; the composite score's inputs are derived from it. A facility counts
as affected once its own positivity sits at least 3 percentage points above
baseline, and persistence counts consecutive days with regional positivity above
baseline. Nothing in the table above is stored independently of the counts, so
the figures cannot drift apart.

---

## 5. Composite Outbreak Signal Score

The score is **always calculated**, never hard-coded. Five components, each
normalized to 0–100 and then weighted:

| Component | Weight | Max points | Normalization |
|-----------|--------|-----------|---------------|
| Test Volume | 25% | 25 | `clamp(volumeIncreasePercent)` |
| Positivity | 30% | 30 | `clamp(((positivityRate − 8.0) / 15) × 100)` |
| Affected Facilities | 20% | 20 | `clamp((affectedFacilities / 3) × 100)` |
| Geographic Spread | 15% | 15 | `clamp((affectedAreas / 3) × 100)` |
| Persistence | 10% | 10 | `clamp((persistenceDays / 4) × 100)` |

```ts
const clamp = (value: number, min = 0, max = 100) =>
  Math.min(Math.max(value, min), max);

const compositeScore = Math.round(
  volumeScore * 0.25 +
  positivityScore * 0.30 +
  facilityScore * 0.20 +
  geographyScore * 0.15 +
  persistenceScore * 0.10
);
```

Severity bands:

| Score | Severity |
|-------|----------|
| 0–19 | Low |
| 20–39 | Watch |
| 40–64 | Moderate |
| 65–84 | High |
| 85–100 | Critical |

Calculated progression: **Day 1 → 0, Day 2 → 24, Day 3 → 50, Day 4 → 74,
Day 5 → 87.** The Day 5 breakdown is 19/25 + 23/30 + 20/20 + 15/15 + 10/10 = 87.

**The model is transparent and illustrative, not clinically or
epidemiologically validated.** The weights, denominators and thresholds were
chosen to produce a legible demonstration progression. They were not fitted to
real epidemiological data, and the score has no characterised sensitivity,
specificity, positive predictive value or lead time. Two disclaimers appear
wherever the score is presented:

> Early-warning signal — not a confirmed outbreak. Epidemiological review required.

> The LabSentinel Composite Outbreak Signal Score used in this prototype is an illustrative, non-validated demonstration model and is not intended for clinical diagnosis or public-health decision-making.

`/signals` → *Investigate* opens the Signal Investigation view, which shows each
component's raw evidence, its normalized score, its weight and its point
contribution, alongside the weighted total.

---

## 6. Data Confidence Score

A **separate** score answering a different question. Composite Outbreak Signal
Score: *"how concerning is the signal?"* Data Confidence Score: *"how
trustworthy is the data behind it?"* The two are never added, averaged or
otherwise combined, and they are rendered in different panels with different
colour palettes so they cannot be misread as one number.

| Component | Weight | What it measures |
|-----------|--------|------------------|
| Feed Freshness | 30% | How recently each reporting feed delivered an event |
| Data Completeness | 25% | Share of delivered records carrying the fields the signal needs |
| Terminology Mapping Quality | 20% | Share of results that mapped cleanly to LOINC |
| Facility Participation | 15% | How many of the participating facilities are reporting at all |
| Data Integrity | 10% | Penalised by failed and duplicate events |

Confidence bands:

| Score | Level |
|-------|-------|
| 90–100 | Very High |
| 75–89 | High |
| 50–74 | Moderate |
| 0–49 | Low |

Component scores are combined as a weighted mean across reporting feeds,
weighted by how many events each delivered. Across the five simulated days the
score runs 98 / 97 / 94 / 97 / 97 — the Day 3 dip is the scripted delayed feed,
not a change in the epidemiology.

**This measures trust in the supporting data, NOT outbreak severity.** A high
Data Confidence Score does not mean the situation is safe, and a low one does
not mean the signal is wrong — it means the evidence underneath it is thinner
than usual and should be weighted accordingly. The score is an illustrative
prototype quality indicator and is not validated.

---

## 7. Feed health monitoring

Each participating facility's feed is monitored for operational health,
deliberately independently of the epidemiological signal. A facility can have a
perfectly healthy feed while reporting an alarming positivity rate, and vice
versa — that separation is the point.

| Status | Meaning | Prototype trigger |
|--------|---------|-------------------|
| `HEALTHY` | Delivering normally | None of the conditions below |
| `DELAYED` | Events are arriving later than expected | More than 30 minutes since the last event |
| `DEGRADED` | Events are arriving, but quality checks are failing | Mapping or completeness below 85%, or failed + duplicate events above 5% |
| `OFFLINE` | No data currently available from this facility | No events received, or more than 240 minutes since the last event |

**Missing or offline data does not mean absence of disease activity.** This is
the rule the prototype enforces hardest: an offline feed reads *"No data
currently available — status at this facility is unknown"*, never *"no abnormal
activity detected"*. In surveillance, silence from a facility is missing
information, not reassurance, and conflating the two is how an outbreak gets
missed. Where a feed is offline, regional figures state explicitly that they
describe only the facilities still reporting.

Feed-health values are deterministic synthetic demonstration data associated
with fictional facilities. They do not represent or compare the real-world
performance, maturity, reliability, or interoperability capabilities of Epic,
Oracle Health, MEDITECH, or any other vendor. One scripted delay at HOSP-C on
Day 3 exists solely to exercise the `DELAYED` presentation and to show that data
quality and epidemiological severity move independently.

---

## 8. Explainability

Nothing in LabSentinel asks to be taken on trust. The explainability surfaces:

- **Why This Signal?** — a plain-language panel available from the dashboard and
  the investigation view, answering five questions in order: *What changed?*,
  *Where is it happening?*, *Which facilities contributed?*, *How long has it
  persisted?* and *Why did the score reach this severity?*
- **Day-to-Day Change** — an explicit comparison against the previous
  surveillance day covering tests, positive results, positivity, affected
  hospitals, affected geographic areas, persistence and the composite score,
  each with its previous value, current value, delta and direction, plus a
  sentence describing what actually moved. Day 1 correctly reports that no
  previous day exists rather than inventing a comparison.
- **Score-component breakdown** — every component's raw evidence, normalized
  0–100 score, weight and point contribution, summing visibly to the composite.
- **Contributing facilities** — which facilities are above the detection margin
  on the selected day, and which are not.
- **Geographic spread** — how many surveillance areas are affected, subject to
  the privacy rule in section 9.
- **Persistence** — how many consecutive days regional positivity has stayed
  above baseline.
- **Data Confidence** — the full component breakdown from section 6, with a
  written explanation naming the weakest contributor.
- **Feed health** — per-facility status, last event, events received, mapping
  and completeness percentages, and failed/duplicate counts.

---

## 9. Adaptive geographic privacy

Small counts tied to a small area are the classic re-identification risk in
public-health surveillance: *"2 positives in one ZIP code"* can point at a person
in a way *"34 positives across a county"* cannot.

LabSentinel therefore applies an adaptive rule to sensitive area-level counts:

1. If the count meets the minimum display threshold, the exact figure is shown
   at area level.
2. If it does not, the exact number is **suppressed** and displayed as `<5`.
3. Where a broader geographic level has enough to report, the signal is **rolled
   up** and reported there instead — under the U.S. configuration, ZIP → County.
4. If no broader level has enough either, the UI says so plainly rather than
   showing a misleadingly precise number.

The roll-up chain is derived from the active geographic configuration (section
14), not hard-coded, so a district/province deployment produces its own chain
from the same code. The behaviour is visible across the simulation: on Day 1 all
three areas are suppressed and the signal reports at county level; by Days 4–5
none are.

**The current minimum display threshold is 5. It is configurable and
illustrative, and it is NOT presented as an official HIPAA threshold.** It is a
demonstration device — not a de-identification determination, not a legal
threshold, and not a substitute for a disclosure-review process. A real
deployment would require a documented statistical or expert-determination
method. Every suppressed value carries the note:

> Illustrative prototype privacy rule — not an official HIPAA legal threshold or a de-identification determination.

Regardless of the threshold, **no precise synthetic patient location exists
anywhere in this prototype.** The finest geography modelled is a synthetic
surveillance area.

---

## 10. Human-in-the-loop investigation

A signal is a prompt for a person, not a conclusion. Each alert carries an
investigation record with an explicit status, an assigned analyst, review notes
and a full audit timeline.

| Status | Meaning |
|--------|---------|
| `NEW` | Raised, not yet picked up |
| `UNDER REVIEW` | An analyst has taken ownership and started an epidemiological review |
| `MONITORING` | Kept open and watched across further days |
| `ESCALATED` | Referred onward for fuller investigation |
| `DISMISSED` | Judged not to warrant further action |
| `CONFIRMED CONCERN` | An analyst judgement that the signal warrants follow-up |
| `CLOSED` | Review closed — can be reopened later |

Analyst actions: **Acknowledge**, **Begin Review**, **Continue Monitoring**,
**Escalate**, **Dismiss**, **Mark Confirmed Concern** and **Close**. Escalate,
Dismiss and Mark Confirmed Concern **require a written note** — the transitions
that carry the most judgement cannot be made silently. Reopening from `DISMISSED`
or `CLOSED` is deliberately allowed, because a signal that was set aside can turn
out to matter. Every transition is timestamped, attributed and appended to a
timeline that is never rewritten.

> `"Confirmed Concern"` records an analyst judgement that the signal warrants follow-up. It is **not** a laboratory-confirmed outbreak.

> **LabSentinel supports epidemiological review but does not replace public-health investigation or clinical judgment.**

### Alerts, acknowledgement and session state

Three things that are easy to conflate are kept strictly separate:

| Concept | Meaning | Changes when? |
|---------|---------|---------------|
| **Detection** | The day the data first crossed a trigger | Never — it is a property of the data |
| **New today** | `detectedDay === currentDay` | With the simulation day |
| **Acknowledgement** | A person pressed Acknowledge | Only on explicit user action |

Each alert carries a **frozen detection-time snapshot**: the detail line,
severity, geography, facility count, volume, positivity and composite score as
they stood on its detection day. Advancing the simulation never rewrites them,
so an alert stamped *Nov 4, 9:05 AM* still reports Day 2's `+24% vs baseline`
when you are looking at Day 5. *Investigate* opens the alert's detection-time
breakdown by default; the current-conditions view is a deliberate, labelled
switch (`?alert=<id>&view=detection|current`).

The selected day, acknowledgements and investigation state persist through a
browser refresh via `sessionStorage`. Everything read back is validated — a
corrupt payload, an out-of-range day or a malformed record is discarded and the
prototype falls back to Day 1 rather than crashing. Autoplay is deliberately
never persisted, so a refresh always resumes paused. **Reset Simulation** stops
autoplay, clears acknowledgements, returns to Day 1 and clears the stored
session.

---

## 11. Public-health reporting simulation

`/reports` demonstrates the shape of a reportability workflow without performing
one.

| Status | Meaning |
|--------|---------|
| `DRAFT` | Report prepared from a frozen snapshot of the signal, still being worked on |
| `READY FOR REVIEW` | Marked ready for a second pair of eyes |
| `APPROVED` | Approved for simulated submission |
| `SIMULATED SUBMISSION` | The simulated submission has been run |

A **Simulate Failure** path and a **Return to Approved** retry are also provided,
so the failure mode a real transport could hit is visible rather than hidden.
Each report freezes what it shows at the moment it is prepared — signal id,
detection day, affected facilities and areas, area disclosure subject to the
same privacy rule as the UI, volumes, positivity, composite score and data
confidence — and records every transition in an audit timeline.

**No information is transmitted externally.** "Simulate Submission" changes a
status field in browser memory and does nothing else:

> Prototype reporting simulation — no information is transmitted to any public-health authority.

> This prototype does not implement electronic case reporting (eCR), electronic laboratory reporting (ELR), or any connection to a state health department, the CDC or the WHO. Nothing leaves this browser.

---

## 12. Vendor sidecar concept

The point the prototype is making: **the EHR shell changes, LabSentinel does
not.**

One reusable `VendorSidecar` component is rendered, unchanged, inside all three
simulated environments:

- **Simulated Epic Environment** — Worcester Central Medical Center
- **Simulated Oracle Health Environment** — Central Massachusetts Regional Hospital
- **Simulated MEDITECH Environment** — Shrewsbury Community Medical Center

There is deliberately no per-vendor variant of the component. Each shell is a
generic demonstration wrapper that does not imitate any vendor's proprietary
interface; only the wrapper differs, while the regional signal, confidence, feed
status and privacy behaviour inside the sidecar are identical everywhere.

**Differences in synthetic feed values do not represent comparisons of real
vendor performance.** Feed-health values are deterministic synthetic
demonstration data associated with fictional facilities. They do not represent
or compare the real-world performance, maturity, reliability, or
interoperability capabilities of Epic, Oracle Health, MEDITECH, or any other
vendor. The spread exists only so the UI has a healthy feed, a noisier one and
one that can tip into `DELAYED` to show.

---

## 13. Laboratory standards

The prototype models one surveillance syndrome — **Respiratory Viral Syndrome** —
composed of three laboratory concepts, each normalized to a real LOINC
identifier:

| Test | LOINC | Specimen | Syndrome |
|------|-------|----------|----------|
| Influenza A RNA | `92142-9` | Nasopharyngeal swab | Respiratory Viral Syndrome |
| SARS-CoV-2 RNA | `94500-6` | Nasopharyngeal swab | Respiratory Viral Syndrome |
| RSV RNA | `85479-4` | Nasopharyngeal swab | Respiratory Viral Syndrome |

LOINC codes are real terminology identifiers, used here to demonstrate what
normalization to a shared vocabulary makes possible. **No result in this
prototype is drawn from a real laboratory.** Records are FHIR-style `Observation`
objects — local TypeScript, never a parsed bundle from a FHIR server — carrying a
LOINC code, test name, specimen, result, status and simulation-calendar
timestamp. Terminology mapping quality is one of the Data Confidence components
(section 6), so the cost of codes that do not normalize cleanly is visible
rather than assumed away.

---

## 14. Configurable geography

ZIP codes are a United States artefact. Most of the world does not have them, so
hard-coding ZIP as *the* geographic unit would have made the prototype unusable
outside the US. Geography is therefore a **configuration**: a deployment declares
its own levels and units, and the rest of the application — including the privacy
roll-up chain in section 9 — follows that configuration.

**US example (the active configuration):**

```
Facility → ZIP → County → State → Country
```

**Global architecture example (declared template):**

```
Facility → District → Province → Country
```

> LabSentinel is geographically configurable. ZIP codes are used in the U.S. prototype, but deployments may use districts, municipalities, provinces, regions or other jurisdictional units.

**The current active prototype uses Worcester-area geography**: three synthetic
surveillance areas (01604, 01605, 01545) inside Worcester County, Massachusetts,
United States. The global template declares an alternative *level structure
only* — no second-country dataset is built, and it carries zero units, so the
prototype never implies data it does not have.

Map polygons are generated hexagons around approximate centre points. They are
not ZIP Code Tabulation Areas and must not be read as boundaries.

---

## 15. Current laboratory-first architecture

**LABORATORY is currently the only active surveillance source.** It is the only
stream carrying data in this prototype.

```
  SIMULATED EPIC   SIMULATED ORACLE HEALTH   SIMULATED MEDITECH
     (HOSP-A)             (HOSP-B)                (HOSP-C)
        │                    │                        │
        └────────────────────┼────────────────────────┘
                             ▼
               FHIR / LOINC NORMALIZATION
                             ▼
                 LABSENTINEL SIGNAL ENGINE
                             │
     ┌───────────────────────┼───────────────────────┐
     │  test-volume surveillance                     │
     │  positivity surveillance                      │
     │  multi-site correlation                       │
     │  geographic clustering                        │
     │  persistence                                  │
     └───────────────────────┬───────────────────────┘
                             ▼
      COMPOSITE OUTBREAK SIGNAL SCORE  +  DATA CONFIDENCE SCORE
                             │
     ┌────────────┬──────────┼──────────┬────────────┐
     ▼            ▼          ▼          ▼            ▼
  PUBLIC      OUTBREAK     HUMAN    REPORTING      EHR
  HEALTH        MAP        REVIEW   SIMULATION   SIDECAR
 DASHBOARD   (privacy-  (investig-   (nothing   (identical
              aware)      ation)     is sent)   everywhere)
```

Internally the laboratory stream is mapped into a **source-agnostic
`SurveillanceSignal` shape** through an adapter interface. The laboratory
adapter is the only implemented one; it reads the existing authoritative dataset
and introduces no new data. That abstraction is what makes section 16 possible
without fabricating anything.

---

## 16. Future multi-source architecture

The architecture is designed to accept additional surveillance streams. Each of
the following is declared in the source registry so the shape of the abstraction
is visible and testable, and each reports itself as `PLANNED` and returns no
data.

| Source | Status | What it would carry | Example metrics |
|--------|--------|--------------------|-----------------|
| Laboratory | **ACTIVE** | Normalized FHIR-style `Observation` resources | `test_volume`, `positivity_rate` |
| Emergency Department | **PLANNED — not active** | Chief-complaint and syndromic categorisation of ED visits; earlier but less specific than laboratory confirmation | `visit_count`, `syndromic_share` |
| Hospitalization | **PLANNED — not active** | Admissions and bed occupancy attributable to the syndrome; a severity signal rather than an incidence signal | `admissions`, `occupancy_rate` |
| Wastewater | **PLANNED — not active** | Pathogen concentration from sewershed sampling; population-level and independent of who seeks testing | `copies_per_litre`, `normalized_concentration` |
| Pharmacy | **PLANNED — not active** | Over-the-counter and prescription dispensing patterns; a behavioural proxy | `dispense_count`, `category_share` |
| Other streams | **PLANNED — not active** | Extension point for school absenteeism, telehealth triage, veterinary surveillance or any stream a jurisdiction already collects | `count`, `rate` |

> The current LabSentinel prototype is laboratory-first. The architecture is designed to support additional surveillance streams in future versions, including emergency-department activity, hospitalization, wastewater and pharmacy signals.

**These are future capabilities and are not currently active.** No
emergency-department, hospitalisation, wastewater or pharmacy data exists
anywhere in this prototype, synthetic or otherwise, and none is shown on the
dashboard. Inventing it would put fabricated signals in front of an analyst as
though they were real inputs — precisely the failure this project guards against.
A future stream would implement the same adapter contract and nothing else would
need to change.

---

## 17. Future federated surveillance

Under the current prototype, record-level synthetic observations flow to a
central signal engine. Under a **federated** model, each participating facility
would compute its own aggregate locally and share only that, so patient-level
information never needs to leave the organisation at all.

> Federated surveillance can reduce unnecessary movement of patient-level information by allowing local systems to calculate and share aggregated surveillance signals.

```
  FACILITY A            FACILITY B            FACILITY C
  local compute         local compute         local compute
       │                     │                     │
   aggregate only        aggregate only        aggregate only
       └─────────────────────┼─────────────────────┘
                             ▼
                REGIONAL SIGNAL AGGREGATION LAYER
```

`/architecture` shows an example aggregate payload — counts, positivity, the
geographic unit at the configured level and a quality indicator, with no
record-level content — purely to make the shape of the idea concrete.

> **Future Architecture Concept — not implemented in the current prototype.**

Every element of this section is labelled `FUTURE` in the application. Nothing
federated runs today.

---

## 18. Architecture status

`/architecture` labels every element with one of four statuses, so a viewer can
never mistake a plan for a capability:

| Status | Meaning | Examples |
|--------|---------|----------|
| `IMPLEMENTED` | Built and working in this prototype | Normalization layer, signal engine, composite score, data confidence, privacy roll-up, dashboard, vendor sidecar |
| `PROTOTYPE` | Demonstrated, but as a simulation rather than the real thing | Simulated Epic / Oracle Health / MEDITECH environments, simulated FHIR ingestion, human review and reporting simulation |
| `PLANNED` | Intended for a later stage; does not exist today | Real FHIR endpoints, backend API, persistent database, event processing, hosted terminology service, statistical detection engine, geospatial intelligence, SMART on FHIR sidecar, eCR/ELR reporting interfaces |
| `FUTURE` | A conceptual direction, not a commitment | Federated surveillance, additional multi-source streams |

**Never assume a planned or future element exists.** The application never
renders a `PLANNED` or `FUTURE` element as though it were live: future sources
return empty, the federated panel is explicitly labelled as a concept, and the
global geographic template carries zero units.

---

## 19. Current limitations

Worth stating plainly, because they are the difference between a demonstration
and a product:

- **Synthetic data.** Every figure is authored or derived from an authored
  integer dataset. No real test, patient, facility or population is represented.
- **Simulated vendor environments.** The Epic, Oracle Health and MEDITECH shells
  are generic demonstration wrappers, not vendor software, and the synthetic
  feed differences between them are not vendor comparisons.
- **No production backend.** There is no server, no API and no service boundary
  — the entire application runs in the browser.
- **No persistent production database.** State lives in React context and
  `sessionStorage`. Nothing survives closing the tab and nothing is stored
  anywhere else.
- **No live FHIR endpoints.** Nothing authenticates against, queries or parses a
  response from a FHIR server. The FHIR-shaped records are local TypeScript
  objects and the Interoperability Status panel is a static depiction.
- **No real SMART on FHIR launch.** No app is registered with any EHR, no launch
  context is negotiated and no OAuth 2.0 scope is requested. The sidecar is a
  demonstration of placement, not an integration.
- **No validated epidemiological scoring.** Both scores are illustrative,
  fixed-weight models with no sensitivity, specificity, PPV or lead-time
  characterisation. Alerts are rule-triggered against fixed constants, not
  statistically detected against baselines estimated from history.
- **No real public-health reporting.** No eCR, no ELR, no jurisdiction
  onboarding, and no transmission of any kind to any authority.
- **Synthetic geography.** Map polygons are generated hexagons, not ZIP Code
  Tabulation Areas, and must not be read as boundaries.
- **Narrow scope.** Three facilities, one syndrome, five days, one county. No
  multi-syndrome support, facility onboarding, historical baseline estimation,
  seasonality adjustment or cross-region aggregation.
- **No access control.** No users, roles, sessions or audit logging at the system
  level. The "Public Health Analyst" identity is decorative.
- **Dual-axis chart.** The dashboard trend chart plots volume and positivity on
  two y-scales. Dual-axis charts can imply correlations the data does not
  support; both axes are labelled and colour-keyed, and `/analytics` shows each
  measure on its own scale.

---

## 20. Planned next capstone stage

| Area | Planned work |
|------|--------------|
| **Backend API** | An authenticated service boundary replacing browser-only computation, with a versioned contract for signals, alerts, investigations and reports |
| **Persistent database** | Durable storage for observations, aggregates and review state, replacing `sessionStorage`; a time-series store for aggregates plus a columnar store for record-level analysis |
| **Real FHIR ingestion** | Genuine FHIR `Observation` retrieval per participating organization — `$export` for backfill, subscriptions or scheduled pulls for incremental delivery, HL7 v2 ORU for sites without a FHIR facade |
| **SMART on FHIR integration** | A registered app launched in EHR context with OAuth 2.0 and proper scopes, plus CDS Hooks for point-of-care surfacing |
| **Stronger statistical surveillance methods** | Established aberration detection — EARS C1/C2/C3, Farrington-style seasonal regression, CUSUM/EWMA — with baselines estimated per facility from its own history, adjusted for seasonality and day of week, replacing the fixed-weight score |
| **Geospatial validation** | Real boundary data, space-time scan statistics for cluster detection, and a documented disclosure-review process replacing the illustrative suppression threshold |
| **Security and access controls** | Authentication, RBAC with jurisdiction scoping, multi-tenant isolation, comprehensive audit logging and a documented data-use agreement per participating organization |
| **Deployment architecture** | Multi-tenant hosting, streaming ingestion so signals update continuously, data-quality monitoring per feed, on-call alerting for feed outages, and CI/CD with environment separation |

### What a production system would additionally need

**Terminology.** A hosted terminology service for LOINC, SNOMED CT and UCUM,
with an explicit value set defining each surveillance syndrome, version pinning,
and a mapping-review workflow for local codes that do not normalize cleanly.

**Privacy.** De-identification at the edge, inside each organization's boundary,
before any data leaves it — geographic generalization where counts are small,
small-cell suppression, and a documented re-identification risk assessment, with
a BAA where required.

**Evaluation.** Any composite index would need prospective evaluation against
confirmed outbreaks, with reported sensitivity, specificity, PPV and lead time,
before anyone acted on it.

**Delivery.** An API for downstream public-health systems (NSSP/ESSENCE, state
reportable-disease systems) and genuine eCR / ELR pipelines with jurisdiction
onboarding.

**Governance.** Clear ownership of the signal definitions, a change-control
process for thresholds, published methodology, and an explicit statement of what
the system does and does not detect.

---

## 21. Technology stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 (`react` ^18.3.1, `react-dom` ^18.3.1) |
| Language | TypeScript 5 (strict) |
| Build tool | Vite 5 (`@vitejs/plugin-react`) |
| Styling | Tailwind CSS 3 + PostCSS + Autoprefixer |
| Routing | React Router 6 (`react-router-dom` ^6.26.2) |
| Charts | Recharts 2 |
| Maps | React Leaflet 4 + Leaflet 1.9 |
| Map tiles | OpenStreetMap |
| State | React Context + `sessionStorage` |
| Data | Local TypeScript modules |
| Tests | Vitest 2 — 265 unit tests across 9 files |
| Hosting | GitHub Pages via GitHub Actions |
| Backend | None |
| Database | None |
| Authentication | None |

No backend, no database, no authentication, no machine learning, no live FHIR
connection.

### Project structure

```
src/
├── components/
│   ├── architecture/  FlowDiagram, StatusBadge, FederatedConcept
│   ├── common/        Card, DemoBanner, States, ErrorBoundary, PageMeta,
│   │                  DataConfidenceCard, FeedHealthCard, DayOverDayChange,
│   │                  PrivacyValue
│   ├── dashboard/     SectionHeading, CurrentSituationCard, KpiCard, TrendChart,
│   │                  HighestRiskArea, DataQualitySummary, CurrentAlertSection
│   ├── hospitals/     HospitalDashboard, VendorSidecar, FhirStatusPanel
│   ├── layout/        AppShell, Sidebar, TopBar
│   ├── map/           OutbreakMap, ZipDetailPanel, MapLegend
│   └── signals/       SignalTable, SignalInvestigation, SeverityBadge,
│                      WhyThisSignalPanel, InvestigationWorkflowPanel
├── context/           SimulationContext.tsx   ← the single source of truth
├── data/              dataset, observations, simulation, hospitals, tests,
│                      zipAreas, feedHealth, geography
├── lib/               signalScore, dataConfidence, dayOverDay, geographicPrivacy,
│                      investigationWorkflow, reporting, surveillanceSources,
│                      selectors, analytics, alerts, sessionState, format
│   └── __tests__/     265 unit tests across 9 files
├── pages/             one file per route
└── types/
```

`src/data/` holds immutable synthetic facts. `src/lib/` holds pure functions —
all arithmetic lives here. `src/pages/` and `src/components/` are presentation
only.

---

## 22. Local development

Requires **Node.js 18 or newer** (developed against Node 24) and npm.

### Installation

```bash
git clone https://github.com/chinorumbam2000-ux/labsentinel.git
cd labsentinel
npm install
```

### Development server

```bash
npm run dev       # http://localhost:5173/labsentinel/
```

### Build, test and verify

```bash
npm run build       # type-check with tsc, then production build to dist/
npm run preview     # serve the production build locally
npm test            # run the unit tests once
npm run test:watch  # run the unit tests in watch mode
npm run lint        # type-check only, no build output (tsc -b --force)
```

The outbreak map loads OpenStreetMap tiles over the network. Without internet the
basemap is blank, but the synthetic surveillance-area polygons, severity colours,
legend, tooltips and detail panel all still work — the data layer is
self-contained.

### Deployment

The site is hosted on **GitHub Pages** and rebuilt automatically by the workflow
in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

```bash
git push origin main    # every push to main redeploys the live site
```

The workflow installs dependencies, runs the unit tests, type-checks, builds and
publishes `dist/`. If the tests or the type-check fail, nothing is deployed and
the previous version stays live.

**Two things make routing work on GitHub Pages.** Pages serves static files from
a sub-path and has no server-side rewrites, so the project is configured for
both:

1. **Sub-path base.** `vite.config.ts` sets `base: '/labsentinel/'`, and
   `main.tsx` passes Vite's `BASE_URL` to React Router as its `basename`. This is
   why built asset URLs are `/labsentinel/assets/...`. If you fork this under a
   different repository name, change `BASE_PATH` in `vite.config.ts` to match.
2. **SPA fallback.** A direct request to `/labsentinel/dashboard` is not a file,
   so Pages serves [`public/404.html`](public/404.html). That page stashes the
   requested route in a query string and bounces to the app root; a small script
   in `index.html` restores the real URL with `history.replaceState` before React
   mounts. Deep links, refreshes and shared investigation URLs all resolve to the
   right screen.

`public/.nojekyll` stops GitHub from running the files through Jekyll.

**Deploying somewhere else.** For a host that serves from the domain root
(Netlify, Vercel, Cloudflare Pages), set `BASE_PATH` to `'/'` in
`vite.config.ts` and add that host's SPA rewrite (`/* /index.html 200`). The
`404.html` fallback is then unnecessary but harmless.

---

*LabSentinel is a prototype. Synthetic data only. No real hospital, patient,
laboratory, EHR vendor system or public-health authority is connected to this
application.*
