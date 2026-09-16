# LabSentinel

**From laboratory signals to population-level outbreak intelligence**

---

## ⚠ DEMO ENVIRONMENT — Synthetic data only

**This is a classroom prototype. Everything in it is fabricated.**

- All three hospitals are **fictional**. They do not exist and are not modelled on any real healthcare organization.
- All patients are **synthetic placeholders** (`SYN-P0001` … `SYN-P0699`). There is no PHI anywhere in this repository — no names, no addresses, no dates of birth, no real identifiers.
- All laboratory results are **invented** for demonstration.
- The prototype is **not connected** to any real hospital, patient record, public-health agency, laboratory information system, FHIR server, or to Epic, Oracle Health or MEDITECH. The vendor environments shown are generic simulated shells, clearly labelled *"Simulated … Environment"*, and deliberately do not reproduce any vendor's proprietary interface.
- **The LabSentinel Composite Outbreak Signal Score used in this prototype is an illustrative, non-validated demonstration model and is not intended for clinical diagnosis or public-health decision-making.**

Every screen carries a persistent `DEMO ENVIRONMENT — Synthetic data only` banner.

---

## What LabSentinel is

LabSentinel demonstrates a **vendor-agnostic public-health early-warning platform**. It shows how standardized laboratory data arriving from several independent healthcare organizations could be normalized to a common terminology, combined into a single regional signal, and pushed back into each organization's own EHR workspace as a lightweight sidecar.

The demonstration centres on one surveillance syndrome — **Respiratory Viral Syndrome** — across three fictional facilities in Worcester County, MA, over a five-day simulated outbreak.

```
  EPIC LAB        ORACLE HEALTH LAB      MEDITECH LAB
      │                   │                   │
      └───────────────────┼───────────────────┘
                          ▼
             FHIR / LOINC NORMALIZATION
                          ▼
              LABSENTINEL SIGNAL ENGINE
                          │
      ┌───────────────────┼───────────────────┐
      │  test-volume surveillance             │
      │  positivity surveillance              │
      │  multi-site correlation               │
      │  geographic clustering                │
      │  persistence                          │
      └───────────────────┬───────────────────┘
                          ▼
           COMPOSITE OUTBREAK SIGNAL SCORE
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
 PUBLIC HEALTH      ZIP-LEVEL          EHR SMART
  DASHBOARD        OUTBREAK MAP         SIDECAR
```

The point the prototype is making: **the EHR shell changes, LabSentinel does not.** The same `VendorSidecar` component renders unchanged inside all three simulated vendor environments.

---

## Running locally

Requires **Node.js 18 or newer** (developed against Node 24) and npm.

```bash
npm install     # install dependencies
npm run dev     # start the dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build     # type-check with tsc, then production build to dist/
npm run preview   # serve the production build locally
npm test          # run the unit tests once
npm run test:watch
npm run lint      # type-check only
```

The outbreak map loads OpenStreetMap tiles over the network. Without internet the basemap is blank, but the synthetic surveillance-area polygons, severity colours, legend, tooltips and detail panel all still work — the data layer is self-contained.

---

## How the simulation works

There is exactly one piece of global state: **`currentDay`**, held in `SimulationContext` and ranging from 1 to 5. Every page reads it from that single context, so no two screens can disagree.

When the day changes, this cascade runs in a single render:

```
currentDay changes
   ├── observations filtered to day <= currentDay
   ├── aggregate scenario for the day selected
   ├── composite signal score recalculated
   ├── severity reclassified
   ├── dashboard KPIs and charts updated
   ├── map severity colours and ZIP panel updated
   ├── alerts regenerated from scratch
   ├── hospital dashboards updated
   └── all three vendor sidecars updated
```

Controls are available in the top bar (Previous / Next / Reset) on every page, and in full on `/simulation` (Previous Day, Advance Day, Auto Play, Pause, Reset Simulation). Auto Play advances roughly every 3 seconds and stops at Day 5. Previous cannot go below Day 1; Advance cannot go beyond Day 5; Reset always returns to Day 1.

### The five days

