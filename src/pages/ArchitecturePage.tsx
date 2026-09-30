import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import { useDataSourceContext } from '../data-access/DataSourceProvider';
import FlowDiagram, { type FlowStep } from '../components/architecture/FlowDiagram';
import FederatedConcept from '../components/architecture/FederatedConcept';
import StatusBadge, { StatusLegend } from '../components/architecture/StatusBadge';
import {
  ACTIVE_HIERARCHY,
  AVAILABLE_HIERARCHIES,
  GEOGRAPHY_CONFIGURABILITY_NOTE,
  describeHierarchy,
  getUnitsAtLevel,
} from '../data/geography';
import {
  MULTI_SOURCE_NOTE,
  SURVEILLANCE_SOURCES,
  getActiveSourceTypes,
} from '../lib/surveillanceSources';

/* ------------------------------ Implemented ------------------------------ */

/** The API capstone pipeline: built, tested and running in API Capstone Mode. */
const FULL_STACK_FLOW: FlowStep[] = [
  {
    nodes: [
      { label: 'Synthetic FHIR R4 Observations', detail: 'Development ingestion endpoint and the SMART sidecar bridge. Synthetic data only.', status: 'IMPLEMENTED' },
      { label: 'SMART on FHIR sandbox', detail: 'SMART App Launch 2.2 against the public SMART Health IT sandbox: public client, PKCE, read-only scope.', status: 'IMPLEMENTED' },
    ],
  },
  {
    nodes: [
      { label: 'FastAPI: validation and normalization', detail: 'FHIR R4B models, LOINC → syndrome, SNOMED CT → result, facility resolution, salted patient pseudonyms, duplicate detection.', status: 'IMPLEMENTED' },
    ],
  },
  {
    nodes: [
      { label: 'PostgreSQL', detail: 'Observations, signals, statistical results and an append-only audit trail. Alembic migrations.', status: 'IMPLEMENTED' },
    ],
  },
  {
    nodes: [
      { label: 'Dynamic Surveillance Engine', detail: 'Daily aggregation, rolling 7-day baseline, five weighted components, Data Confidence kept separate.', status: 'IMPLEMENTED' },
    ],
  },
  {
    nodes: [
      { label: 'Composite Outbreak Signal Score', detail: 'Severity bands Low → Critical. Prototype method, not validated.', status: 'IMPLEMENTED' },
      { label: 'EWMA detector', detail: 'λ 0.25, k 3, 28-day reference. Experimental.', status: 'IMPLEMENTED' },
      { label: 'CUSUM detector', detail: 'k 0.5, h 5, same reference. Experimental.', status: 'IMPLEMENTED' },
    ],
  },
  {
    nodes: [
      { label: 'React: three-method comparison', detail: 'Side by side with an agreement count; never combined into one score.', status: 'IMPLEMENTED' },
      { label: 'Capstone Evaluation framework', detail: '15 synthetic scenarios × 100 seeded runs, known ground truth, Wilson intervals.', status: 'IMPLEMENTED' },
    ],
  },
];

const IMPLEMENTED = [
  ['React frontend', 'TypeScript, Vite, Recharts, Leaflet; Local Demo and API Capstone modes.'],
  ['FastAPI backend', 'Typed read API, development-only write paths, environment gating.'],
  ['PostgreSQL', 'Alembic-migrated schema; seeded frozen demonstration and dynamic dataset.'],
  ['FHIR ingestion', 'FHIR R4 Observations and Bundles, normalized and pseudonymised.'],
  ['Dynamic surveillance', 'Signals recalculated from stored observations.'],
  ['EWMA', 'Experimental statistical detector on test volume and positivity.'],
  ['CUSUM', 'Experimental detector, compared with Composite and EWMA.'],
  ['SMART sandbox', 'Standards-based launch and sidecar against a public synthetic sandbox.'],
  ['Evaluation framework', 'Reproducible synthetic evaluation with documented threats to validity.'],
] as const;

/* ------------------------------- Prototype -------------------------------- */

const PROTOTYPE = [
  ['Vendor sidecars', 'One sidecar inside simulated Epic, Oracle Health and MEDITECH environments. No live vendor connection.'],
  ['Simulated reporting', 'A public-health reporting workflow with an audit timeline; nothing is sent anywhere.'],
  ['Classroom demo', 'The frozen Day 1–5 outbreak story (0 / 24 / 50 / 74 / 87), identical in both modes.'],
  ['Data Confidence model', 'Freshness, completeness, terminology, participation and integrity, kept separate from severity.'],
] as const;

