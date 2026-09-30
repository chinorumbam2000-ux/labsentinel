/**
 * /smart/sidecar — the LabSentinel SMART Sidecar (LIVE SMART SANDBOX SESSION).
 *
 * Shows the authorized SMART context (server, launch type, fhirUser, patient
 * id — no demographics) beside LabSentinel's regional intelligence, reads a
 * few of the patient's laboratory Observations from the sandbox, and — in API
 * Capstone Mode only — can send one through LabSentinel's Phase 4 ingestion
 * pipeline. Nothing here renders, logs or stores a token.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SmartFrame, SmartStatusBadge, SmartTechnicalDetails, useSmartDiscovery } from '../../components/smart/SmartParts';
import SeverityBadge from '../../components/signals/SeverityBadge';
import { useSimulation } from '../../context/SimulationContext';
import { useDataSourceContext } from '../../data-access/DataSourceProvider';
import { createFhirIngestionClient } from '../../data-access/fhirIngestion';
import { createDynamicSurveillanceClient, type DynamicSignal } from '../../data-access/dynamicSurveillance';
import { createEwmaClient, type EwmaState } from '../../data-access/ewma';
import { DYNAMIC_LABEL, INSUFFICIENT_BASELINE_TEXT, NO_DATA_TEXT, formatSurveillanceDate } from '../../lib/dynamicSurveillance';
import { describeDataError } from '../../data-access/hooks';
import { SMART_BUILD_CONFIG } from '../../smart/config';
import { endSession, restoreSession, type SmartSession } from '../../smart/client';
import {
  bridgeOutcome,
  bridgePayload,
  fhirUserLabel,
  isExpired,
  laboratoryObservations,
  laboratorySearch,
  serverLabel,
  technicalDetails,
  type BridgeOutcome,
  type SandboxLabRow,
} from '../../smart/context';
import { LAUNCH_TYPE_LABEL } from '../../smart/launch';

export const SANDBOX_DATA_NOTE = 'Sandbox FHIR data — not LabSentinel surveillance data.';

type SessionState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'expired' }
  | { status: 'error' }
  | { status: 'connected'; session: SmartSession };

export default function SmartSidecarPage() {
  if (!SMART_BUILD_CONFIG.ok) {
    return (
      <SmartFrame status="config-error" title="SMART configuration error">
        <p className="text-sm text-ink">{SMART_BUILD_CONFIG.error}</p>
      </SmartFrame>
    );
  }
  if (!SMART_BUILD_CONFIG.config.enabled) {
    return <SmartFrame status="not-configured" title="SMART sandbox integration is not enabled" />;
  }
  return <SidecarSession />;
}

function SidecarSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled) return;
        if (!session) setState({ status: 'none' });
        else if (isExpired(session.expiresAt)) setState({ status: 'expired' });
        else setState({ status: 'connected', session });
      })
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <SmartFrame status="authorizing" title="Restoring the SMART session…" />;
  if (state.status === 'none' || state.status === 'expired' || state.status === 'error') {
    const status = state.status === 'none' ? 'ready' : state.status === 'expired' ? 'expired' : 'server-error';
    return (
      <SmartFrame
        status={status}
        title={state.status === 'none' ? 'No SMART session in this tab' : 'The SMART session is not available'}
      >
        <Link to="/smart-demo" className="ls-btn inline-flex">
          Open the SMART on FHIR Sandbox page
        </Link>
      </SmartFrame>
    );
  }
  return <ConnectedSidecar session={state.session} onEnd={() => setState({ status: 'none' })} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** The latest DYNAMIC regional signal (API mode, when chosen in the sidecar). */
