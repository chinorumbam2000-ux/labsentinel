/**
 * Dynamic Surveillance — API CAPSTONE MODE.
 *
 * Signals calculated by the backend's dynamic surveillance engine from the
 * laboratory observations persisted in PostgreSQL. A separate route, so the
 * classroom demonstration (Dashboard, Map, Signals, Simulation) is untouched:
 * the two modes are never mixed on one screen.
 *
 * Local demo mode (and the GitHub Pages build) renders only an explanation:
 * no client, no requests.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Card from '../components/common/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import DynamicProvenance from '../components/dynamic/DynamicProvenance';
import DynamicWhyThisSignal from '../components/dynamic/DynamicWhyThisSignal';
import StatisticalSurveillance, { type EwmaRecalc } from '../components/dynamic/StatisticalSurveillance';
import CusumSurveillance, { type CusumRecalc } from '../components/dynamic/CusumSurveillance';
import MethodComparison from '../components/dynamic/MethodComparison';
import SeverityBadge from '../components/signals/SeverityBadge';
import { useDataSourceContext } from '../data-access/DataSourceProvider';
import { isAbortError } from '../data-access/apiClient';
import {
  createDynamicSurveillanceClient,
  type DynamicSignal,
  type DynamicSignalSummary,
  type DynamicSummary,
  type RecalculateResult,
} from '../data-access/dynamicSurveillance';
import { createEwmaClient, type EwmaDay, type EwmaPoint, type EwmaSummary } from '../data-access/ewma';
import {
  createCusumClient,
  type CusumDay,
  type CusumPoint,
  type CusumSummary,
  type MethodComparison as Comparison,
} from '../data-access/cusum';
import { describeDataError } from '../data-access/hooks';
import {
  DYNAMIC_DISCLAIMER,
  DYNAMIC_LABEL,
  MODE_SEPARATION_TEXT,
  STATUS_LABEL,
  formatSurveillanceDate,
  percent,
  signed,
  statusMessage,
} from '../lib/dynamicSurveillance';
import { CONFIDENCE_DISCLAIMER } from '../lib/dataConfidence';

export default function DynamicSurveillancePage() {
  const { source } = useDataSourceContext();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Dynamic Surveillance</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Surveillance signals calculated from the laboratory observations stored in PostgreSQL, against a
          dynamic baseline of prior days.
        </p>
      </header>

      <div role="note" className="rounded-lg border border-brand/30 bg-brand-light px-4 py-2.5 text-sm text-ink">
        <strong className="mr-2 block tracking-[0.04em] sm:inline">DYNAMIC SURVEILLANCE MODE</strong>
        {DYNAMIC_LABEL} {MODE_SEPARATION_TEXT}
        <span className="mt-1 block text-xs text-muted">{DYNAMIC_DISCLAIMER} Synthetic data only.</span>
      </div>

      {source.mode === 'api' ? <DynamicWorkspace /> : <LocalModeNotice />}
    </div>
  );
}

function LocalModeNotice() {
  return (
    <Card title="Not available in Local Demo Mode" bodyClassName="p-0">
      <div className="space-y-2 p-5 text-sm text-muted">
        <p className="font-medium text-ink">Dynamic Surveillance requires LabSentinel API Capstone Mode.</p>
        <p>
          This build runs the frozen classroom demonstration in the browser, with no backend. Dynamic signals are
          calculated by the FastAPI backend from observations in PostgreSQL; start the app with{' '}
          <code className="font-mono">VITE_DATA_SOURCE=api</code> (see backend/README.md).
        </p>
      </div>
    </Card>
  );
}

type Overview =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; summary: DynamicSummary; history: DynamicSignalSummary[] };

type Selected =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; signal: DynamicSignal | null };

type Recalc =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: RecalculateResult }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

function DynamicWorkspace() {
  const { config } = useDataSourceContext();
  const client = useMemo(() => createDynamicSurveillanceClient(config.apiBaseUrl), [config.apiBaseUrl]);
  const [attempt, setAttempt] = useState(0);
  const [overview, setOverview] = useState<Overview>({ status: 'loading' });
  const [date, setDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>({ status: 'idle' });
  const [recalc, setRecalc] = useState<Recalc>({ status: 'idle' });
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  // Experimental EWMA detector: loaded on its own, so a failure never hides the composite.
  const ewmaClient = useMemo(() => createEwmaClient(config.apiBaseUrl), [config.apiBaseUrl]);
  const [ewmaAttempt, setEwmaAttempt] = useState(0);
  const [ewma, setEwma] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; summary: EwmaSummary; history: EwmaPoint[] }
  >({ status: 'loading' });
  const [ewmaDay, setEwmaDay] = useState<{ date: string; day: EwmaDay | null } | null>(null);
  const [ewmaRecalc, setEwmaRecalc] = useState<EwmaRecalc>({ status: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setEwma({ status: 'loading' });
    Promise.all([ewmaClient.summary(controller.signal), ewmaClient.history(controller.signal)])
      .then(([summary, history]) => !controller.signal.aborted && setEwma({ status: 'ready', summary, history }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setEwma({ status: 'error', message: describeDataError(error) });
      });
    return () => controller.abort();
  }, [ewmaClient, ewmaAttempt, attempt]);

  useEffect(() => {
    if (date === null || ewma.status !== 'ready') return undefined;
    const controller = new AbortController();
    ewmaClient
      .day(date, controller.signal)
      .then((day) => !controller.signal.aborted && setEwmaDay({ date, day }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setEwma({ status: 'error', message: describeDataError(error) });
      });
    return () => controller.abort();
  }, [ewmaClient, ewma, date]);

  // Experimental CUSUM detector and the three-method comparison: loaded on
  // their own, so neither can hide the composite or EWMA.
  const cusumClient = useMemo(() => createCusumClient(config.apiBaseUrl), [config.apiBaseUrl]);
  const [cusumAttempt, setCusumAttempt] = useState(0);
  const [cusum, setCusum] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; summary: CusumSummary; history: CusumPoint[] }
  >({ status: 'loading' });
  const [cusumDay, setCusumDay] = useState<{ date: string; day: CusumDay | null; comparison: Comparison | null } | null>(null);
  const [cusumRecalc, setCusumRecalc] = useState<CusumRecalc>({ status: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setCusum({ status: 'loading' });
    Promise.all([cusumClient.summary(controller.signal), cusumClient.history(controller.signal)])
      .then(([summary, history]) => !controller.signal.aborted && setCusum({ status: 'ready', summary, history }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setCusum({ status: 'error', message: describeDataError(error) });
      });
    return () => controller.abort();
  }, [cusumClient, cusumAttempt, ewmaAttempt, attempt]);

  useEffect(() => {
    if (date === null || cusum.status !== 'ready') return undefined;
    const controller = new AbortController();
    Promise.all([cusumClient.day(date, controller.signal), cusumClient.comparison(date, controller.signal)])
      .then(([day, comparison]) => !controller.signal.aborted && setCusumDay({ date, day, comparison }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setCusum({ status: 'error', message: describeDataError(error) });
      });
    return () => controller.abort();
  }, [cusumClient, cusum, date]);

  const runCusumRecalculation = async () => {
    setCusumRecalc({ status: 'running' });
    try {
      const result = await cusumClient.recalculate();
      if (result === 'unavailable') {
        setCusumRecalc({ status: 'unavailable' });
        return;
      }
      setCusumRecalc({ status: 'done', message: result.message });
      setCusumAttempt((value) => value + 1);
    } catch (error) {
      setCusumRecalc({ status: 'error', message: describeDataError(error) });
    }
  };

  // "View Statistical Details" (the SMART sidecar) links to #statistical-surveillance.
  const { hash } = useLocation();
  const ewmaShown = ewmaDay !== null && ewma.status === 'ready';
  useEffect(() => {
    if (hash === '#statistical-surveillance' && ewmaShown) {
      document.getElementById('statistical-surveillance')?.scrollIntoView?.({ block: 'start' });
    }
  }, [hash, ewmaShown]);

  const runEwmaRecalculation = async () => {
    setEwmaRecalc({ status: 'running' });
    try {
      const result = await ewmaClient.recalculate();
      if (result === 'unavailable') {
        setEwmaRecalc({ status: 'unavailable' });
        return;
      }
      setEwmaRecalc({ status: 'done', message: result.message });
      setEwmaAttempt((value) => value + 1);
    } catch (error) {
      setEwmaRecalc({ status: 'error', message: describeDataError(error) });
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setOverview({ status: 'loading' });
    (async () => {
      try {
        const [summary, history] = await Promise.all([
          client.summary(controller.signal),
          client.signals(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setOverview({ status: 'ready', summary, history });
        setDate((current) =>
          current && history.some((item) => item.signal_date === current) ? current : summary.last_date,
        );
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setOverview({ status: 'error', message: describeDataError(error) });
        }
      }
    })();
    return () => controller.abort();
  }, [client, attempt]);

  useEffect(() => {
    if (overview.status !== 'ready' || date === null) return undefined;
    if (overview.summary.latest && overview.summary.latest.signal_date === date) {
      setSelected({ status: 'ready', signal: overview.summary.latest });
      return undefined;
    }
    const controller = new AbortController();
    setSelected({ status: 'loading' });
    client
      .signalFor(date, controller.signal)
      .then((signal) => !controller.signal.aborted && setSelected({ status: 'ready', signal }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setSelected({ status: 'error', message: describeDataError(error) });
        }
      });
    return () => controller.abort();
  }, [client, overview, date]);

  const runRecalculation = async () => {
    setRecalc({ status: 'running' });
    try {
      const result = await client.recalculate();
      if (result === 'unavailable') {
        setRecalc({ status: 'unavailable' });
        return;
      }
      setRecalc({ status: 'done', result });
      reload();
    } catch (error) {
      setRecalc({ status: 'error', message: describeDataError(error) });
    }
  };

  if (overview.status === 'loading') return <LoadingState label="Loading dynamic surveillance…" />;
  if (overview.status === 'error') {
    return (
      <Card bodyClassName="p-0">
        <ErrorState title="Dynamic surveillance is unavailable" message={overview.message} onRetry={reload} />
      </Card>
    );
  }

  const { summary, history } = overview;
  const recalcControls = summary.recalculation_available ? (
    <RecalculateControls state={recalc} onRun={runRecalculation} />
  ) : null;

  if (summary.signal_count === 0) {
    return (
      <Card bodyClassName="p-0">
        <EmptyState
          title="No dynamic signals have been calculated yet"
          message="Load synthetic observations (python -m app.seed.dynamic_dataset, or FHIR ingestion), then run the engine (python -m app.surveillance.run) or recalculate here."
          action={recalcControls}
        />
      </Card>
    );
  }

  return (
    <>
      <Card bodyClassName="flex flex-wrap items-end justify-between gap-4 p-4">
        <div>
          <label htmlFor="dynamic-date" className="ls-label">
            Surveillance date
          </label>
          <select
            id="dynamic-date"
            className="ls-select mt-1 block"
            value={date ?? ''}
            onChange={(event) => setDate(event.target.value)}
          >
            {[...history].reverse().map((item) => (
              <option key={item.signal_date} value={item.signal_date}>
                {formatSurveillanceDate(item.signal_date)} —{' '}
                {item.composite_score === null
                  ? STATUS_LABEL[item.calculation_status]
                  : `${item.composite_score} ${item.severity}`}
              </option>
            ))}
          </select>
        </div>
        {recalcControls}
      </Card>

      {selected.status === 'loading' || selected.status === 'idle' ? (
        <LoadingState label="Loading the dynamic signal…" />
      ) : selected.status === 'error' ? (
        <Card bodyClassName="p-0">
          <ErrorState title="The dynamic signal could not be loaded" message={selected.message} onRetry={reload} />
        </Card>
      ) : selected.signal === null ? (
        <Card bodyClassName="p-0">
          <EmptyState title="No dynamic signal for this date" message="Recalculate to produce one." />
        </Card>
      ) : (
        <>
          <SignalView signal={selected.signal} />
          {cusum.status === 'ready' && cusumDay && cusumDay.date === selected.signal.signal_date && cusumDay.comparison ? (
            <MethodComparison
              comparison={cusumDay.comparison}
              ewmaSummary={ewma.status === 'ready' ? ewma.summary : null}
              cusumSummary={cusum.summary}
            />
          ) : null}
          {ewma.status === 'loading' ? (
            <LoadingState label="Loading statistical surveillance…" />
          ) : ewma.status === 'error' ? (
            <Card bodyClassName="p-0">
              <ErrorState
                title="Statistical surveillance is unavailable"
                message={ewma.message}
                onRetry={() => setEwmaAttempt((value) => value + 1)}
              />
            </Card>
          ) : ewma.summary.result_count === 0 ? (
            <Card title="Statistical Surveillance" bodyClassName="p-0">
              <EmptyState
                title="EWMA has not been calculated yet"
                message="Run python -m app.statistics.run, or recalculate here (development)."
                action={
                  ewma.summary.recalculation_available ? (
                    <button type="button" className="ls-btn" onClick={runEwmaRecalculation}>
                      {ewmaRecalc.status === 'running' ? 'Recalculating…' : 'Recalculate EWMA'}
                    </button>
                  ) : null
                }
              />
            </Card>
          ) : (
            <StatisticalSurveillance
              summary={ewma.summary}
              history={ewma.history}
              day={ewmaDay && ewmaDay.date === selected.signal.signal_date ? ewmaDay.day : undefined}
              signal={selected.signal}
              recalc={ewmaRecalc}
              onRecalculate={ewma.summary.recalculation_available ? runEwmaRecalculation : null}
            />
          )}
          {cusum.status === 'loading' ? (
            <LoadingState label="Loading CUSUM surveillance…" />
          ) : cusum.status === 'error' ? (
            <Card bodyClassName="p-0">
              <ErrorState
                title="CUSUM results are unavailable"
                message={cusum.message}
                onRetry={() => setCusumAttempt((value) => value + 1)}
              />
            </Card>
          ) : cusum.summary.result_count === 0 ? (
            <Card title="CUSUM Surveillance" bodyClassName="p-0">
              <EmptyState
                title="CUSUM has not been calculated yet"
                message="Run python -m app.statistics.run --method cusum, or recalculate here (development)."
                action={
                  cusum.summary.recalculation_available ? (
                    <button type="button" className="ls-btn" onClick={runCusumRecalculation}>
                      {cusumRecalc.status === 'running' ? 'Recalculating…' : 'Recalculate CUSUM'}
                    </button>
                  ) : null
                }
              />
            </Card>
          ) : (
            <CusumSurveillance
              summary={cusum.summary}
              history={cusum.history}
              day={cusumDay && cusumDay.date === selected.signal.signal_date ? cusumDay.day : undefined}
              selectedDate={selected.signal.signal_date}
              recalc={cusumRecalc}
              onRecalculate={cusum.summary.recalculation_available ? runCusumRecalculation : null}
            />
          )}
        </>
      )}

      <Card
        title="Dynamic signal history"
        subtitle={`${summary.signal_count} calculated dates, ${formatSurveillanceDate(summary.first_date!)} to ${formatSurveillanceDate(summary.last_date!)}.`}
        bodyClassName="p-0"
      >
        <SignalHistory history={history} selected={date} onSelect={setDate} />
      </Card>

      <MethodCard summary={summary} />
    </>
  );
}

function RecalculateControls({ state, onRun }: { state: Recalc; onRun: () => void }) {
  return (
    <div className="flex max-w-md flex-col items-start gap-1.5 sm:items-end">
      <button type="button" className="ls-btn" disabled={state.status === 'running'} onClick={onRun}>
        {state.status === 'running' ? 'Recalculating…' : 'Recalculate Dynamic Surveillance'}
      </button>
      <p role="status" aria-live="polite" className="text-xs text-muted sm:text-right">
        {state.status === 'done'
          ? state.result.message
          : state.status === 'unavailable'
            ? 'Recalculation is available only when the backend runs in development.'
            : state.status === 'error'
              ? state.message
              : 'Development only: re-runs the engine over every date with observations.'}
      </p>
    </div>
  );
}

function Metric({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="ls-label">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums text-ink">{children}</dd>
      {hint ? <dd className="mt-0.5 text-[11px] text-muted">{hint}</dd> : null}
    </div>
  );
}

function SignalView({ signal }: { signal: DynamicSignal }) {
  const calc = signal.calculation;
  const changes = calc.changes;
  const message = statusMessage(signal);
  const confidence = calc.data_confidence;

  return (
    <>
      <Card
        title="Dynamic Surveillance"
        subtitle={`${DYNAMIC_LABEL} ${signal.syndrome}.`}
        bodyClassName="p-0"
      >
        <dl className="grid grid-cols-1 gap-px bg-hairline min-[420px]:grid-cols-2 md:grid-cols-4">
          <Metric label="Syndrome">{signal.syndrome}</Metric>
          <Metric label="Surveillance date">{formatSurveillanceDate(signal.signal_date)}</Metric>
          <Metric label="Current tests">{signal.test_volume}</Metric>
          <Metric label="Baseline tests" hint={`Mean of ${calc.baseline.observed_days} prior days with data`}>
            {signal.baseline_volume === null ? 'Not available' : `${signal.baseline_volume.toFixed(1)} a day`}
          </Metric>
          <Metric label="Volume change">{changes ? signed(changes.volume_change_percent, 1, '%') : '—'}</Metric>
          <Metric label="Current positivity">{percent(signal.positivity_rate)}</Metric>
          <Metric label="Baseline positivity">{percent(signal.baseline_positivity_rate)}</Metric>
          <Metric label="Positivity change">
            {changes ? `${signed(changes.positivity_change_points)} points` : '—'}
          </Metric>
          <Metric label="Affected facilities">
            {signal.affected_facilities} of {signal.participating_facilities}
          </Metric>
          <Metric label="Affected geographic areas">
            {signal.affected_geographies.length} of {signal.participating_geographies}
          </Metric>
          <Metric label="Persistence">
            {signal.persistence_days} {signal.persistence_days === 1 ? 'day' : 'days'}
          </Metric>
          <Metric label="Last calculated">
            {signal.calculated_at ? new Date(signal.calculated_at).toLocaleString('en-US') : '—'}
          </Metric>
          <Metric label="Composite Outbreak Signal Score">
            {signal.composite_score === null ? 'Not calculated' : `${signal.composite_score} / 100`}
          </Metric>
          <Metric label="Severity">
            {signal.severity ? <SeverityBadge severity={signal.severity} size="md" /> : 'Not calculated'}
          </Metric>
          <Metric label="Data Confidence" hint="Separate from severity: how trustworthy the data are">
            {signal.data_confidence_score === null
              ? 'Not assessed'
              : `${signal.data_confidence_score} · ${signal.data_confidence_level}`}
          </Metric>
          <Metric label="Calculation">{STATUS_LABEL[signal.calculation_status]}</Metric>
        </dl>
        {message ? (
          <div role="status" className="border-t border-hairline bg-canvas px-5 py-3 text-sm text-ink">
            <p className="font-semibold">{message}</p>
            <p className="mt-1 text-xs text-muted">
              {calc.baseline.observed_days} of the required {calc.baseline.min_days} prior days have data (window{' '}
              {calc.baseline.window_start} to {calc.baseline.window_end}). No score is produced rather than one
              from a fabricated baseline.
            </p>
          </div>
        ) : null}
      </Card>

      <DynamicWhyThisSignal signal={signal} />

      <div className="grid gap-5 xl:grid-cols-5">
        <Card
          title="Contributing facilities"
          subtitle="Aggregate provenance: tests and results per facility, never patient records."
          bodyClassName="p-0"
          className="xl:col-span-3"
        >
          <DynamicProvenance signal={signal} />
        </Card>
        <Card title="Data Confidence" subtitle="How trustworthy the data are, never combined with the score." bodyClassName="p-0" className="xl:col-span-2">
          {confidence ? (
            <div className="p-5">
              <p className="text-lg font-semibold text-ink">
                {confidence.score} / 100 · {confidence.level}
              </p>
              <p className="mt-1 text-xs text-muted">{confidence.explanation}</p>
              <ul className="mt-3 divide-y divide-hairline text-sm">
                {confidence.components.map((item) => (
                  <li key={item.key} className="flex items-start justify-between gap-3 py-2">
                    <span>
                      <span className="block font-medium text-ink">{item.label}</span>
                      <span className="block text-[11px] text-muted">{item.evidence}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-ink">
                      {item.points} / {item.max_points}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">{CONFIDENCE_DISCLAIMER}</p>
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">No participating facility has reported: confidence cannot be assessed.</p>
          )}
        </Card>
      </div>
    </>
  );
}

function SignalHistory({
  history,
  selected,
  onSelect,
}: {
  history: DynamicSignalSummary[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">Every calculated dynamic signal, oldest first</caption>
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-muted">
            <th scope="col" className="px-5 py-2 font-semibold">Date</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Tests</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Positivity</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Facilities</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Persistence</th>
            <th scope="col" className="px-3 py-2 font-semibold">Score</th>
            <th scope="col" className="px-5 py-2 text-right font-semibold">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {history.map((item) => (
            <tr key={item.id} className={item.signal_date === selected ? 'bg-brand-light/60' : undefined}>
              <td className="px-5 py-2">
                <button
                  type="button"
                  className="font-medium text-brand underline-offset-2 hover:underline"
                  aria-current={item.signal_date === selected ? 'date' : undefined}
                  onClick={() => onSelect(item.signal_date)}
                >
                  {formatSurveillanceDate(item.signal_date)}
                </button>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{item.test_volume}</td>
              <td className="px-3 py-2 text-right tabular-nums">{percent(item.positivity_rate)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {item.calculation_status === 'CALCULATED' ? `${item.affected_facilities} / ${item.participating_facilities}` : '—'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{item.persistence_days}</td>
              <td className="px-3 py-2">
                {item.severity ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular-nums">{item.composite_score}</span>
                    <SeverityBadge severity={item.severity} />
                  </span>
                ) : (
                  <span className="text-xs text-muted">{STATUS_LABEL[item.calculation_status]}</span>
                )}
              </td>
              <td className="px-5 py-2 text-right tabular-nums text-muted">
                {item.data_confidence_score ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MethodCard({ summary }: { summary: DynamicSummary }) {
  const description = summary.method.description;
  const rows: [string, string][] = [
    ['Baseline', description.baseline],
    ['Affected facility rule', description.affected_facility_rule],
    ['Persistence rule', description.persistence_rule],
    ['Eligible observations', description.eligibility],
    [
      'Weights',
      'Volume 25% · Positivity 30% · Affected facilities 20% · Geographic spread 15% · Persistence 10% — the existing LabSentinel weights. Severity: 0-19 Low, 20-39 Watch, 40-64 Moderate, 65-84 High, 85-100 Critical.',
    ],
  ];
  return (
    <Card title="How the dynamic signal is calculated" subtitle={`Engine version ${summary.method.engine_version}.`} bodyClassName="p-0">
      <dl className="divide-y divide-hairline">
        {rows.map(([label, text]) => (
          <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_1fr]">
            <dt className="ls-label">{label}</dt>
            <dd className="text-sm text-ink">{text}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-hairline px-5 py-3 text-[11px] text-muted">{summary.disclaimer}</p>
    </Card>
  );
}