/** The classroom demonstration pipeline: runs in the browser on the frozen dataset. */
const CURRENT_FLOW: FlowStep[] = [
  {
    nodes: [
      { label: 'Simulated Epic Environment', detail: 'Worcester Central Medical Center', status: 'PROTOTYPE' },
      { label: 'Simulated Oracle Health Environment', detail: 'Central Massachusetts Regional Hospital', status: 'PROTOTYPE' },
      { label: 'Simulated MEDITECH Environment', detail: 'Shrewsbury Community Medical Center', status: 'PROTOTYPE' },
    ],
  },
  {
    nodes: [
      {
        label: 'Synthetic FHIR-style Observations',
        detail: '699 deterministic records across five simulated days. No live FHIR endpoint is contacted.',
        status: 'PROTOTYPE',
      },
    ],
  },
  {
    nodes: [
      {
        label: 'FHIR / LOINC Normalization',
        detail: 'Three respiratory LOINC concepts grouped into one surveillance syndrome. Mapping quality is tracked per feed.',
        status: 'IMPLEMENTED',
      },
    ],
  },
  {
    nodes: [
      {
        label: 'LabSentinel Signal Engine',
        detail: 'Volume, positivity, multi-site correlation, geographic clustering and persistence.',
        status: 'IMPLEMENTED',
      },
    ],
  },
  {
    nodes: [
      {
        label: 'Composite Outbreak Signal Score',
        detail: 'Five weighted components, 0–100, banded Low → Critical. Illustrative and non-validated.',
        status: 'IMPLEMENTED',
      },
      {
        label: 'Data Confidence Score',
        detail: 'Freshness, completeness, terminology, participation and integrity. Kept entirely separate from severity.',
        status: 'IMPLEMENTED',
      },
    ],
  },
  {
    nodes: [
      {
        label: 'Geographic Intelligence',
        detail: 'Synthetic surveillance areas with adaptive privacy suppression and roll-up.',
        status: 'IMPLEMENTED',
      },
    ],
  },
  {
    nodes: [
      { label: 'Public Health Dashboard', detail: 'Regional status, trend, map, alerts and explainability.', status: 'IMPLEMENTED' },
      { label: 'Vendor Sidecar', detail: 'One reusable component rendered inside all three simulated environments.', status: 'IMPLEMENTED' },
      { label: 'Human Review & Reporting', detail: 'Investigation workflow and simulated public-health reporting.', status: 'PROTOTYPE' },
    ],
  },
];

/* ---------------------------- Planned / Future ---------------------------- */

const PLANNED: { label: string; detail: string; status: 'PLANNED' | 'FUTURE' }[] = [
  { label: 'Production vendor registration', detail: 'Registered SMART / bulk-FHIR clients per participating organization, with vendor review.', status: 'PLANNED' },
  { label: 'Production authentication', detail: 'Identity provider, role-based access control, per-jurisdiction authorization, audited access.', status: 'PLANNED' },
  { label: 'Real public-health reporting', detail: 'Genuine eCR / ELR pipelines and jurisdiction onboarding.', status: 'PLANNED' },
  { label: 'Epidemiological validation', detail: 'Retrospective real data with an external reference standard, then prospective shadow operation.', status: 'PLANNED' },
  { label: 'Multi-source surveillance', detail: 'Emergency department, hospitalization, wastewater and pharmacy streams beside laboratory results.', status: 'FUTURE' },
  { label: 'Federated architecture', detail: 'Local computation at each facility; only aggregates shared regionally.', status: 'FUTURE' },
];

/* ------------------------------- Future work ------------------------------- */

const EVALUATION_FINDINGS = [
  ['Data Confidence should remember silent facilities', 'A facility that stops reporting is penalised only while inside the 7-day window.'],
  ['Composite facility denominator', 'With fewer reporting facilities, one affected facility weighs more: detection rises as information falls.'],
  ['Rolling baseline absorbs sustained increases', 'The 7-day baseline follows a slow rise, so gradual and local outbreaks are often missed.'],
  ['EWMA / CUSUM small-count behavior', 'With a few tests a day, positivity is noisy: about a third of small-count runs false-alerted.'],
  ['Volume-only surge false alerts', 'More testing without more disease alerts the volume metrics of EWMA and CUSUM.'],
  ['One-day spike false alerts', 'A single anomalous day triggers all three methods.'],
  ['Delayed reporting effects', 'Late results delayed real-time detection by about 1–3 days.'],
] as const;