function DynamicRegional({ baseUrl }: { baseUrl: string }) {
  const client = useMemo(() => createDynamicSurveillanceClient(baseUrl), [baseUrl]);
  const ewmaClient = useMemo(() => createEwmaClient(baseUrl), [baseUrl]);
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; signal: DynamicSignal | null }
  >({ status: 'loading' });
  // The EWMA detector's overall state for the same date: a compact indicator only.
  const [detector, setDetector] = useState<EwmaState | null | 'unavailable'>(null);

  useEffect(() => {
    const controller = new AbortController();
    client
      .signalFor(null, controller.signal)
      .then((signal) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', signal });
        if (signal) {
          ewmaClient
            .day(signal.signal_date, controller.signal)
            .then((day) => !controller.signal.aborted && setDetector(day?.overall_state ?? 'unavailable'))
            .catch(() => !controller.signal.aborted && setDetector('unavailable'));
        }
      })
      .catch((error) => !controller.signal.aborted && setState({ status: 'error', message: describeDataError(error) }));
    return () => controller.abort();
  }, [client, ewmaClient]);

  const intro = (
    <p className="mt-1 text-xs text-muted">
      <strong className="font-semibold text-ink">Dynamic Surveillance</strong> · {DYNAMIC_LABEL} Synthetic.
    </p>
  );
  if (state.status === 'loading') {
    return (
      <>
        {intro}
        <p role="status" className="mt-2 text-sm text-muted">Loading the latest dynamic signal…</p>
      </>
    );
  }
  if (state.status === 'error') {
    return (
      <>
        {intro}
        <p role="alert" className="mt-2 text-sm text-severity-critical">{state.message}</p>
      </>
    );
  }
  const signal = state.signal;
  if (signal === null) {
    return (
      <>
        {intro}
        <p className="mt-2 text-sm text-muted">No dynamic signal has been calculated yet.</p>
      </>
    );
  }
  return (
    <>
      {intro}
      <dl className="mt-1 divide-y divide-hairline">
        <Row label="Surveillance date">{formatSurveillanceDate(signal.signal_date)}</Row>
        <Row label="Current severity">
          {signal.severity ? <SeverityBadge severity={signal.severity} /> : 'Not calculated'}
        </Row>
        <Row label="Composite Outbreak Signal Score">
          {signal.composite_score === null ? 'Not calculated' : `${signal.composite_score}/100`}
        </Row>
        <Row label="Data Confidence">
          {signal.data_confidence_score === null ? 'Not assessed' : `${signal.data_confidence_score} · ${signal.data_confidence_level}`}
        </Row>
        <Row label="Affected facilities">
          {signal.affected_facilities} of {signal.participating_facilities}
        </Row>
        <Row label="Affected geographic areas">{signal.affected_geographies.length}</Row>
        <Row label="Last calculated">
          {signal.calculated_at ? new Date(signal.calculated_at).toLocaleString('en-US') : '—'}
        </Row>
        <Row label="Statistical Detector">
          {detector === null
            ? 'Loading…'
            : detector === 'unavailable'
              ? 'Not available'
              : detector === 'STATISTICAL_ALERT'
                ? 'EWMA Alert'
                : detector === 'WATCH'
                  ? 'EWMA Watch'
                  : 'EWMA Normal'}
        </Row>
      </dl>
      {signal.calculation_status !== 'CALCULATED' ? (
        <p className="mt-1 text-xs text-muted">
          {signal.calculation_status === 'NO_DATA' ? NO_DATA_TEXT : INSUFFICIENT_BASELINE_TEXT}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted">
        The statistical detector is experimental: an EWMA alert is not a confirmed outbreak.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link to="/dynamic-surveillance" className="text-xs font-medium text-brand hover:underline">
          View Dynamic Surveillance
        </Link>
        <Link to="/dynamic-surveillance#statistical-surveillance" className="text-xs font-medium text-brand hover:underline">
          View Statistical Details
        </Link>
      </div>
    </>
  );
}

function ConnectedSidecar({ session, onEnd }: { session: SmartSession; onEnd: () => void }) {
  const { currentDay, currentScenario, signalScore, dataConfidence, simulationDate, lastUpdated, dataSourceMode } =
    useSimulation();
  const { config } = useDataSourceContext();
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Which surveillance the regional panel shows. Demo by default; Dynamic only
  // when chosen (API mode), and always labelled — never switched silently.
  const [surveillance, setSurveillance] = useState<'demo' | 'dynamic'>('demo');
  const discovery = useSmartDiscovery(session.serverUrl, detailsOpen);
  const ingestion = useMemo(
    () => (dataSourceMode === 'api' ? createFhirIngestionClient(config.apiBaseUrl) : null),
    [dataSourceMode, config.apiBaseUrl],
  );

  const [labs, setLabs] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: SandboxLabRow[] } | { status: 'no-patient' }
  >(session.patientId ? { status: 'loading' } : { status: 'no-patient' });
  const [outcomes, setOutcomes] = useState<Record<string, BridgeOutcome | 'sending'>>({});

  useEffect(() => {
    if (!session.patientId) return undefined;
    let cancelled = false;
    session
      .request(laboratorySearch(session.patientId))
      .then((bundle) => !cancelled && setLabs({ status: 'ready', rows: laboratoryObservations(bundle) }))
      .catch(() => !cancelled && setLabs({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [session]);

  const send = async (row: SandboxLabRow) => {
    if (!ingestion) return;
    setOutcomes((current) => ({ ...current, [row.id]: 'sending' }));
    try {
      const reply = await ingestion.ingest(JSON.stringify(bridgePayload(row.resource, session.serverUrl)));
      setOutcomes((current) => ({ ...current, [row.id]: bridgeOutcome(reply) }));
    } catch (error) {
      setOutcomes((current) => ({
        ...current,
        [row.id]: { tone: 'error', title: 'LabSentinel API unavailable', message: describeDataError(error) },
      }));
    }
  };

  const user = fhirUserLabel(session.fhirUser);

  return (
    <div className="min-h-screen bg-canvas px-4 py-6">
      <main className="mx-auto w-full max-w-2xl space-y-4">
        <header className="ls-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
            Live SMART sandbox session
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-ink">LabSentinel SMART Sidecar</h1>
          <p className="mt-1 text-xs text-muted">
            Standards-based SMART App Launch against synthetic sandbox data. Not a simulated vendor sidecar,
            and not a live Epic, Oracle Health or MEDITECH production connection.
          </p>
        </header>

        <section aria-labelledby="smart-context" className="ls-card px-5 py-4">
          <h2 id="smart-context" className="ls-label">
            SMART context
          </h2>
          <dl className="mt-1 divide-y divide-hairline">
            <Row label="SMART Connection">
              <SmartStatusBadge status="connected" />
            </Row>
            <Row label="FHIR Server">{serverLabel(session.serverUrl)}</Row>
            <Row label="Launch Type">{session.launchType ? LAUNCH_TYPE_LABEL[session.launchType] : 'Unknown'}</Row>
            <Row label="FHIR User">{user ? `${user} (synthetic sandbox user)` : 'Not provided'}</Row>
            <Row label="Patient Context">
              {session.patientId ? (
                <>
                  Synthetic Patient Context · <span className="font-mono">{session.patientId}</span>
                </>
              ) : (
                'No patient context'
              )}
            </Row>
          </dl>
        </section>

        <section aria-labelledby="regional" className="ls-card px-5 py-4">
          <h2 id="regional" className="ls-label">
            Regional Respiratory Activity
          </h2>
          {dataSourceMode === 'api' ? (
            <div role="radiogroup" aria-label="Surveillance shown" className="mt-2 inline-flex rounded-lg border border-hairline p-0.5">
              {(['demo', 'dynamic'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={surveillance === mode}
                  onClick={() => setSurveillance(mode)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    surveillance === mode ? 'bg-brand text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {mode === 'demo' ? 'Demo Surveillance' : 'Dynamic Surveillance'}
                </button>
              ))}
            </div>
          ) : null}
          {surveillance === 'dynamic' ? (
            <DynamicRegional baseUrl={config.apiBaseUrl} />
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                <strong className="font-semibold text-ink">Demo Surveillance</strong> · LabSentinel regional intelligence
                ({dataSourceMode === 'api' ? 'FastAPI + PostgreSQL' : 'local demo data'}), simulation Day {currentDay} — synthetic.
              </p>
              <dl className="mt-1 divide-y divide-hairline">
                <Row label="Current severity">
                  <SeverityBadge severity={signalScore.severity} />
                </Row>
                <Row label="Composite Outbreak Signal Score">{signalScore.composite}/100</Row>
                <Row label="Data Confidence">
                  {dataConfidence.score} · {dataConfidence.level}
                </Row>
                <Row label="Affected facilities">{currentScenario.affectedHospitals.length} of 3</Row>
                <Row label="Affected geographic areas">{currentScenario.affectedZipCodes.length}</Row>
                <Row label="Last updated">
                  {simulationDate} (simulation) · {lastUpdated.toLocaleTimeString('en-US')}
                </Row>
              </dl>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/dashboard" className="ls-btn-primary">
              View Regional Intelligence
            </Link>
            <button type="button" className="ls-btn" onClick={() => setDetailsOpen((open) => !open)}>
              View SMART Technical Details
            </button>
          </div>
        </section>

        <SmartTechnicalDetails
          details={technicalDetails(session, discovery)}
          open={detailsOpen}
          onToggle={() => setDetailsOpen((open) => !open)}
        />

        <section aria-labelledby="smart-labs" className="ls-card">
          <div className="border-b border-hairline px-5 py-3">
            <h2 id="smart-labs" className="text-sm font-semibold text-ink">
              SMART FHIR Laboratory Data
            </h2>
            <p className="text-xs font-medium text-[#92400E]">{SANDBOX_DATA_NOTE}</p>
          </div>
          <SandboxLabs labs={labs} outcomes={outcomes} onSend={ingestion ? send : null} />
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            className="ls-btn"
            onClick={() => {
              endSession();
              onEnd();
            }}
          >
            End SMART session
          </button>
        </div>
      </main>
    </div>
  );
}

function SandboxLabs({
  labs,
  outcomes,
  onSend,
}: {
  labs: { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: SandboxLabRow[] } | { status: 'no-patient' };
  outcomes: Record<string, BridgeOutcome | 'sending'>;
  onSend: ((row: SandboxLabRow) => void) | null;
}) {
  if (labs.status === 'no-patient') {
    return <p className="px-5 py-4 text-sm text-muted">No patient context was supplied, so no Observations are read.</p>;
  }
  if (labs.status === 'loading') {
    return (
      <p role="status" className="px-5 py-4 text-sm text-muted">
        Reading laboratory Observations from the sandbox…
      </p>
    );
  }
  if (labs.status === 'error') {
    return (
      <div role="alert" className="px-5 py-4 text-sm">
        <SmartStatusBadge status="server-error" />
        <p className="mt-2 text-muted">The sandbox FHIR server did not return laboratory Observations.</p>
      </div>
    );
  }
  if (labs.rows.length === 0) {
    return <p className="px-5 py-4 text-sm text-muted">The sandbox has no laboratory Observations for this patient.</p>;
  }
  return (
    <>
      {onSend ? null : (
        <p className="px-5 pt-3 text-xs text-muted">
          Sending an Observation to LabSentinel requires API Capstone Mode (VITE_DATA_SOURCE=api).
        </p>
      )}
      <ul className="divide-y divide-hairline" aria-label="Sandbox laboratory Observations">
        {labs.rows.map((row) => {
          const outcome = outcomes[row.id];
          return (
            <li key={row.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-ink">{row.test}</p>
                <p className="text-sm text-ink">{row.result}</p>
              </div>
              <p className="text-xs text-muted">
                LOINC <span className="font-mono">{row.loinc ?? '—'}</span> · {row.effective ?? 'no effective time'} ·
                Observation/<span className="font-mono">{row.id}</span>
              </p>
              {onSend && row.loinc ? (
                <button
                  type="button"
                  className="ls-btn mt-2 px-3 py-1.5 text-xs"
                  disabled={outcome === 'sending'}
                  onClick={() => onSend(row)}
                >
                  {outcome === 'sending' ? 'Sending…' : 'Send Eligible Lab Observation to LabSentinel'}
                </button>
              ) : null}
              {outcome && outcome !== 'sending' ? (
                <p
                  role={outcome.tone === 'error' ? 'alert' : 'status'}
                  className={`mt-2 rounded-md border px-3 py-2 text-xs ${
                    outcome.tone === 'success'
                      ? 'border-severity-low/40 bg-severity-low/5'
                      : outcome.tone === 'warning'
                        ? 'border-severity-moderate/50 bg-severity-moderate/10'
                        : 'border-severity-critical/40 bg-severity-critical/5'
                  }`}
                >
                  <strong className="text-ink">
                    {outcome.tone === 'success' ? '✓ ' : outcome.tone === 'warning' ? '! ' : '✕ '}
                    {outcome.title}.
                  </strong>{' '}
                  <span className="text-ink">{outcome.message}</span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
