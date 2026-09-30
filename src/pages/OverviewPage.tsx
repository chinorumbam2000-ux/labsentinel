/**
 * Capstone Overview: LabSentinel in one concise, product-focused flow — the
 * workflow from laboratory data to clinical feedback, where each part lives
 * in the application, what to keep in mind, and (API mode, development) the
 * presentation readiness checklist.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import StatusBadge from '../components/architecture/StatusBadge';
import ModeChip from '../components/layout/ModeChip';
import { useDataSourceContext } from '../data-access/DataSourceProvider';
import { isAbortError } from '../data-access/apiClient';
import { describeDataError } from '../data-access/hooks';
import { createReadinessClient, type CheckStatus, type ReadinessResult } from '../data-access/readiness';
import { KEY_DISCLAIMERS, type AppMode } from '../lib/appModes';
import { SMART_BUILD_CONFIG } from '../smart/config';
import type { ArchitectureStatus } from '../types';

const WORKFLOW: { title: string; detail: string; status: ArchitectureStatus }[] = [
  { title: 'Laboratory Data', detail: 'Synthetic respiratory test results from three fictional facilities.', status: 'PROTOTYPE' },
  { title: 'FHIR Interoperability', detail: 'FHIR R4 Observations and Bundles, validated on ingestion.', status: 'IMPLEMENTED' },
  { title: 'Normalization', detail: 'LOINC and SNOMED CT mapping, facility resolution, pseudonymised patients.', status: 'IMPLEMENTED' },
  { title: 'Dynamic Surveillance', detail: 'Daily aggregation against a rolling baseline, stored in PostgreSQL.', status: 'IMPLEMENTED' },
  { title: 'Composite + EWMA + CUSUM', detail: 'Three methods compared side by side, never combined.', status: 'IMPLEMENTED' },
  { title: 'Public Health Intelligence', detail: 'Dashboard, map, alerts, Data Confidence and explainability.', status: 'PROTOTYPE' },
  { title: 'SMART on FHIR Clinical Feedback', detail: 'Sidecar launched from a public synthetic sandbox.', status: 'IMPLEMENTED' },
];

const SMART_ENABLED = SMART_BUILD_CONFIG.ok && SMART_BUILD_CONFIG.config.enabled;

interface Destination {
  to: string;
  title: string;
  mode: AppMode;
  detail: string;
  requires?: 'api' | 'smart';
}

const DESTINATIONS: Destination[] = [
  { to: '/dashboard', title: 'Classroom Demo', mode: 'classroom', detail: 'The frozen five-day outbreak story: Composite score 0 / 24 / 50 / 74 / 87, map, signals, vendor sidecar and reporting.' },
  { to: '/fhir-ingestion', title: 'FHIR Ingestion', mode: 'api', detail: 'Send a synthetic FHIR Observation through validation and normalization into PostgreSQL.', requires: 'api' },
  { to: '/dynamic-surveillance', title: 'Dynamic Surveillance', mode: 'dynamic', detail: 'Signals recalculated from stored observations, with EWMA and CUSUM beside the composite.', requires: 'api' },
  { to: '/smart-demo', title: 'SMART Sandbox', mode: 'smart', detail: 'SMART App Launch against the public SMART Health IT sandbox; read-only, PKCE, synthetic patients.', requires: 'smart' },
  { to: '/evaluation', title: 'Capstone Evaluation', mode: 'evaluation', detail: '15 synthetic scenarios × 100 runs: sensitivity, timeliness and false alerts, with tradeoffs.', requires: 'api' },
  { to: '/architecture', title: 'Architecture', mode: 'overview', detail: 'What is implemented, what is a prototype and what is planned, plus future work.' },
];

export default function OverviewPage() {
  const { source } = useDataSourceContext();
  const apiMode = source.mode === 'api';

  const availability = (requires?: 'api' | 'smart'): string | null => {
    if (requires === 'api' && !apiMode) return 'Requires API Capstone Mode (this build shows a notice).';
    if (requires === 'smart' && !SMART_ENABLED) return 'Not enabled in this build (VITE_SMART_ENABLED).';
    return null;
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="ls-label">LabSentinel</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Laboratory-First Public Health Early Warning
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Laboratory results often arrive before case reports. LabSentinel turns routine, standards-based
          laboratory data into early, explainable and privacy-aware outbreak signals for public-health teams, and
          sends context back to clinicians through SMART on FHIR. A capstone prototype on synthetic data.
        </p>
      </header>

      <Card title="Workflow" subtitle="From a laboratory result to public-health intelligence and back to the clinician">
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {WORKFLOW.map((step, index) => (
            <li key={step.title} className="relative rounded-xl border border-hairline bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  <span className="mr-1.5 tabular-nums text-muted">{index + 1}.</span>
                  {step.title}
                </p>
                <StatusBadge status={step.status} />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{step.detail}</p>
              {index < WORKFLOW.length - 1 ? (
                <span aria-hidden="true" className="absolute -bottom-2 right-3 text-xs text-muted md:hidden">
                  ↓
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">
          <span className="sr-only">Order: </span>
          {WORKFLOW.map((s) => s.title).join(' → ')}
        </p>
      </Card>

      <section aria-labelledby="overview-explore">
        <h2 id="overview-explore" className="mb-3 text-lg font-semibold text-ink">
          Explore
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {DESTINATIONS.map((d) => {
            const note = availability(d.requires);
            return (
              <li key={d.to}>
                <Link
                  to={d.to}
                  className="ls-card flex h-full flex-col gap-2 p-4 transition-shadow hover:shadow-panel focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ModeChip mode={d.mode} />
                  <span className="text-base font-semibold text-ink">{d.title} →</span>
                  <span className="text-sm leading-relaxed text-muted">{d.detail}</span>
                  {note ? <span className="mt-auto text-xs font-medium text-[#92400E]">{note}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Keep in mind">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            {KEY_DISCLAIMERS.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </Card>
        <Card title="Presentation mode" subtitle="The ten-step final demonstration, through the real application">
          <p className="text-sm text-ink">
            Adds a step bar with Previous / Next, slightly larger type, and hides developer details. Pages behave
            exactly as usual. Turn it off with Exit presentation, or <code className="font-mono">?presentation=false</code>.
          </p>
          <Link to="/overview?presentation=true" className="ls-btn-primary mt-3">
            Start presentation mode
          </Link>
        </Card>
      </div>

      {apiMode ? <ReadinessPanel /> : null}
    </div>
  );
}

const STATUS_STYLE: Record<CheckStatus, string> = {
  PASS: 'bg-severity-low/10 text-[#166534] ring-severity-low/30',
  WARN: 'bg-[#FFFBEB] text-[#92400E] ring-[#F59E0B]/40',
  FAIL: 'bg-severity-critical/10 text-[#991B1B] ring-severity-critical/30',
};

function StatusPill({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex w-12 shrink-0 justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

type Load = { status: 'loading' } | { status: 'error'; message: string } | ReadinessResult;

/** Development only: the frontend build configuration and the backend's checklist. No secrets. */
function ReadinessPanel() {
  const { config, health } = useDataSourceContext();
  const client = useMemo(() => createReadinessClient(config.apiBaseUrl), [config.apiBaseUrl]);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: 'loading' });
    client
      .get(controller.signal)
      .then((result) => !controller.signal.aborted && setLoad(result))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setLoad({ status: 'error', message: describeDataError(error) });
      });
    return () => controller.abort();
  }, [client, attempt]);

  const frontend: { label: string; status: CheckStatus; detail: string }[] = [
    { label: 'Data source', status: 'PASS', detail: `API Capstone Mode → ${config.apiBaseUrl}` },
    {
      label: 'Backend connection',
      status: health === null ? 'WARN' : health.api === 'connected' && health.database === 'connected' ? 'PASS' : 'FAIL',
      detail: health === null ? 'Checking…' : `API ${health.api}, database ${health.database}`,
    },
    {
      label: 'SMART configuration',
      status: SMART_BUILD_CONFIG.ok ? 'PASS' : 'FAIL',
      detail: !SMART_BUILD_CONFIG.ok
        ? SMART_BUILD_CONFIG.error
        : SMART_BUILD_CONFIG.config.enabled
          ? 'Enabled: public client with PKCE, read-only scopes (no secret in the browser).'
          : 'Not enabled in this build (the SMART step shows a notice).',
    },
    { label: 'Base path', status: 'PASS', detail: import.meta.env.BASE_URL },
  ];

  return (
    <section data-dev-detail>
      <Card
        title="Presentation readiness"
        subtitle="Development only. Prepare with python -m app.demo.prepare (backend/)."
        action={
          <button type="button" className="ls-btn" onClick={() => setAttempt((n) => n + 1)}>
            Re-check
          </button>
        }
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="ls-label">Frontend configuration</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {frontend.map((c) => (
                <li key={c.label} className="flex items-start gap-2">
                  <StatusPill status={c.status} />
                  <span>
                    <span className="font-medium text-ink">{c.label}:</span> <span className="text-muted">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="ls-label">
              Backend checklist
              {load.status === 'ready' ? ` · ${load.readiness.status} (APP_ENV=${load.readiness.environment})` : ''}
            </h3>
            {load.status === 'loading' ? <p className="mt-2 text-sm text-muted" role="status">Checking…</p> : null}
            {load.status === 'error' ? <p className="mt-2 text-sm text-[#991B1B]" role="alert">{load.message}</p> : null}
            {load.status === 'disabled' ? (
              <p className="mt-2 text-sm text-muted">Not available in this environment (development-only endpoint).</p>
            ) : null}
            {load.status === 'ready' ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {load.readiness.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2">
                    <StatusPill status={c.status} />
                    <span>
                      <span className="font-medium text-ink">{c.label}:</span> <span className="text-muted">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </Card>
    </section>
  );
}
