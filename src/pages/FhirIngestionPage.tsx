/**
 * FHIR Laboratory Ingestion — DEVELOPMENT DEMONSTRATION (API capstone mode).
 *
 * Makes the Phase 4 pipeline visible: synthetic FHIR → validation → facility
 * resolution → terminology/result normalization → PostgreSQL → normalized
 * LabSentinel observation. Everything shown after an ingestion is the
 * backend's actual response and the stored record it points to.
 *
 * Local demo mode (and the GitHub Pages build) renders only an explanation:
 * no controls, no client, no requests.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import { ErrorState, LoadingState } from '../components/common/States';
import FhirPipeline from '../components/fhir/FhirPipeline';
import NormalizedComparison, { type FacilityInfo } from '../components/fhir/NormalizedComparison';
import RecentIngestions, { type RecentState } from '../components/fhir/RecentIngestions';
import { useDataSourceContext } from '../data-access/DataSourceProvider';
import { isAbortError } from '../data-access/apiClient';
import {
  createFhirIngestionClient,
  type ApiFacilityLabel,
  type FhirExampleSummary,
  type FhirIngestionClient,
  type IngestionAvailability,
  type IngestionReply,
  type NormalizedObservation,
} from '../data-access/fhirIngestion';
import { describeDataError } from '../data-access/hooks';
import { createDynamicSurveillanceClient, type RecalculateResult } from '../data-access/dynamicSurveillance';
import {
  ISSUE_EXPLANATIONS,
  PROGRESS_STEPS,
  findSourceObservation,
  formatJson,
  isBundleDocument,
  pendingPipeline,
  pipelineFor,
  resourceComposition,
  summarizeSource,
} from '../lib/fhirDemo';

export const SYNTHETIC_NOTICE = 'Synthetic FHIR development demonstration — no real patient data.';
export const DEMO_WINDOW_NOTE =
  'Development FHIR ingestions are stored outside the frozen five-day demonstration window and do not alter the classroom simulation.';

export default function FhirIngestionPage() {
  const { source } = useDataSourceContext();
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">FHIR Laboratory Ingestion</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Validate, normalize and persist synthetic FHIR laboratory resources into LabSentinel.
          </p>
        </div>
      </header>

      <p
        role="note"
        className="rounded-lg border border-severity-watch/60 bg-severity-watch/10 px-4 py-2.5 text-sm text-ink"
      >
        <strong className="mr-2 block tracking-[0.04em] sm:inline">SYNTHETIC DEVELOPMENT DATA ONLY</strong>
        {SYNTHETIC_NOTICE} No live Epic, Oracle Health or MEDITECH connection exists.
      </p>

      {source.mode === 'api' ? <IngestionWorkspace /> : <LocalModeNotice />}
    </div>
  );
}

function LocalModeNotice() {
  return (
    <Card title="Not available in Local Demo Mode" bodyClassName="p-0">
      <div className="space-y-2 p-5 text-sm text-muted">
        <p className="font-medium text-ink">FHIR ingestion requires LabSentinel API Capstone Mode.</p>
        <p>
          This build runs the standalone synthetic demonstration in the browser, with no backend. To use the
          ingestion demonstration, run the FastAPI backend in development and start the app with{' '}
          <code className="font-mono">VITE_DATA_SOURCE=api</code> (see backend/README.md).
        </p>
      </div>
    </Card>
  );
}

type IngestState =
  | { status: 'idle' }
  | { status: 'running'; body: string }
  | { status: 'done'; body: string; reply: IngestionReply; attempt: number }
  | { status: 'error'; message: string };

const statusPill = (label: string, state: 'ok' | 'bad' | 'checking' | 'off', text: string) => {
  const icon = { ok: '●', bad: '✕', checking: '○', off: '–' }[state];
  const tone = {
    ok: 'text-[#166534]',
    bad: 'text-severity-critical',
    checking: 'text-muted',
    off: 'text-[#92400E]',
  }[state];
  return (
    <div className="flex items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-sm font-semibold ${tone}`}>
        <span aria-hidden="true">{icon} </span>
        {text}
      </span>
    </div>
  );
};

function IngestionWorkspace() {
  const { config, health, checkingHealth, recheckHealth } = useDataSourceContext();
  const client: FhirIngestionClient = useMemo(
    () => createFhirIngestionClient(config.apiBaseUrl),
    [config.apiBaseUrl],
  );

  // Availability of the ingestion endpoint, and the example catalogue.
  const [attempt, setAttempt] = useState(0);
  const [availability, setAvailability] = useState<IngestionAvailability | 'checking' | 'unavailable'>('checking');
  const [examples, setExamples] = useState<FhirExampleSummary[]>([]);
  const [facilities, setFacilities] = useState<ApiFacilityLabel[]>([]);
  const retry = useCallback(() => {
    recheckHealth();
    setAttempt((value) => value + 1);
  }, [recheckHealth]);

  useEffect(() => {
    const controller = new AbortController();
    setAvailability('checking');
    (async () => {
      try {
        const state = await client.availability(controller.signal);
        if (controller.signal.aborted) return;
        setAvailability(state);
        if (state !== 'available') return;
        const [list, sites] = await Promise.all([
          client.listExamples(controller.signal),
          client.facilities(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setExamples(list);
        setFacilities(sites);
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) setAvailability('unavailable');
      }
    })();
    return () => controller.abort();
  }, [client, attempt]);

  // The editor.
  const [exampleId, setExampleId] = useState('');
  const [loadedText, setLoadedText] = useState('');
  const [text, setText] = useState('');
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const selected = examples.find((item) => item.id === exampleId) ?? null;

  const loadExample = async () => {
    if (!exampleId) return;
    setEditorMessage(null);
    try {
      const example = await client.getExample(exampleId);
      setLoadedText(example.content);
      setText(example.content);
      setIngest({ status: 'idle' });
    } catch (error) {
      setEditorMessage(describeDataError(error));
    }
  };

  const format = () => {
    const result = formatJson(text);
    if (result.ok) {
      setText(result.text);
      setEditorMessage(null);
    } else {
      setEditorMessage(`Cannot format: ${result.error}`);
    }
  };

  // Ingestion.
  const [ingest, setIngest] = useState<IngestState>({ status: 'idle' });
  const [progress, setProgress] = useState(0);
  const attempts = useRef(0);

  useEffect(() => {
    if (ingest.status !== 'running') return undefined;
    setProgress(0);
    const timer = window.setInterval(
      () => setProgress((value) => Math.min(value + 1, PROGRESS_STEPS.length - 1)),
      350,
    );
    return () => window.clearInterval(timer);
  }, [ingest.status]);

  const run = async (body: string) => {
    setIngest({ status: 'running', body });
    try {
      const reply = await client.ingest(body);
      attempts.current += 1;
      setIngest({ status: 'done', body, reply, attempt: attempts.current });
      setResultIndex(0);
      setRecentAttempt((value) => value + 1);
    } catch (error) {
      setIngest({ status: 'error', message: describeDataError(error) });
    }
  };

  // The selected result's normalized record.
  const [resultIndex, setResultIndex] = useState(0);
  const reply = ingest.status === 'done' ? ingest.reply : null;
  const outcome = reply?.response.results[resultIndex] ?? null;
  const [record, setRecord] = useState<
    { id: number; value: NormalizedObservation } | { id: number; error: string } | null
  >(null);
  useEffect(() => {
    const id = outcome?.observation_id;
    if (id == null) return undefined;
    const controller = new AbortController();
    client
      .getObservation(id, controller.signal)
      .then((value) => !controller.signal.aborted && setRecord({ id, value }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setRecord({ id, error: describeDataError(error) });
      });
    return () => controller.abort();
  }, [client, outcome?.observation_id, ingest.status === 'done' ? ingest.attempt : 0]);

  // Recent FHIR ingestions.
  const [recentAttempt, setRecentAttempt] = useState(0);
  const [recent, setRecent] = useState<RecentState>({ status: 'loading' });
  useEffect(() => {
    if (availability !== 'available') return undefined;
    const controller = new AbortController();
    client
      .recentIngestions(8, controller.signal)
      .then((rows) => !controller.signal.aborted && setRecent({ status: 'ready', rows }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setRecent({ status: 'error', message: describeDataError(error) });
        }
      });
    return () => controller.abort();
  }, [client, availability, recentAttempt]);

  const facilityById = (id: number) => facilities.find((item) => item.id === id);
  const facilityInfo = (code: string | null): FacilityInfo | null => {
    const match = facilities.find((item) => item.facility_code === code);
    return match ? { name: match.name, vendor: match.vendor } : null;
  };

  const apiState = health === null ? 'checking' : health.api === 'connected' ? 'ok' : 'bad';
  const dbState = health === null ? 'checking' : health.database === 'connected' ? 'ok' : 'bad';
  const ingestionState =
    availability === 'checking' ? 'checking' : availability === 'available' ? 'ok' : availability === 'disabled' ? 'off' : 'bad';
  const ready = availability === 'available' && health?.api === 'connected' && health.database === 'connected';

  const submitted = ingest.status === 'done' ? ingest.body : '';
  const composition = isBundleDocument(submitted) ? resourceComposition(submitted) : null;
  const sourceObservation =
    reply && outcome && ingest.status === 'done' ? findSourceObservation(ingest.body, outcome.resource) : null;
  const pipeline = reply ? pipelineFor(reply, outcome) : pendingPipeline();
  const currentRecord = record && outcome && record.id === outcome.observation_id ? record : null;

  return (
    <>
      <section aria-label="Backend status" className="flex flex-wrap items-center gap-2">
        {statusPill(
          'FHIR Ingestion API',
          ingestionState,
          { ok: 'Connected', bad: 'Unavailable', checking: 'Checking…', off: 'Disabled (not development)' }[ingestionState],
        )}
        {statusPill('PostgreSQL', dbState, { ok: 'Connected', bad: 'Unavailable', checking: 'Checking…', off: '' }[dbState])}
        {statusPill('API', apiState, { ok: 'Connected', bad: 'Unavailable', checking: 'Checking…', off: '' }[apiState])}
        <button type="button" onClick={retry} disabled={checkingHealth} className="ls-btn px-3 py-1.5 text-xs">
          Re-check
        </button>
      </section>

      <p className="text-xs text-muted">{DEMO_WINDOW_NOTE}</p>

      {availability === 'unavailable' ? (
        <Card>
          <ErrorState
            title="LabSentinel API is currently unavailable."
            message={`The FHIR ingestion endpoint at ${config.apiBaseUrl} could not be reached. Start the backend, then retry.`}
            onRetry={retry}
          />
        </Card>
      ) : availability === 'disabled' ? (
        <Card>
          <ErrorState
            title="FHIR ingestion is disabled on this backend"
            message="The endpoint exists only when the API runs with APP_ENV=development."
            onRetry={retry}
          />
        </Card>
      ) : availability === 'checking' ? (
        <Card>
          <LoadingState label="Checking the FHIR ingestion endpoint…" />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <Card
            title="Synthetic FHIR input"
            subtitle="Load a synthetic example or paste synthetic FHIR R4 JSON."
            bodyClassName="p-0"
          >
            <div className="space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="fhir-example" className="ls-label">
                    Example fixture
                  </label>
                  <select
                    id="fhir-example"
                    className="ls-select mt-1 block w-full"
                    value={exampleId}
                    onChange={(event) => setExampleId(event.target.value)}
                  >
                    <option value="">Choose a synthetic example…</option>
                    {(['valid', 'bundle', 'invalid'] as const).map((kind) => (
                      <optgroup
                        key={kind}
                        label={{ valid: 'Valid Observations', bundle: 'Bundle', invalid: 'Invalid (error demonstration)' }[kind]}
                      >
                        {examples
                          .filter((item) => item.kind === kind)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <button type="button" className="ls-btn" onClick={loadExample} disabled={!exampleId}>
                  Load Example
                </button>
              </div>
              {selected ? (
                <p className="text-xs text-muted">
                  {selected.description} <span className="text-ink">Expected: {selected.expected}</span>
                </p>
              ) : null}

              <div>
                <label htmlFor="fhir-json" className="ls-label">
                  Synthetic FHIR JSON
                </label>
                <textarea
                  id="fhir-json"
                  spellCheck={false}
                  className="ls-input mt-1 block h-80 w-full resize-y whitespace-pre font-mono text-xs leading-relaxed"
                  placeholder='{"resourceType": "Observation", ...}'
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-describedby="fhir-json-help"
                />
                <p id="fhir-json-help" className="mt-1 text-[11px] text-muted">
                  A single Observation or a Bundle. Synthetic data only — never paste real patient data.
                </p>
              </div>

              {editorMessage ? (
                <p role="alert" className="text-xs text-severity-critical">
                  {editorMessage}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button type="button" className="ls-btn" onClick={format} disabled={!text.trim()}>
                  Format JSON
                </button>
                <button
                  type="button"
                  className="ls-btn"
                  onClick={() => {
                    setText(loadedText);
                    setEditorMessage(null);
                  }}
                  disabled={text === loadedText}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="ls-btn-primary"
                  onClick={() => run(text)}
                  disabled={!ready || !text.trim() || ingest.status === 'running'}
                >
                  Ingest Synthetic FHIR
                </button>
                {ingest.status === 'done' && ingest.reply.response.observations_validated > 0 ? (
                  <button
                    type="button"
                    className="ls-btn"
                    onClick={() => run(ingest.body)}
                  >
                    Ingest Again
                  </button>
                ) : null}
              </div>

              <p role="status" aria-live="polite" className="min-h-5 text-xs text-muted">
                {ingest.status === 'running'
                  ? `${PROGRESS_STEPS[progress]} (one request to POST /api/fhir/ingest)`
                  : ''}
              </p>
            </div>
          </Card>

          <Card title="Ingestion result" subtitle="The backend's actual response." bodyClassName="p-0">
            <div className="space-y-4 p-4" aria-live="polite">
              {ingest.status === 'error' ? (
                <ErrorState title="The ingestion request failed" message={ingest.message} onRetry={retry} />
              ) : null}

              {reply ? (
                <IngestionSummary reply={reply} composition={composition} />
              ) : ingest.status !== 'error' ? (
                <p className="text-sm text-muted">Nothing ingested yet in this session.</p>
              ) : null}

              {ingest.status === 'done' && ingest.reply.response.observations_created > 0 ? (
                <DynamicRecalculatePrompt key={ingest.attempt} baseUrl={config.apiBaseUrl} />
              ) : null}

              {reply && reply.response.results.length > 1 ? (
                <div>
                  <label htmlFor="fhir-result" className="ls-label">
                    Observation in this submission
                  </label>
                  <select
                    id="fhir-result"
                    className="ls-select mt-1 block w-full"
                    value={resultIndex}
                    onChange={(event) => setResultIndex(Number(event.target.value))}
                  >
                    {reply.response.results.map((item, index) => (
                      <option key={`${item.resource}-${index}`} value={index}>
                        {item.resource} — {item.outcome}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <FhirPipeline stages={pipeline} />

              {outcome?.outcome === 'duplicate' ? (
                <p className="rounded-lg border border-severity-moderate/50 bg-severity-moderate/10 px-3 py-2 text-sm text-ink">
                  <strong>Duplicate detected.</strong> LabSentinel detected the same source system + source
                  observation ID and did not create a duplicate record.
                </p>
              ) : null}

              {reply ? <IssueList reply={reply} /> : null}

              {outcome && outcome.observation_id != null ? (
                currentRecord && 'value' in currentRecord ? (
                  <NormalizedComparison
                    source={sourceObservation ? summarizeSource(sourceObservation) : null}
                    record={currentRecord.value}
                    outcome={outcome}
                    facility={facilityInfo(outcome.facility_code)}
                  />
                ) : currentRecord && 'error' in currentRecord ? (
                  <p role="alert" className="text-sm text-severity-critical">
                    {currentRecord.error}
                  </p>
                ) : (
                  <LoadingState label="Loading the normalized record…" />
                )
              ) : null}
            </div>
          </Card>
        </div>
      )}

      {availability === 'available' ? (
        <Card
          title="Recent FHIR ingestions"
          subtitle="The latest FHIR-ingested observations from GET /api/observations — never the 699 seeded demonstration records."
          bodyClassName="p-0"
        >
          <RecentIngestions
            state={recent}
            facilityName={(id) => facilityById(id)?.name ?? `Facility ${id}`}
            onRetry={() => setRecentAttempt((value) => value + 1)}
          />
        </Card>
      ) : null}

      <Card title="How this works" bodyClassName="p-0">
        <ol className="grid gap-x-6 gap-y-1.5 p-4 text-sm text-ink sm:grid-cols-2 lg:grid-cols-4">
          {[
            'Receive FHIR',
            'Validate structure',
            'Identify laboratory Observation',
            'Normalize LOINC / result',
            'Resolve facility',
            'Persist in PostgreSQL',
            'Expose through LabSentinel API',
          ].map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="font-semibold text-brand">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function IngestionSummary({
  reply,
  composition,
}: {
  reply: IngestionReply;
  composition: Record<string, number> | null;
}) {
  const r = reply.response;
  const tone =
    reply.status !== 200 || (r.rejected > 0 && r.observations_created === 0 && r.duplicates === 0)
      ? { box: 'border-severity-critical/40 bg-severity-critical/5', label: '✕ Rejected' }
      : r.rejected > 0 || r.duplicates > 0 || r.warnings.length > 0
        ? { box: 'border-severity-moderate/50 bg-severity-moderate/10', label: '! Completed with warnings' }
        : { box: 'border-severity-low/40 bg-severity-low/5', label: '✓ Ingested' };
  const counts: Array<[string, number]> = [
    ['Resources received', r.resources_received],
    ['Observations validated', r.observations_validated],
    ['Created', r.observations_created],
    ['Duplicates', r.duplicates],
    ['Rejected', r.rejected],
  ];
  return (
    <div className={`rounded-lg border p-3 ${tone.box}`}>
      <p className="text-sm font-semibold text-ink">
        {tone.label}
        {reply.status !== 200 ? <span className="ml-2 text-xs font-normal text-muted">HTTP {reply.status}</span> : null}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
        {counts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] text-muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {composition ? (
        <div className="mt-3 border-t border-hairline pt-2">
          <p className="text-[11px] text-muted">Bundle contents</p>
          <p className="text-xs text-ink">
            {['Organization', 'Location', 'Specimen', 'DiagnosticReport', 'Observation', 'Patient']
              .filter((type) => composition[type])
              .map((type) => `${composition[type]} ${type}${composition[type] === 1 ? '' : 's'}`)
              .join(' · ')}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Processing is best effort per Observation: valid Observations are stored even when others are
            rejected. Patient resources are never read.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function IssueList({ reply }: { reply: IngestionReply }) {
  const issues = [...reply.response.errors, ...reply.response.warnings.filter((w) => w.code !== 'DUPLICATE')];
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Structured ingestion issues">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}-${index}`}
          role={issue.severity === 'error' ? 'alert' : undefined}
          className={`rounded-lg border px-3 py-2 ${
            issue.severity === 'error'
              ? 'border-severity-critical/40 bg-severity-critical/5'
              : 'border-severity-moderate/50 bg-severity-moderate/10'
          }`}
        >
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-xs font-semibold text-ink">{issue.code}</span>
            <span className="text-[11px] uppercase tracking-[0.06em] text-muted">
              {issue.severity === 'error' ? 'Error' : 'Warning'}
              {issue.resource ? ` · ${issue.resource}` : ''}
            </span>
          </p>
          {ISSUE_EXPLANATIONS[issue.code] ? (
            <p className="text-xs text-ink">{ISSUE_EXPLANATIONS[issue.code]}</p>
          ) : null}
          <p className="break-words text-xs text-muted">{issue.message}</p>
        </li>
      ))}
    </ul>
  );
}

export const DYNAMIC_PROMPT = 'Observation persisted. Dynamic surveillance can now be recalculated.';

/**
 * After a successful ingestion: offer to re-run the dynamic surveillance
 * engine (development only). Nothing is recalculated until asked, and the
 * frozen classroom demonstration is never affected.
 */
