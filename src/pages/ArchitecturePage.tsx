import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
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

/* ---------------------------- Section 1 ---------------------------- */

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

/* ---------------------------- Section 2 ---------------------------- */

const PLANNED_FLOW: FlowStep[] = [
  { nodes: [{ label: 'Real FHIR endpoints', detail: 'SMART on FHIR / bulk-FHIR per participating organization, with OAuth 2.0 client credentials.', status: 'PLANNED' }] },
  { nodes: [{ label: 'Backend API', detail: 'Authenticated service boundary. None exists today — this prototype has no backend.', status: 'PLANNED' }] },
  { nodes: [{ label: 'Persistent Database', detail: 'Durable storage for observations, aggregates and review state, replacing browser session storage.', status: 'PLANNED' }] },
  { nodes: [{ label: 'Event Processing', detail: 'Streaming ingestion so signals update continuously rather than on a five-step timer.', status: 'PLANNED' }] },
  { nodes: [{ label: 'Normalization Layer', detail: 'Hosted terminology service for LOINC, SNOMED CT and UCUM with version pinning and a mapping-review workflow.', status: 'PLANNED' }] },
  { nodes: [{ label: 'Surveillance Signal Engine', detail: 'Established aberration detection — EARS, Farrington-style regression, CUSUM/EWMA, space-time scan — replacing the fixed-weight score.', status: 'PLANNED' }] },
  { nodes: [{ label: 'Geospatial Intelligence', detail: 'Real boundary data, cluster detection and a documented disclosure-review process.', status: 'PLANNED' }] },
  {
    nodes: [
      { label: 'Public Health Portal', detail: 'Multi-tenant, role-scoped, audited.', status: 'PLANNED' },
      { label: 'SMART on FHIR Clinical Sidecar', detail: 'Registered app launched in EHR context, plus CDS Hooks.', status: 'PLANNED' },
      { label: 'Reporting Interfaces', detail: 'Genuine eCR / ELR pipelines and jurisdiction onboarding.', status: 'PLANNED' },
    ],
  },
];

export default function ArchitecturePage() {
  const activeSources = getActiveSourceTypes();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            LabSentinel Architecture
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            What exists today, what is scoped next, and what remains a longer-term
            direction — kept visually separate so the three are never confused.
          </p>
        </div>
        <PageMeta />
      </header>

      <Card title="How to read this page">
        <StatusLegend />
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Solid cards are built. Dashed, muted cards are not — they describe intent, not
          capability. Nothing marked PLANNED or FUTURE exists in this prototype in any
          form.
        </p>
      </Card>

      {/* ============ SECTION 1 ============ */}
      <Card
        title="Section 1 — Current prototype"
        subtitle="The pipeline that actually runs when you use this application"
        action={<StatusBadge status="IMPLEMENTED" />}
      >
        <FlowDiagram steps={CURRENT_FLOW} tone="current" />
        <p className="mt-4 rounded-lg bg-canvas p-3 text-xs leading-relaxed text-muted">
          Everything above runs entirely in your browser against deterministic synthetic
          data. There is no backend, no database, no authentication and no live
          connection to any hospital, laboratory, EHR vendor or public-health authority.
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

      {/* ============ SECTION 2 ============ */}
      <Card
        title="Section 2 — Next capstone development stage"
        subtitle="Scoped, not built. None of the following exists in this prototype."
        action={<StatusBadge status="PLANNED" />}
      >
        <FlowDiagram steps={PLANNED_FLOW} tone="planned" />
      </Card>

      {/* ============ SECTION 3 ============ */}
      <Card
        title="Section 3 — Future architecture"
        subtitle="Longer-term directions beyond the next development stage"
        action={<StatusBadge status="FUTURE" />}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {[
            {
              label: 'Federated surveillance',
              detail:
                'Local computation at each facility, with only aggregates shared regionally. Detailed below.',
            },
            {
              label: 'Multi-source surveillance',
              detail:
                'Emergency department, hospitalization, wastewater and pharmacy streams alongside laboratory results.',
            },
            {
              label: 'Regional and national integration',
              detail:
                'Interoperation with jurisdictional surveillance systems, with governance and data-use agreements per participating organization.',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-dashed border-muted/30 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-muted">{item.label}</p>
                <StatusBadge status="FUTURE" />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      <FederatedConcept />

      <div className="ls-card border-l-4 border-l-severity-watch p-5">
        <p className="text-sm font-semibold text-ink">
          Nothing on this page marked PLANNED or FUTURE is implemented.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          LabSentinel is a prototype using synthetic data. It is not connected to any real
          hospital, patient record, laboratory, EHR vendor or public-health authority, and
          the Composite Outbreak Signal Score is an illustrative, non-validated
          demonstration model.
        </p>
      </div>
    </div>
  );
}
