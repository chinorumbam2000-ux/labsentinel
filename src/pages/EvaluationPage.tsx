/**
 * Capstone Evaluation — API CAPSTONE MODE, development only.
 *
 * Read-only view of the synthetic-scenario evaluation produced by
 * `python -m app.evaluation.run` (backend/evaluation-results). It compares the
 * Composite, EWMA and CUSUM detectors on scenarios with known ground truth and
 * describes their tradeoffs; it never names a winner and never runs or
 * changes anything.
 *
 * Local demo mode (and the GitHub Pages build) renders only an explanation.
 */
import { useEffect, useMemo, useState } from 'react';
import Card from '../components/common/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import EvaluationSummaryCard from '../components/evaluation/EvaluationSummary';
import EvaluationTimeline from '../components/evaluation/EvaluationTimeline';
import {
  AttributesTable,
  ConditionTable,
  ConfusionMatrices,
  DetectorComparisonTable,
  SensitivityTable,
} from '../components/evaluation/EvaluationTables';
import { useDataSourceContext } from '../data-access/DataSourceProvider';
import { isAbortError } from '../data-access/apiClient';
import {
  createEvaluationClient,
  type EvaluationAvailability,
  type EvaluationSummary,
  type LeadLag,
  type ScenarioSummary,
} from '../data-access/evaluation';
import { describeDataError } from '../data-access/hooks';
import {
  DETECTORS,
  DETECTOR_NAME,
  EVALUATION_DISCLAIMER,
  EVALUATION_LABEL,
  NO_WINNER,
  delayText,
  proportionText,
  scenarioResult,
  value,
} from '../lib/evaluation';

export default function EvaluationPage() {
  const { source } = useDataSourceContext();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Capstone Evaluation</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{EVALUATION_LABEL}</p>
      </header>

      <div role="note" className="rounded-lg border border-[#F59E0B]/50 bg-[#FFFBEB] px-4 py-2.5 text-sm text-ink">
        <strong className="mr-2 block tracking-[0.04em] sm:inline">SYNTHETIC EVALUATION</strong>
        {EVALUATION_DISCLAIMER}
      </div>

      {source.mode === 'api' ? <EvaluationWorkspace /> : <LocalModeNotice />}
    </div>
  );
}

function LocalModeNotice() {
  return (
    <Card title="Not available in Local Demo Mode" bodyClassName="p-0">
      <div className="space-y-2 p-5 text-sm text-muted">
        <p className="font-medium text-ink">The Capstone Evaluation requires LabSentinel API Capstone Mode.</p>
        <p>
          The evaluation results are produced by the FastAPI backend (
          <code className="font-mono">python -m app.evaluation.run --all</code>) and served read-only in development. Start
          the app with <code className="font-mono">VITE_DATA_SOURCE=api</code> (see backend/README.md).
        </p>
      </div>
    </Card>
  );
}

type Load = { status: 'loading' } | { status: 'error'; message: string } | EvaluationAvailability;

function EvaluationWorkspace() {
  const { config } = useDataSourceContext();
  const client = useMemo(() => createEvaluationClient(config.apiBaseUrl), [config.apiBaseUrl]);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: 'loading' });
    client
      .summary(controller.signal)
      .then((result) => !controller.signal.aborted && setLoad(result))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setLoad({ status: 'error', message: describeDataError(error) });
      });
    return () => controller.abort();
  }, [client, attempt]);

  if (load.status === 'loading') return <LoadingState label="Loading evaluation results…" />;
  if (load.status === 'error') return <ErrorState message={load.message} onRetry={() => setAttempt((n) => n + 1)} />;
  if (load.status !== 'ready') {
    return <EmptyState title="No evaluation results" message={load.message} />;
  }
  return <EvaluationResults summary={load.summary} client={client} />;
}