| Day | Stage | Tests | Positives | Positivity | Hospitals | ZIPs | Persistence | Score |
|-----|-------|-------|-----------|-----------|-----------|------|-------------|-------|
| 1 | Baseline | 100 | 8 | 8.0% | 0 | 0 | 0 | 0 (Low) |
| 2 | Early Local Increase | 124 | 12 | 9.7% | 1 | 1 | 1 | 24 (Watch) |
| 3 | Rising Positivity | 141 | 19 | 13.5% | 2 | 2 | 2 | 50 (Moderate) |
| 4 | Multi-Site Cluster | 158 | 26 | 16.5% | 3 | 3 | 3 | 74 (High) |
| 5 | Regional Early-Warning Signal | 176 | 34 | 19.3% | 3 | 3 | 4 | 87 (Critical) |

Baseline test volume is 100; baseline positivity is 8.0% (Day 1 is the baseline day).

Positivity is **always** derived as positives ÷ tests and rounded only for
display. Affected facilities, affected areas and persistence are derived too — a
facility counts as affected once its own positivity sits at least 3 percentage
points above baseline, and persistence counts consecutive days with regional
positivity above baseline. Nothing in that table is stored independently of the
counts, so the figures cannot drift apart.

### The simulation calendar

Observations and alerts are stamped with a fixed simulation calendar running
**Mon 3 Nov 2025 → Fri 7 Nov 2025**. That is deliberately separate from the real
session clock, which only ever reports when this browser tab last recalculated.
Both are labelled wherever they appear (`Simulation date:` vs `Session updated`).

### The synthetic data

- **699 deterministic FHIR-style `Observation` records** — one per test counted in the dataset, ids `OBS-0001` … `OBS-0699`, patients `SYN-P0001` … `SYN-P0699`. The laboratory table therefore reconciles exactly with every hospital, area and regional total. The 25 representative records named in the blueprint are retained verbatim as the first five records of each simulated day. Generation is fully deterministic — no randomness, no dependence on the wall clock, identical on every render and reload.
- **Three fictional hospitals:**

  | ID | Hospital | Vendor | ZIP |
  |----|----------|--------|-----|
  | HOSP-A | Worcester Central Medical Center | Epic | 01604 |
  | HOSP-B | Central Massachusetts Regional Hospital | Oracle Health | 01605 |
  | HOSP-C | Shrewsbury Community Medical Center | MEDITECH | 01545 |

- **Three laboratory concepts** grouped into one syndrome:

  | Test | LOINC |
  |------|-------|
  | Influenza A RNA | 92142-9 |
  | SARS-CoV-2 RNA | 94500-6 |
  | RSV RNA | 85479-4 |

The authoritative dataset is a table of **integer per-day, per-site test and
positive counts** (`src/data/dataset.ts`). Regional and cumulative totals are
sums of it; positivity is a ratio of it; the composite score's inputs are derived
from it. A test either happened or it did not, and a result is either positive or
negative — storing a percentage alongside the counts is exactly what previously
allowed the two to disagree.

---

## How the composite score works

The score is **always calculated**, never hard-coded. Five components, each normalized to 0–100 and then weighted:

| Component | Weight | Max points | Normalization |
|-----------|--------|-----------|---------------|
| Test Volume | 25% | 25 | `clamp(volumeIncreasePercent)` |
| Positivity | 30% | 30 | `clamp(((positivityRate − 8.0) / 15) × 100)` |
| Affected Facilities | 20% | 20 | `clamp((affectedFacilities / 3) × 100)` |
| Geographic Spread | 15% | 15 | `clamp((affectedZipCodes.length / 3) × 100)` |
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

Calculated progression: **Day 1 → 0, Day 2 → 24, Day 3 → 50, Day 4 → 74, Day 5 → 87.** The Day 5 breakdown is 19/25 + 23/30 + 20/20 + 15/15 + 10/10 = 87.

These scores are recalculated from the corrected integer dataset. They differ by
a point or two from the blueprint's illustrative figures (0/23/49/74/86), which
were produced from a stored positivity that had drifted away from the underlying
counts. The formula and the severity thresholds are unchanged, and the severity
band for every day is the same: Low → Watch → Moderate → High → Critical.

`/signals` → *Investigate* opens the Signal Investigation view, which shows each component's raw evidence, its normalized score, its weight and its point contribution, alongside the weighted total.

Both disclaimers appear on the Signals and Investigation screens:

> Early-warning signal — not a confirmed outbreak. Epidemiological review required.

> The LabSentinel Composite Outbreak Signal Score used in this prototype is an illustrative, non-validated demonstration model and is not intended for clinical diagnosis or public-health decision-making.

---

## Alerts, acknowledgement and session state

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
when you are looking at Day 5 — where the current figure is `+76%`. Current
regional figures are shown in their own clearly labelled panel below the table.

Statuses are `New today` (detected on the selected day), `Active` (detected
earlier, not yet acknowledged) and `Acknowledged` (a person pressed the button).
Acknowledging records both the simulation day/time and the real timestamp, and
they are listed in an acknowledgement log. The notification badge counts
**alerts awaiting acknowledgement** and says so in its accessible label.

Stepping backwards hides alerts detected on later days without inventing or
discarding any acknowledgement; stepping forward restores the full history with
its snapshots intact.

The selected day and acknowledgements persist through a browser refresh via
`sessionStorage`. Everything read back is validated — a corrupt payload, an
out-of-range day or a malformed acknowledgement is discarded and the prototype
falls back to Day 1 rather than crashing. Autoplay is deliberately never
persisted, so a refresh always resumes paused. **Reset Simulation** stops
autoplay, clears every acknowledgement, returns to Day 1 and clears the stored
session.

---

## Accessibility and resilience notes

- Every surveillance area can be opened from the **Surveillance areas table** as
  well as from the map, so area selection does not depend on clicking an SVG
  polygon. Those ZIP cells are real buttons with descriptive labels.
- Map instructions sit outside the map canvas at every width, so they cannot
  overlap the zoom control, the attribution or the legend. The legend is an
  overlay only at `lg` and above; below that it moves into the card footer.
- A visible focus ring is applied globally via `:focus-visible`.
- If the OpenStreetMap basemap fails to load, the map shows a labelled fallback
  notice and a **Retry basemap** control. The surveillance polygons, severity
  colours, tooltips, detail panel and every figure on the page are unaffected,
  because none of them depend on the tile layer.

---

## Routes

| Route | Screen |
|-------|--------|
| `/` | Demo landing page |
| `/dashboard` | Public Health Dashboard — 5 KPI cards, volume/positivity trend, geographic preview, current alert |
| `/map` | Outbreak Map — synthetic surveillance areas with zoom, pan, reset, legend, hover, click-to-detail |
| `/laboratory-data` | Laboratory Observations (FHIR) — search, six filters, sorting, pagination, horizontal overflow |
| `/signals` | Signals & Alerts with per-alert acknowledgement, and the Signal Investigation breakdown |
| `/hospitals` | Hospital dashboards + the vendor sidecar demonstration (Epic / Oracle Health / MEDITECH tabs) |
| `/analytics` | Trends — Test Volume, Positivity, Signal Score, Geographic Spread |
| `/simulation` | Outbreak simulation controls and the day-by-day progression |

---

## Technology stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Language | TypeScript (strict) |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router 6 |
| Charts | Recharts 2 |
| Maps | React Leaflet 4 + Leaflet 1.9 |
| Map tiles | OpenStreetMap |
| State | React Context |
| Data | Local TypeScript modules |
| Tests | Vitest |
| Backend | None |
| Database | None |

No backend, no database, no authentication, no machine learning, no live FHIR connection.

### Project structure

```
src/
├── components/
│   ├── layout/      AppShell, Sidebar, TopBar
│   ├── dashboard/   KpiCard, SignalScoreCard, TrendChart, AlertCard
│   ├── map/         OutbreakMap, ZipDetailPanel, MapLegend
│   ├── signals/     SignalTable, SignalInvestigation, SeverityBadge
│   ├── hospitals/   HospitalDashboard, VendorSidecar, FhirStatusPanel
│   └── common/      Card, DemoBanner, States, ErrorBoundary
├── context/         SimulationContext.tsx   ← the single source of truth
├── data/            hospitals, tests, observations, simulation, zipAreas
├── lib/             signalScore, selectors, analytics, alerts, format
│   └── __tests__/   44 unit tests
├── pages/           one file per route
└── types/
```

`src/data/` holds immutable synthetic facts. `src/lib/` holds pure functions — all arithmetic lives here. `src/pages/` and `src/components/` are presentation only.

