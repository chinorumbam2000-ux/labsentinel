import { useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CusumPoint } from '../../data-access/cusum';
import type { EwmaMetric } from '../../data-access/ewma';
import { formatSurveillanceDate } from '../../lib/dynamicSurveillance';
import { CUSUM_STATE_LABEL, sum } from '../../lib/cusum';

const CUSUM = '#7C3AED';
const LIMIT = '#DC2626';
const AXIS = '#64748B';
const GRID = '#DCE6F1';

export const monitoredCusum = (history: CusumPoint[], metric: EwmaMetric): CusumPoint[] =>
  history.filter((p) => p.metric === metric && p.calculation_status === 'CALCULATED');

const shortDate = (iso: string) => formatSurveillanceDate(iso).replace(/^\w+, /, '').replace(/, \d{4}$/, '');

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload?: CusumPoint }[] }) {
  const point = active && payload?.[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-hairline bg-white px-3 py-2 text-xs shadow-panel">
      <p className="font-semibold text-ink">{formatSurveillanceDate(point.signal_date)}</p>
      <p className="text-muted">Standardized deviation: {sum(point.z_score)}</p>
      <p className="text-muted">CUSUM: {sum(point.previous_cusum)} → {sum(point.cusum_value)}</p>
      <p className="text-muted">Decision limit h: {sum(point.h, 1)}</p>
      <p className="font-medium text-ink">
        {point.alert_state ? CUSUM_STATE_LABEL[point.alert_state] : '—'}
        {point.approaching_limit ? ' (approaching the limit, informational)' : ''}
      </p>
    </div>
  );
}

/**
 * The cumulative sum against the decision limit h, one metric at a time. The
 * shaded band (75-100% of h) is informational only. A text table carries the
 * same numbers for screen readers. No patient-level data.
 */
export default function CusumTrendChart({
  history,
  selectedDate,
  approachingFraction,
}: {
  history: CusumPoint[];
  selectedDate: string | null;
  approachingFraction: number;
}) {
  const [metric, setMetric] = useState<EwmaMetric>('positivity');
  const points = monitoredCusum(history, metric);
  const h = points[0]?.h ?? null;
  const label = metric === 'positivity' ? 'Positivity CUSUM' : 'Test Volume CUSUM';
  const top = Math.max(h ?? 0, ...points.map((p) => p.cusum_value ?? 0)) * 1.1 || 1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="CUSUM metric shown" className="inline-flex rounded-lg border border-hairline p-0.5">
          {(['volume', 'positivity'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={metric === item}
              onClick={() => setMetric(item)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${metric === item ? 'bg-[#7C3AED] text-white' : 'text-muted hover:text-ink'}`}
            >
              {item === 'volume' ? 'Volume CUSUM' : 'Positivity CUSUM'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted">Shaded: approaching the limit (informational, not an alarm).</p>
      </div>

      {points.length === 0 || h === null ? (
        <p className="py-6 text-sm text-muted">No monitored days yet.</p>
      ) : (
        <>
          <div className="mt-3 h-60 w-full" role="img" aria-label={`${label}: cumulative sum against the decision limit h = ${h}`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="signal_date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: AXIS }} minTickGap={16} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} width={36} domain={[0, Math.ceil(top)]} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceArea y1={h * approachingFraction} y2={h} fill="#F59E0B" fillOpacity={0.12} />
                <ReferenceLine y={h} stroke={LIMIT} strokeDasharray="5 4" label={{ value: `Decision limit h = ${h}`, fontSize: 10, fill: LIMIT, position: 'insideTopLeft' }} />
                {selectedDate ? <ReferenceLine x={selectedDate} stroke="#94A3B8" /> : null}
                <Line name="CUSUM" type="linear" dataKey="cusum_value" stroke={CUSUM} strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* sr-only on a wrapper: a table ignores the 1px width and would stretch the scroller. */}
          <div className="sr-only">
            <table>
              <caption>{label}: cumulative sum and decision limit per monitored day</caption>
              <thead>
                <tr><th scope="col">Date</th><th scope="col">Standardized deviation</th><th scope="col">CUSUM</th><th scope="col">Decision limit</th><th scope="col">State</th></tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.id}>
                    <td>{p.signal_date}</td>
                    <td>{sum(p.z_score)}</td>
                    <td>{sum(p.cusum_value)}</td>
                    <td>{sum(p.h, 1)}</td>
                    <td>{p.alert_state ? CUSUM_STATE_LABEL[p.alert_state] : '—'}{p.approaching_limit ? ' (approaching)' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