function EvaluationResults({ summary, client }: { summary: EvaluationSummary; client: ReturnType<typeof createEvaluationClient> }) {
  const names = useMemo(() => Object.fromEntries(summary.scenarios.map((s) => [s.id, scenarioLabel(s)])), [summary]);
  const overall = summary.overall.detectors;
  const sensitivity = summary.sensitivity;

  return (
    <>
      <EvaluationSummaryCard summary={summary} />

      <Card title="How this evaluation was run" subtitle="Deterministic and reproducible">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact term="Repetitions per scenario" detail={String(summary.repetitions)} />
          <Fact term="Base seed" detail={String(summary.seed)} />
          <Fact term="Monitored window" detail={`${summary.calendar.monitoring_start} → ${summary.calendar.end} (${summary.calendar.monitoring_days} days)`} />
          <Fact term="True onset (outbreak scenarios)" detail={summary.calendar.onset} />
        </dl>
        <div className="mt-4 grid gap-3 text-xs text-muted md:grid-cols-3">
          {DETECTORS.map((d) => (
            <p key={d}>
              <strong className="text-ink">{DETECTOR_NAME[d]} detection:</strong> {summary.definitions.detection[d]}
            </p>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          {summary.definitions.parameters} {summary.definitions.confidence_interval} {summary.definitions.roc_auc}
        </p>
        <p className="mt-2 text-xs text-muted" data-dev-detail>
          Reproduce: <code className="font-mono">{summary.reproduce}</code>
        </p>
      </Card>

      {overall ? (
        <Card title="Overall comparison" subtitle={summary.overall.scope} bodyClassName="p-0">
          <p className="px-5 pt-4 text-sm text-ink">{NO_WINNER}</p>
          <div className="pt-3">
            <DetectorComparisonTable detectors={overall} caption="Pooled comparison of the three detectors across the primary scenarios" />
          </div>
          <p className="px-5 py-3 text-xs text-muted">
            Positive and negative predictive values depend on how many outbreak and no-outbreak scenarios the design contains; they
            are not prevalence estimates for any real population.
          </p>
        </Card>
      ) : null}

      {overall ? (
        <Card title="Confusion matrices" subtitle="Pooled primary scenarios, with the unit of analysis labelled">
          <ConfusionMatrices detectors={overall} units={summary.definitions.units} />
        </Card>
      ) : null}

      <ScenarioExplorer summary={summary} client={client} />

      <Card title="Robustness to Data Quality Problems" subtitle="The same moderate outbreak (S13) under reporting gaps, delays and terminology problems" bodyClassName="p-0">
        <ConditionTable rows={summary.robustness} names={names} caption="Detector results under data-quality problems" />
        <p className="px-5 py-3 text-xs text-muted">
          Compare each row with S13 (clean data). Delayed data (S10) is scored in real time (as each day&apos;s results had
          arrived). Data Confidence is the composite engine&apos;s own data-quality score.
        </p>
      </Card>

      {summary.coverage.length > 0 ? (
        <Card title="Facility coverage" subtitle="S13 with all 3, 2 of 3 and 1 of 3 facilities reporting from a week before onset" bodyClassName="p-0">
          <ConditionTable rows={summary.coverage} names={names} caption="Detector results by facility coverage" />
          <p className="px-5 py-3 text-xs text-muted">
            Fewer reporting facilities shrinks the composite&apos;s facility denominator, so one affected facility weighs more;
            earlier composite detection here reflects less information, not better performance.
          </p>
        </Card>
      ) : null}

      <Card title="Secondary analysis: parameter and cutoff sensitivity" subtitle={sensitivity.note} bodyClassName="p-0">
        <div className="space-y-5 py-4">
          <section>
            <h3 className="px-5 pb-2 text-sm font-semibold text-ink">EWMA smoothing λ</h3>
            <SensitivityTable rows={sensitivity.ewma_lambda.pooled} setting={(r) => `λ = ${r.lambda}`} caption="EWMA lambda sensitivity" />
          </section>
          <section>
            <h3 className="px-5 pb-2 text-sm font-semibold text-ink">CUSUM reference value k and decision limit h</h3>
            <SensitivityTable rows={sensitivity.cusum_k_h.pooled} setting={(r) => `k = ${r.k}, h = ${r.h}`} caption="CUSUM k and h sensitivity" />
          </section>
          <section>
            <h3 className="px-5 pb-2 text-sm font-semibold text-ink">Composite severity cutoff (exploratory)</h3>
            <SensitivityTable rows={sensitivity.composite_cutoffs.pooled} setting={(r) => `${r.cutoff} or above`} caption="Composite cutoff sensitivity" />
            <p className="px-5 pt-2 text-xs text-muted">{sensitivity.composite_cutoffs.note}</p>
          </section>
        </div>
      </Card>

      <Card title="CDC/WHO surveillance attributes" subtitle="What this synthetic evaluation can and cannot assess" bodyClassName="p-0">
        <AttributesTable attributes={summary.cdc_who_attributes} />
      </Card>

      <Card title="Threats to validity">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
          {summary.threats_to_validity.map((threat) => (
            <li key={threat}>{threat}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{EVALUATION_DISCLAIMER}</p>
      </Card>
    </>
  );
}

/** "S13 Moderate regional outbreak …"; the coverage variants carry their own "Coverage: …" name. */
const scenarioLabel = (s: ScenarioSummary): string =>
  s.group === 'coverage' ? s.name : `S${String(s.number).padStart(2, '0')} ${s.name}`;

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="ls-label">{term}</dt>
      <dd className="mt-0.5 text-ink">{detail}</dd>
    </div>
  );
}

type ScenarioLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; scenario: ScenarioSummary };

function ScenarioExplorer({ summary, client }: { summary: EvaluationSummary; client: ReturnType<typeof createEvaluationClient> }) {
  const [id, setId] = useState(summary.scenarios[0]?.id ?? '');
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<ScenarioLoad>({ status: 'loading' });

  useEffect(() => {
    if (!id) return undefined;
    const controller = new AbortController();
    setDetail({ status: 'loading' });
    client
      .scenario(id, controller.signal)
      .then((scenario) => !controller.signal.aborted && setDetail({ status: 'ready', scenario }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setDetail({ status: 'error', message: describeDataError(error) });
      });
    return () => controller.abort();
  }, [client, id, attempt]);

  const scenario = summary.scenarios.find((s) => s.id === id);
  if (!scenario) return null;
  const truth = scenario.ground_truth;

  return (
    <>
      <Card bodyClassName="flex flex-wrap items-end gap-4 p-4">
        <div className="w-full min-w-0 sm:w-auto">
          <label htmlFor="evaluation-scenario" className="ls-label">
            Scenario
          </label>
          <select id="evaluation-scenario" className="ls-select mt-1 block w-full max-w-full" value={id} onChange={(event) => setId(event.target.value)}>
            {summary.scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {scenarioLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <p className="max-w-2xl text-sm text-muted">{scenario.purpose}</p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Ground truth" subtitle={scenario.id}>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Fact term="Outbreak present" detail={truth.outbreak_present ? 'Yes' : 'No'} />
            <Fact term="True outbreak window" detail={truth.outbreak_present ? `${truth.true_outbreak_start} → ${truth.true_outbreak_end}` : '—'} />
            <Fact term="Affected facilities" detail={truth.true_affected_facilities.join(', ') || '—'} />
            <Fact term="Affected geographies" detail={truth.true_affected_geographies.join(', ') || '—'} />
          </dl>
          <p className="mt-3 text-sm text-ink">{truth.description}</p>
          <p className="mt-2 text-xs text-muted">{scenario.description}</p>
        </Card>
        <Card title="Data-quality conditions" subtitle={`${scenario.realizations} runs · mean ${scenario.mean_observations} observations per run`}>
          {scenario.conditions.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {scenario.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink">Clean data: every facility reports every day, on time, with mapped codes.</p>
          )}
          {scenario.as_of ? (
            <p className="mt-2 text-xs text-muted">Scored in real time: each day only sees the results received by then.</p>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            Data Confidence: normal days mean {value(scenario.data_confidence.normal_days.mean, 2)} (min{' '}
            {value(scenario.data_confidence.normal_days.min, 1)}); outbreak days mean{' '}
            {value(scenario.data_confidence.outbreak_days.mean, 2)} (min {value(scenario.data_confidence.outbreak_days.min, 1)}).
          </p>
        </Card>
      </div>

      <Card title="Detector results for this scenario" subtitle="Fixed detection definitions, default parameters" bodyClassName="p-0">
        <div className="grid gap-px border-b border-hairline bg-hairline md:grid-cols-3">
          {DETECTORS.map((d) => {
            const m = scenario.detectors[d];
            return (
              <div key={d} className="bg-white p-4 text-sm">
                <p className="font-semibold text-ink">{DETECTOR_NAME[d]}</p>
                <p className="mt-1 text-ink">{scenarioResult(scenario, d)}</p>
                <dl className="mt-2 space-y-1 text-xs text-muted">
                  {truth.outbreak_present ? (
                    <>
                      <div>
                        <dt className="inline font-medium">Detected: </dt>
                        <dd className="inline">{proportionText(m.realization_level.sensitivity)}</dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">Detection timing: </dt>
                        <dd className="inline">{delayText(m.detection_delay_days)}</dd>
                      </div>
                      {scenario.as_of ? (
                        <div>
                          <dt className="inline font-medium">Retrospective timing: </dt>
                          <dd className="inline">{delayText(m.retrospective_delay_days)}</dd>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div>
                      <dt className="inline font-medium">Runs with a false alert: </dt>
                      <dd className="inline">{proportionText(m.realization_level.false_positive_rate)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline font-medium">Alert burden: </dt>
                    <dd className="inline">
                      {m.burden.alert_days} alert days in {m.burden.monitored_days} monitored days; {m.burden.false_alert_days} false-alert
                      days ({value(m.burden.false_alert_days_per_100_normal_days, 3)} per 100 normal days)
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Stability: </dt>
                    <dd className="inline">
                      {value(m.stability.transitions_per_100_normal_days, 3)} state changes per 100 normal days; false episode
                      length {m.stability.false_episode_length.n ? `median ${m.stability.false_episode_length.median} d` : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
        {scenario.lead_lag ? <LeadLagTable leadLag={scenario.lead_lag} /> : null}
        <SecondaryEvents scenario={scenario} definitions={summary.definitions.secondary_events} />
      </Card>

      <Card title="Scenario timeline" subtitle="One representative run (repetition 0)">
        {detail.status === 'loading' ? <LoadingState label="Loading scenario timeline…" /> : null}
        {detail.status === 'error' ? <ErrorState message={detail.message} onRetry={() => setAttempt((n) => n + 1)} /> : null}
        {detail.status === 'ready' && detail.scenario.id === id ? <EvaluationTimeline scenario={detail.scenario} /> : null}
      </Card>
    </>
  );
}

function LeadLagTable({ leadLag }: { leadLag: Record<string, LeadLag> }) {
  return (
    <div className="overflow-x-auto px-5 py-4" tabIndex={0} role="region" aria-label="Lead / lag between methods">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <caption className="pb-2 text-left text-sm font-semibold text-ink">Lead / lag between methods (runs where both detected)</caption>
        <thead>
          <tr className="border-b border-hairline text-left text-muted">
            <th scope="col" className="px-2 py-1.5 font-semibold">Pair</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Both detected</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">First earlier</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Same day</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Second earlier</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Only one detected</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Difference (days)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline tabular-nums">
          {Object.entries(leadLag).map(([pair, row]) => {
            const [a, b] = pair.split('_vs_');
            const nameA = DETECTOR_NAME[a as keyof typeof DETECTOR_NAME] ?? a;
            const nameB = DETECTOR_NAME[b as keyof typeof DETECTOR_NAME] ?? b;
            return (
              <tr key={pair}>
                <th scope="row" className="px-2 py-1.5 text-left font-medium text-ink">
                  {nameA} vs {nameB}
                </th>
                <td className="px-2 py-1.5">{row.both_detected}</td>
                <td className="px-2 py-1.5">{nameA} {String(row[`${a}_earlier`])}</td>
                <td className="px-2 py-1.5">{row.same_day}</td>
                <td className="px-2 py-1.5">{nameB} {String(row[`${b}_earlier`])}</td>
                <td className="px-2 py-1.5">
                  {nameA} {String(row[`only_${a}`])} · {nameB} {String(row[`only_${b}`])}
                </td>
                <td className="px-2 py-1.5">
                  {row.days_b_minus_a.n ? `median ${row.days_b_minus_a.median} (IQR ${row.days_b_minus_a.p25}–${row.days_b_minus_a.p75})` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">Difference: positive when the first-named method detected earlier, negative when the second did.</p>
    </div>
  );
}

function SecondaryEvents({ scenario, definitions }: { scenario: ScenarioSummary; definitions: Record<string, string> }) {
  const entries = Object.entries(scenario.secondary);
  if (!entries.length) return null;
  return (
    <div className="border-t border-hairline px-5 py-4">
      <p className="text-sm font-semibold text-ink">Secondary events (earlier, lower-level states; not detections)</p>
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {entries.map(([key, event]) => (
          <li key={key}>
            <strong className="text-ink">{definitions[key] ?? key}</strong> {proportionText(event.detected)};{' '}
            {delayText(event.delay_days)}
          </li>
        ))}
      </ul>
    </div>
  );
}