const BEYOND = [
  'Real epidemiological validation',
  'Multi-syndrome support',
  'Seasonality and day-of-week adjustment',
  'Population denominators',
  'Production authentication and RBAC',
  'Production vendor registration',
  'Production public-health reporting',
  'Real-world workflow and acceptability evaluation',
] as const;

function ItemGrid({ items, status }: { items: readonly (readonly [string, string])[]; status: 'IMPLEMENTED' | 'PROTOTYPE' }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, detail]) => (
        <li key={label} className="rounded-xl border border-hairline bg-white p-3 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{label}</p>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
        </li>
      ))}
    </ul>
  );
}

export default function ArchitecturePage() {
  const activeSources = getActiveSourceTypes();
  const { source } = useDataSourceContext();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            LabSentinel Architecture
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            What is implemented, what is a prototype, and what is planned or a longer-term
            direction — kept visually separate so they are never confused.
          </p>
        </div>
        <PageMeta />
      </header>

      <Card title="How to read this page">
        <StatusLegend />
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Solid cards are built. Dashed, muted cards are not — they describe intent, not
          capability. Nothing marked PLANNED or FUTURE exists in LabSentinel in any form.
          IMPLEMENTED means built and tested; the data are still synthetic and the
          surveillance methods are prototypes, not validated.
        </p>
      </Card>

      {/* ============ IMPLEMENTED ============ */}
      <Card
        title="Implemented"
        subtitle="The full-stack capstone: React + FastAPI + PostgreSQL"
        action={<StatusBadge status="IMPLEMENTED" />}
      >
        <ItemGrid items={IMPLEMENTED} status="IMPLEMENTED" />
        <h3 className="mt-5 text-sm font-semibold text-ink">The API capstone pipeline</h3>
        <FlowDiagram steps={FULL_STACK_FLOW} tone="current" className="mt-3" />
        {source.mode === 'local' ? (
          <p className="mt-4 rounded-lg bg-canvas p-3 text-xs leading-relaxed text-muted">
            This build runs in Local Demo Mode: only the classroom demonstration below runs, in your
            browser. The backend, FHIR ingestion, dynamic surveillance, EWMA, CUSUM, SMART and the
            evaluation run in API Capstone Mode (see the repository README).
          </p>
        ) : null}
      </Card>

      {/* ============ PROTOTYPE ============ */}
      <Card
        title="Prototype"
        subtitle="Built, but simulated or simplified by design"
        action={<StatusBadge status="PROTOTYPE" />}
      >
        <ItemGrid items={PROTOTYPE} status="PROTOTYPE" />
        <h3 className="mt-5 text-sm font-semibold text-ink">The classroom demonstration pipeline</h3>
        <FlowDiagram steps={CURRENT_FLOW} tone="current" className="mt-3" />
        <p className="mt-4 rounded-lg bg-canvas p-3 text-xs leading-relaxed text-muted">
          The classroom demonstration runs on a frozen, deterministic synthetic dataset — in the
          browser in Local Demo Mode, or read from PostgreSQL in API Capstone Mode, with identical
          values. It has no live connection to any hospital, laboratory, EHR vendor or
          public-health authority.
        </p>
      </Card>

      {/* ============ GEOGRAPHY ============ */}
      <Card
        title="Configurable geographic hierarchy"
        subtitle="ZIP codes are a U.S. artefact, so geography is a configuration rather than a hard-coded assumption"
        action={<StatusBadge status="IMPLEMENTED" />}
      >
        <p className="text-sm leading-relaxed text-ink">
          {GEOGRAPHY_CONFIGURABILITY_NOTE}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {AVAILABLE_HIERARCHIES.map((hierarchy) => {
            const isActive = hierarchy.id === ACTIVE_HIERARCHY.id;
            return (
              <div
                key={hierarchy.id}
                className={`rounded-xl border p-4 ${
                  isActive
                    ? 'border-brand/30 bg-brand-light'
                    : 'border-dashed border-muted/40 bg-canvas'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{hierarchy.label}</p>
                  <StatusBadge status={isActive ? 'IMPLEMENTED' : 'FUTURE'} />
                </div>
                <p className="mt-2 font-mono text-xs text-ink">
                  {describeHierarchy(hierarchy)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {hierarchy.description}
                </p>
                {isActive ? (
                  <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {hierarchy.levels.map((level) => (
                      <div key={level.id} className="rounded-lg bg-white px-2.5 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                          {level.label}
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                          {getUnitsAtLevel(level.id, hierarchy).length}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-[11px] text-muted">
                    Declared as a level structure only — no units and no data are attached
                    to it in this prototype.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          The privacy roll-up chain is derived from whichever hierarchy is active, so a
          deployment using districts and provinces would suppress and aggregate through
          its own levels without a code change.
        </p>
      </Card>

      {/* ============ MULTI-SOURCE ============ */}
      <Card
        title="Future Multi-Source Surveillance"
        subtitle="Laboratory-first today, with the architecture shaped to accept more"
        action={<StatusBadge status="FUTURE" />}
      >
        <p className="text-sm leading-relaxed text-ink">{MULTI_SOURCE_NOTE}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SURVEILLANCE_SOURCES.map((source) => {
            const isActive = source.availability === 'ACTIVE';
            return (
              <div
                key={source.type}
                className={`rounded-xl border p-3 ${
                  isActive
                    ? 'border-hairline bg-white shadow-card'
                    : 'border-dashed border-muted/40 bg-canvas'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p
                    className={`text-sm font-semibold ${
                      isActive ? 'text-ink' : 'text-muted'
                    }`}
                  >
                    {source.label}
                  </p>
                  <StatusBadge status={isActive ? 'IMPLEMENTED' : 'PLANNED'} />
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted">{source.type}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  {source.description}
                </p>
                <p className="mt-2 text-[11px] text-muted">
                  Example metrics:{' '}
                  <span className="font-mono">{source.exampleMetrics.join(', ')}</span>
                </p>
              </div>
            );
          })}
        </div>

        <p className="mt-4 rounded-lg border border-dashed border-muted/40 bg-canvas p-3 text-xs leading-relaxed text-ink">
          <span className="font-semibold">
            Only {activeSources.length} of {SURVEILLANCE_SOURCES.length} stream types
            carries data.
          </span>{' '}
          No emergency-department, hospitalization, wastewater or pharmacy data exists
          anywhere in this prototype, and none is shown on the dashboard. The planned
          adapters are declared so the abstraction is visible and testable; each returns
          nothing rather than fabricating observations.
        </p>
      </Card>

      {/* ============ PLANNED / FUTURE ============ */}
      <Card
        title="Planned and future"
        subtitle="Scoped or envisioned, not built. None of the following exists in LabSentinel."
        action={<StatusBadge status="PLANNED" />}
      >
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PLANNED.map((item) => (
            <li key={item.label} className="rounded-xl border border-dashed border-muted/40 bg-canvas p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-muted">{item.label}</p>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      </Card>

      {/* ============ FUTURE WORK ============ */}
      <Card
        id="future-work"
        title="Future work"
        subtitle="Documented as recommendations. Nothing below was changed in the evaluated system."
        action={<StatusBadge status="PLANNED" />}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">Found by the Phase 10 evaluation</h3>
            <ul className="mt-2 space-y-2">
              {EVALUATION_FINDINGS.map(([label, detail]) => (
                <li key={label} className="rounded-lg border border-dashed border-muted/40 p-3">
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Beyond the prototype</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink">
              {BEYOND.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              The Composite, EWMA and CUSUM formulas and parameters, and the Phase 10 evaluation,
              are frozen for the capstone: weaknesses are recorded here rather than tuned away.
            </p>
            <p className="mt-3 flex flex-wrap gap-2">
              <Link to="/evaluation" className="ls-btn">
                See the evaluation
              </Link>
              <Link to="/overview" className="ls-btn">
                Capstone overview
              </Link>
            </p>
          </div>
        </div>
      </Card>

      <FederatedConcept />

      <div className="ls-card border-l-4 border-l-severity-watch p-5">
        <p className="text-sm font-semibold text-ink">
          Nothing on this page marked PLANNED or FUTURE is implemented.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          LabSentinel is a capstone prototype using synthetic data. It is not connected to any real
          hospital, patient record, laboratory, EHR vendor or public-health authority; the SMART
          connection uses a public sandbox. The Composite Outbreak Signal Score, EWMA and CUSUM are
          prototype surveillance methods, and the Phase 10 evaluation demonstrates technical
          behavior on synthetic scenarios, not clinical or epidemiological validation.
        </p>
      </div>
    </div>
  );
}