function DynamicRecalculatePrompt({ baseUrl }: { baseUrl: string }) {
  const client = useMemo(() => createDynamicSurveillanceClient(baseUrl), [baseUrl]);
  const [state, setState] = useState<
    | { status: 'idle' | 'running' | 'unavailable' }
    | { status: 'done'; result: RecalculateResult }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const run = async () => {
    setState({ status: 'running' });
    try {
      const result = await client.recalculate();
      setState(result === 'unavailable' ? { status: 'unavailable' } : { status: 'done', result });
    } catch (error) {
      setState({ status: 'error', message: describeDataError(error) });
    }
  };

  const latest = state.status === 'done' ? state.result.days[state.result.days.length - 1] : undefined;
  return (
    <div className="rounded-lg border border-brand/30 bg-brand-light px-3 py-2.5 text-sm text-ink">
      <p className="font-medium">{DYNAMIC_PROMPT}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="ls-btn" disabled={state.status === 'running'} onClick={run}>
          {state.status === 'running' ? 'Recalculating…' : 'Recalculate Dynamic Surveillance'}
        </button>
        <Link to="/dynamic-surveillance" className="text-xs font-medium text-brand underline-offset-2 hover:underline">
          Open Dynamic Surveillance
        </Link>
      </div>
      <p role="status" aria-live="polite" className="mt-1.5 text-xs text-muted">
        {state.status === 'done'
          ? `${state.result.message}${
              latest
                ? ` Latest date ${latest.signal_date}: ${
                    latest.composite_score === null ? latest.calculation_status : `${latest.composite_score} (${latest.severity})`
                  }.`
                : ''
            }`
          : state.status === 'unavailable'
            ? 'Recalculation is available only when the backend runs in development.'
            : state.status === 'error'
              ? state.message
              : 'The classroom demonstration is not affected: dynamic signals are calculated separately.'}
      </p>
    </div>
  );
}