---

## Prototype limitations

Worth stating plainly, because they are the difference between a demonstration and a product:

- **The score is not validated.** The weights, denominators and thresholds were chosen to produce a legible teaching progression, not fitted to or evaluated against real epidemiological data. It has no sensitivity, specificity or lead-time characterisation.
- **No real interoperability.** Nothing negotiates SMART on FHIR scopes, authenticates against a FHIR server, or parses a real `Observation` bundle. The FHIR-shaped records are local TypeScript objects and the "Interoperability Status" panel is a static depiction.
- **Daily test volumes are authored.** The per-day regional volumes (100 → 176) and the per-site shares come from the specification rather than from a modelled population. Everything downstream of them — positives, positivity, per-site and per-area figures, observation records, detection flags and the score — is derived from the single integer dataset.
- **Alerts are rule-triggered, not statistically detected.** Thresholds are fixed constants, not baselines estimated from history.
- **Geography is synthetic.** The map polygons are generated hexagons around approximate centre points. They are not ZIP Code Tabulation Areas and must not be read as boundaries.
- **Only three sites, one syndrome, five days.** There is no multi-syndrome support, no facility onboarding, no historical baseline estimation and no seasonality adjustment.
- **Session-only persistence.** The selected day and your acknowledgements survive a refresh via `sessionStorage`, validated on read and discarded if malformed. Nothing is stored on a server, nothing survives closing the tab, and autoplay always comes back paused.
- **No access control.** There are no users, roles, sessions or audit logging. The "Public Health Analyst" identity in the top bar is decorative.
- **Dual-axis chart.** The dashboard trend chart plots volume and positivity on two y-scales because the specification calls for it. Dual-axis charts can imply correlations that the data does not support; both axes are explicitly labelled and colour-keyed to mitigate this, and `/analytics` shows each measure on its own scale.
- **Single-region scope.** The prototype models one county with no cross-region aggregation or state/federal reporting path.

---

## Future production architecture

A production system would replace almost every layer of this prototype:

**Ingestion.** A real SMART on FHIR / bulk-FHIR pipeline per participating organization, with OAuth 2.0 client credentials, `$export` for backfill and subscriptions or scheduled pulls for incremental delivery. HL7 v2 ORU feeds for sites without a FHIR facade.

**Terminology.** A hosted terminology service for LOINC, SNOMED CT and UCUM, with an explicit value set defining each surveillance syndrome, version pinning, and a mapping-review workflow for local codes that do not normalize cleanly.

**Privacy.** De-identification at the edge, inside each organization's boundary, before any data leaves it — geographic generalization to ZIP3 or county where counts are small, small-cell suppression, and a documented re-identification risk assessment. A data use agreement per participating organization and a BAA where required.

**Storage and compute.** A time-series store for aggregates plus a columnar warehouse for record-level analysis; a streaming layer so signals update continuously rather than on a five-step timer.

**Detection.** Replace the fixed-weight score with established aberration-detection methods — EARS C1/C2/C3, Farrington-style seasonal regression, CUSUM/EWMA, and space-time scan statistics (SaTScan-style) for cluster detection. Baselines estimated per facility from its own history with seasonality and day-of-week adjustment, rather than a single global constant. Any composite index would need prospective evaluation against confirmed outbreaks, with reported sensitivity, specificity, PPV and lead time before anyone acted on it.

**Alerting and workflow.** Configurable thresholds per jurisdiction, alert acknowledgement and assignment, case-investigation linkage, and an audit trail of who saw what and when.

**Delivery.** A genuine SMART on FHIR app registered with each EHR, launched in context, plus CDS Hooks for point-of-care surfacing and an API for downstream public-health systems (NSSP/ESSENCE, state reportable-disease systems).

**Operations.** Multi-tenant isolation, RBAC with jurisdiction scoping, comprehensive audit logging, SOC 2 controls, data-quality monitoring per feed (completeness, timeliness, mapping success), and on-call alerting for feed outages — because a surveillance system that silently stops receiving data is worse than no system at all.

**Governance.** Clear ownership of the signal definitions, a change-control process for thresholds, published methodology, and an explicit statement of what the system does and does not detect.

---

*LabSentinel is a classroom prototype. Synthetic data only.*
