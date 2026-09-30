import type { ReactNode } from 'react';
import type { DynamicSignal } from '../../data-access/dynamicSurveillance';
import type { EwmaDay, EwmaMetric, EwmaPoint, EwmaState, EwmaSummary } from '../../data-access/ewma';
import { formatSurveillanceDate } from '../../lib/dynamicSurveillance';
import {
  AGREEMENT_LABEL,
  COMPOSITE_BANDS,
  EWMA_DISCLAIMER,
  EWMA_LABEL,
  EWMA_NOTE,
  METRIC_TITLE,
  NOT_AN_OUTBREAK,
  OVERALL_LABEL,
  STATE_ICON,
  STATE_LABEL,
  STATE_STYLE,
  crossedText,
  formatLead,
  metricValue,
  pointState,
} from '../../lib/ewma';
import Card from '../common/Card';
import SeverityBadge from '../signals/SeverityBadge';
import EwmaTrendChart, { EwmaSparkline, monitored } from './EwmaTrendChart';

export function EwmaStateBadge({ state, overall = false }: { state: EwmaState; overall?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ring-1 ring-inset ${STATE_STYLE[state]}`}>
      <span aria-hidden="true">{STATE_ICON[state]}</span>
      {overall ? OVERALL_LABEL[state] : STATE_LABEL[state]}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function MetricPanel({ metric, point, history }: { metric: EwmaMetric; point: EwmaPoint | null; history: EwmaPoint[] }) {
  const title = METRIC_TITLE[metric];
  return (
    <section aria-label={title} className="ls-card flex flex-col px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-ink">{title}</h3>
        {point?.alert_state ? (
          <EwmaStateBadge state={point.alert_state} />
        ) : (
          <span className="text-xs font-medium text-muted">{pointState(point)}</span>
        )}
      </div>
      {point && point.calculation_status === 'CALCULATED' ? (
        <>
          <dl className="mt-2 divide-y divide-hairline">
            <Fact label="Observed">{metricValue(metric, point.observed_value)}</Fact>
            <Fact label="Historical mean">
              {metricValue(metric, point.baseline_mean)}{' '}
              <span className="text-xs font-normal text-muted">
                (SD {metricValue(metric, point.baseline_stddev).replace(' tests', '')})
              </span>
            </Fact>
            <Fact label="EWMA">
              <span className="text-xs font-normal text-muted">{metricValue(metric, point.previous_ewma, 2)} → </span>
              {metricValue(metric, point.ewma_value, 2)}
            </Fact>
            <Fact label="Upper control limit">{metricValue(metric, point.upper_control_limit, 2)}</Fact>
            <Fact label="Warning limit">{metricValue(metric, point.warning_limit, 2)}</Fact>
            <Fact label="Crossed the limit?">{crossedText(point)}</Fact>
            <Fact label="Lambda · k">
              {point.lambda_value} · {point.k_value}
            </Fact>
            <Fact label="Historical period">
              {point.reference_first} to {point.reference_last} ({point.reference_days} days)
            </Fact>
          </dl>
          <p className="mt-2 text-sm text-ink">{point.explanation}</p>
          <div className="mt-2">
            <EwmaSparkline points={monitored(history, metric)} />
            <p className="text-[11px] text-muted">
              <span aria-hidden="true" className="text-brand">━</span> EWMA ·{' '}
              <span aria-hidden="true" className="text-severity-critical">┅</span> upper control limit
            </p>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">{point?.explanation ?? 'No EWMA result for this date.'}</p>
      )}
    </section>
  );
}

function DetectionComparison({ day, signal }: { day: EwmaDay; signal: DynamicSignal }) {
  return (
    <Card title="Detection Comparison" subtitle="Two independent methods, shown side by side. They are never combined into one number." bodyClassName="p-0">
      <div className="grid gap-px bg-hairline sm:grid-cols-2">
        <div className="bg-white px-5 py-4">
          <p className="ls-label">LabSentinel Composite Signal</p>
          {signal.composite_score === null || !signal.severity ? (
            <p className="mt-2 text-sm text-muted">Not calculated for this date.</p>
          ) : (
            <dl className="mt-1">
              <Fact label="Score">{signal.composite_score} / 100</Fact>
              <Fact label="Severity"><SeverityBadge severity={signal.severity} /></Fact>
            </dl>
          )}
        </div>
        <div className="bg-white px-5 py-4">
          <p className="ls-label">EWMA Statistical Detector</p>
          <dl className="mt-1">
            <Fact label="Volume">{pointState(day.volume)}</Fact>
            <Fact label="Positivity">{pointState(day.positivity)}</Fact>
            <Fact label="Overall">
              {day.overall_state ? <EwmaStateBadge state={day.overall_state} overall /> : 'Not monitored'}
            </Fact>
          </dl>
        </div>
      </div>
      <div role="status" className="border-t border-hairline bg-canvas px-5 py-3">
        <p className="text-sm font-semibold uppercase tracking-[0.04em] text-ink">Agreement: {AGREEMENT_LABEL[day.agreement]}</p>
        <p className="mt-1 text-sm text-ink">{day.agreement_text}</p>
      </div>
    </Card>
  );
}

function DetectionTiming({ summary }: { summary: EwmaSummary }) {
  const detection = summary.detection;
  if (!detection) return null;
  const date = (iso: string | null) => (iso ? formatSurveillanceDate(iso) : 'Not reached');
  const ewmaRows: [string, string | null, string][] = [
    ['Volume EWMA — Watch', detection.ewma_first.volume.watch, 'volume_watch'],
    ['Volume EWMA — Statistical Alert', detection.ewma_first.volume.alert, 'volume_alert'],
    ['Positivity EWMA — Watch', detection.ewma_first.positivity.watch, 'positivity_watch'],
    ['Positivity EWMA — Statistical Alert', detection.ewma_first.positivity.alert, 'positivity_alert'],
  ];
  return (
    <Card
      title="Detection timing"
      subtitle={`First date each method reaches each level, ${formatSurveillanceDate(detection.evaluation_from)} to ${formatSurveillanceDate(detection.evaluation_to)} (the EWMA monitoring period). Parameters fixed in advance: lambda ${summary.config.lambda}, k ${summary.config.k}.`}
      bodyClassName="p-0"
    >
      <div className="grid gap-px bg-hairline lg:grid-cols-2">
        <div className="bg-white">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">First date the Composite Outbreak Signal Score reaches each severity</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted">
                <th scope="col" className="px-5 py-2 font-semibold">Composite reaches</th>
                <th scope="col" className="px-5 py-2 font-semibold">First date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {COMPOSITE_BANDS.map((band) => (
                <tr key={band}>
                  <td className="px-5 py-2">{band}</td>
                  <td className="px-5 py-2 tabular-nums">{date(detection.composite_first[band])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="w-full overflow-x-auto bg-white">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <caption className="sr-only">First date each EWMA metric reaches Watch and Statistical Alert, and its lead or lag</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted">
                <th scope="col" className="px-5 py-2 font-semibold">EWMA reaches</th>
                <th scope="col" className="px-3 py-2 font-semibold">First date</th>
                <th scope="col" className="px-3 py-2 font-semibold">vs Composite Watch</th>
                <th scope="col" className="px-5 py-2 font-semibold">vs Composite High</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {ewmaRows.map(([label, first, key]) => (
                <tr key={key}>
                  <td className="px-5 py-2">{label}</td>
                  <td className="px-3 py-2 tabular-nums">{date(first)}</td>
                  <td className="px-3 py-2 text-muted">{formatLead(detection.lead_days[key]?.Watch ?? null)}</td>
                  <td className="px-5 py-2 text-muted">{formatLead(detection.lead_days[key]?.High ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="border-t border-hairline px-5 py-3 text-[11px] text-muted">
        "Earlier" means EWMA reached its level before the composite reached that band. {summary.agreement_rule}
      </p>
    </Card>
  );
}

export type EwmaRecalc =
  | { status: 'idle' | 'running' | 'unavailable' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

export default function StatisticalSurveillance({
  summary,
  history,
  day,
  signal,
  recalc,
  onRecalculate,
}: {
  summary: EwmaSummary;
  history: EwmaPoint[];
  /** undefined while the selected date's results load; null when there are none. */
  day: EwmaDay | null | undefined;
  signal: DynamicSignal;
  recalc: EwmaRecalc;
  onRecalculate: (() => void) | null;
}) {
  return (
    <section aria-labelledby="statistical-surveillance" className="space-y-4">
      <div className="ls-card border-l-4 border-l-brand px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">{EWMA_LABEL}</p>
            <h2 id="statistical-surveillance" className="text-lg font-semibold text-ink">Statistical Surveillance</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              An EWMA (exponentially weighted moving average) control chart for test volume and positivity, run beside
              the Composite Outbreak Signal Score to ask whether a time-series method independently detects a sustained
              shift. {EWMA_NOTE} {NOT_AN_OUTBREAK}
            </p>
          </div>
          {onRecalculate ? (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <button type="button" className="ls-btn" disabled={recalc.status === 'running'} onClick={onRecalculate}>
                {recalc.status === 'running' ? 'Recalculating…' : 'Recalculate EWMA'}
              </button>
              <p role="status" aria-live="polite" className="max-w-xs text-xs text-muted sm:text-right">
                {recalc.status === 'done' || recalc.status === 'error'
                  ? recalc.message
                  : recalc.status === 'unavailable'
                    ? 'Recalculation is available only when the backend runs in development.'
                    : 'Development only: recomputes EWMA from the stored observations.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {day === undefined ? (
        <p role="status" className="ls-card px-5 py-4 text-sm text-muted">Loading the EWMA results…</p>
      ) : day === null ? (
        <p className="ls-card px-5 py-4 text-sm text-muted">No EWMA result for {formatSurveillanceDate(signal.signal_date)}.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <MetricPanel metric="volume" point={day.volume} history={history} />
            <MetricPanel metric="positivity" point={day.positivity} history={history} />
          </div>
          <DetectionComparison day={day} signal={signal} />
        </>
      )}

      <Card title="EWMA trend" subtitle="Daily values, the EWMA, the historical mean and the upper control limit." bodyClassName="p-4">
        <EwmaTrendChart history={history} selectedDate={signal.signal_date} />
      </Card>

      <DetectionTiming summary={summary} />

      <p className="text-[11px] leading-relaxed text-muted">
        {EWMA_DISCLAIMER} Formula: {summary.formula.ewma}; {summary.formula.ucl}. Reference period{' '}
        {summary.references.volume ? `${summary.references.volume.first} to ${summary.references.volume.last}` : '—'}.
      </p>
    </section>
  );
}
