import type { ReactNode } from 'react';
import type { CusumDay, CusumPoint, CusumSummary } from '../../data-access/cusum';
import type { EwmaMetric } from '../../data-access/ewma';
import { formatSurveillanceDate } from '../../lib/dynamicSurveillance';
import {
  APPROACHING_NOTE,
  CUSUM_DISCLAIMER,
  CUSUM_TITLE,
  crossedLimit,
  cusumState,
  deviationText,
  metricValue,
  signedSum,
  sum,
} from '../../lib/cusum';
import { formatLead } from '../../lib/ewma';
import Card from '../common/Card';
import CusumTrendChart from './CusumTrendChart';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function CusumBadge({ point }: { point: CusumPoint }) {
  const alert = point.alert_state === 'STATISTICAL_ALERT';
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ring-1 ring-inset ${
          alert ? 'bg-severity-critical/10 text-[#991B1B] ring-severity-critical/40' : 'bg-canvas text-ink ring-hairline'
        }`}
      >
        <span aria-hidden="true">{alert ? '▲' : '●'}</span>
        {cusumState(point)}
      </span>
      {point.approaching_limit ? (
        <span className="rounded-full bg-severity-moderate/10 px-2 py-0.5 text-[11px] font-medium text-[#92400E] ring-1 ring-inset ring-severity-moderate/40">
          Approaching limit (informational)
        </span>
      ) : null}
    </span>
  );
}

function CusumPanel({ metric, point }: { metric: EwmaMetric; point: CusumPoint | null }) {
  const title = CUSUM_TITLE[metric];
  return (
    <section aria-label={title} className="ls-card flex flex-col px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-ink">{title}</h3>
        {point?.alert_state ? <CusumBadge point={point} /> : <span className="text-xs font-medium text-muted">{cusumState(point)}</span>}
      </div>
      {point && point.calculation_status === 'CALCULATED' ? (
        <>
          <dl className="mt-2 divide-y divide-hairline">
            <Fact label="Observed today">{metricValue(metric, point.observed_value)}</Fact>
            <Fact label="Historical mean">{metricValue(metric, point.baseline_mean)}</Fact>
            <Fact label="Standard deviation">{metricValue(metric, point.baseline_stddev).replace(' tests', '')}</Fact>
            <Fact label="Standardized deviation (z)">
              {sum(point.z_score)}{' '}
              <span className="block text-[11px] font-normal text-muted">{deviationText(point)}</span>
            </Fact>
            <Fact label="Previous CUSUM">{sum(point.previous_cusum)}</Fact>
            <Fact label="Added today (z − k)">
              {signedSum(point.increment)}{' '}
              <span className="block text-[11px] font-normal text-muted">then floored at zero</span>
            </Fact>
            <Fact label="Current CUSUM">{sum(point.cusum_value)}</Fact>
            <Fact label="Decision limit h">{sum(point.h, 1)}</Fact>
            <Fact label="Crossed the limit?">{crossedLimit(point)}</Fact>
            <Fact label="Reference value k">{sum(point.k, 2)}</Fact>
            <Fact label="Historical period">
              {point.reference_first} to {point.reference_last} ({point.reference_days} days)
            </Fact>
          </dl>
          <p className="mt-2 text-sm text-ink">{point.explanation}</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">{point?.explanation ?? 'No CUSUM result for this date.'}</p>
      )}
    </section>
  );
}

function CusumTiming({ summary }: { summary: CusumSummary }) {
  const detection = summary.detection;
  if (!detection) return null;
  const date = (iso: string | null) => (iso ? formatSurveillanceDate(iso) : 'Not reached');
  const rows: [string, 'volume' | 'positivity' | 'overall'][] = [
    ['Volume CUSUM — Statistical Alert', 'volume'],
    ['Positivity CUSUM — Statistical Alert', 'positivity'],
    ['Either metric (overall)', 'overall'],
  ];
  const check = detection.reference_check;
  return (
    <Card
      title="CUSUM detection timing"
      subtitle={`First alert in the monitoring period (${formatSurveillanceDate(detection.evaluation_from)} to ${formatSurveillanceDate(detection.evaluation_to)}), against the composite and EWMA. Parameters fixed in advance: k ${summary.config.k}, h ${summary.config.h}.`}
      bodyClassName="p-0"
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">First CUSUM alert per metric and its lead or lag against the other methods</caption>
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-muted">
              <th scope="col" className="px-5 py-2 font-semibold">CUSUM reaches h</th>
              <th scope="col" className="px-3 py-2 font-semibold">First date</th>
              <th scope="col" className="px-3 py-2 font-semibold">vs Composite High</th>
              <th scope="col" className="px-3 py-2 font-semibold">vs Composite Critical</th>
              <th scope="col" className="px-5 py-2 font-semibold">vs EWMA alert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map(([label, key]) => (
              <tr key={key}>
                <td className="px-5 py-2">{label}</td>
                <td className="px-3 py-2 tabular-nums">{date(detection.cusum_first[key])}</td>
                <td className="px-3 py-2 text-muted">{formatLead(detection.lead_days[key].composite_high)}</td>
                <td className="px-3 py-2 text-muted">{formatLead(detection.lead_days[key].composite_critical)}</td>
                <td className="px-5 py-2 text-muted">{formatLead(detection.lead_days[key].ewma_alert)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {check ? (
        <p className="border-t border-hairline px-5 py-3 text-xs text-ink">
          <strong>False-alert check (reference period, in-sample):</strong> volume {check.volume.alert_days} alert days
          (highest sum {sum(check.volume.max_cusum)}), positivity {check.positivity.alert_days} alert days (highest sum{' '}
          {sum(check.positivity.max_cusum)}) over {check.volume.days} in-control days. Optimistic, because the period
          defines its own baseline.
        </p>
      ) : null}
      <p className="border-t border-hairline px-5 py-3 text-[11px] text-muted">
        "Earlier" means CUSUM reached h before the other method's level; EWMA is compared metric with metric.
      </p>
    </Card>
  );
}

export type CusumRecalc =
  | { status: 'idle' | 'running' | 'unavailable' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

export default function CusumSurveillance({
  summary,
  history,
  day,
  selectedDate,
  recalc,
  onRecalculate,
}: {
  summary: CusumSummary;
  history: CusumPoint[];
  /** undefined while loading; null when there is no result for the date. */
  day: CusumDay | null | undefined;
  selectedDate: string;
  recalc: CusumRecalc;
  onRecalculate: (() => void) | null;
}) {
  return (
    <section aria-labelledby="cusum-surveillance" className="space-y-4">
      <div className="ls-card border-l-4 border-l-[#7C3AED] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6D28D9]">Experimental statistical detector · CUSUM</p>
            <h2 id="cusum-surveillance" className="text-lg font-semibold text-ink">CUSUM Surveillance</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              A one-sided upper CUSUM (cumulative sum) for test volume and positivity. Each day's standardized excess over
              the historical mean, less a reference value k, is added to a running sum that never falls below zero; a
              statistical alert is raised when the sum reaches the decision limit h. It uses the same historical reference
              period as EWMA. A statistical alert is not a confirmed outbreak.
            </p>
          </div>
          {onRecalculate ? (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <button type="button" className="ls-btn" disabled={recalc.status === 'running'} onClick={onRecalculate}>
                {recalc.status === 'running' ? 'Recalculating…' : 'Recalculate CUSUM'}
              </button>
              <p role="status" aria-live="polite" className="max-w-xs text-xs text-muted sm:text-right">
                {recalc.status === 'done' || recalc.status === 'error'
                  ? recalc.message
                  : recalc.status === 'unavailable'
                    ? 'Recalculation is available only when the backend runs in development.'
                    : 'Development only: recomputes CUSUM from the stored observations.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {day === undefined ? (
        <p role="status" className="ls-card px-5 py-4 text-sm text-muted">Loading the CUSUM results…</p>
      ) : day === null ? (
        <p className="ls-card px-5 py-4 text-sm text-muted">No CUSUM result for {formatSurveillanceDate(selectedDate)}.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <CusumPanel metric="volume" point={day.volume} />
          <CusumPanel metric="positivity" point={day.positivity} />
        </div>
      )}

      <Card title="CUSUM trend" subtitle="The cumulative sum against the decision limit h." bodyClassName="p-4">
        <CusumTrendChart history={history} selectedDate={selectedDate} approachingFraction={summary.config.approaching_fraction} />
      </Card>

      <CusumTiming summary={summary} />

      <p className="text-[11px] leading-relaxed text-muted">
        {CUSUM_DISCLAIMER} {APPROACHING_NOTE} Formula: {summary.formula.z}; {summary.formula.cusum}; {summary.formula.decision}.
        Daily positivity rates have different denominators, and this CUSUM does not yet model binomial variance by daily test
        count.
      </p>
    </section>
  );
}
