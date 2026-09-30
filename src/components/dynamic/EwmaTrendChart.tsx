import { useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EwmaMetric, EwmaPoint } from '../../data-access/ewma';
import { formatSurveillanceDate } from '../../lib/dynamicSurveillance';
import { STATE_LABEL, metricValue } from '../../lib/ewma';

const OBSERVED = '#64748B';
const EWMA = '#2563EB';
const UCL = '#DC2626';
const MEAN = '#0F766E';
const AXIS = '#64748B';
const GRID = '#DCE6F1';

/** The monitored days (with data) of one metric, oldest first. */
export const monitored = (history: EwmaPoint[], metric: EwmaMetric): EwmaPoint[] =>
  history.filter((p) => p.metric === metric && p.calculation_status === 'CALCULATED');

const shortDate = (iso: string) => formatSurveillanceDate(iso).replace(/^\w+, /, '').replace(/, \d{4}$/, '');

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload?: EwmaPoint }[] }) {
  const point = active && payload?.[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-hairline bg-white px-3 py-2 text-xs shadow-panel">
      <p className="font-semibold text-ink">{formatSurveillanceDate(point.signal_date)}</p>
      <p className="text-muted">Observed: {metricValue(point.metric, point.observed_value)}</p>
      <p className="text-muted">EWMA: {metricValue(point.metric, point.ewma_value, 2)}</p>
      <p className="text-muted">Upper control limit: {metricValue(point.metric, point.upper_control_limit, 2)}</p>
      <p className="font-medium text-ink">{point.alert_state ? STATE_LABEL[point.alert_state] : '—'}</p>
    </div>
  );
}

/** A small EWMA-against-UCL line for a metric panel. Decorative: the panel states the values. */
export function EwmaSparkline({ points }: { points: EwmaPoint[] }) {
  if (points.length < 2) return null;
  return (
    <div className="h-12 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={['auto', 'auto']} />
          <Line type="monotone" dataKey="ewma_value" stroke={EWMA} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="upper_control_limit" stroke={UCL} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Daily values, the EWMA, the historical mean and the upper control limit,
 * one metric at a time. A text table carries the same numbers for screen
 * readers.
 */
export default function EwmaTrendChart({ history, selectedDate }: { history: EwmaPoint[]; selectedDate: string | null }) {
  const [metric, setMetric] = useState<EwmaMetric>('positivity');
  const points = monitored(history, metric);
  const mean = points[0]?.baseline_mean ?? null;
  const label = metric === 'positivity' ? 'Positivity (%)' : 'Tests a day';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Metric shown" className="inline-flex rounded-lg border border-hairline p-0.5">
          {(['volume', 'positivity'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={metric === item}
              onClick={() => setMetric(item)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${metric === item ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}
            >
              {item === 'volume' ? 'Test Volume' : 'Positivity'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted">Monitored days only (after the reference period).</p>
      </div>

      {points.length === 0 ? (
        <p className="py-6 text-sm text-muted">No monitored days yet.</p>
      ) : (
        <>
          <div className="mt-3 h-64 w-full" role="img" aria-label={`${label}: daily values, EWMA and upper control limit`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="signal_date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: AXIS }} minTickGap={16} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} width={40} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {mean !== null ? (
                  <ReferenceLine y={mean} stroke={MEAN} strokeDasharray="2 4" label={{ value: 'Historical mean', fontSize: 10, fill: MEAN, position: 'insideBottomLeft' }} />
                ) : null}
                {selectedDate ? <ReferenceLine x={selectedDate} stroke="#94A3B8" /> : null}
                <Line name="Observed" type="monotone" dataKey="observed_value" stroke={OBSERVED} strokeWidth={1} dot={{ r: 2 }} isAnimationActive={false} />
                <Line name="EWMA" type="monotone" dataKey="ewma_value" stroke={EWMA} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line name="Upper control limit" type="stepAfter" dataKey="upper_control_limit" stroke={UCL} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{label}: observed value, EWMA, upper control limit and state per monitored day</caption>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Observed</th><th scope="col">EWMA</th><th scope="col">UCL</th><th scope="col">State</th></tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.id}>
                  <td>{p.signal_date}</td>
                  <td>{metricValue(metric, p.observed_value)}</td>
                  <td>{metricValue(metric, p.ewma_value, 2)}</td>
                  <td>{metricValue(metric, p.upper_control_limit, 2)}</td>
                  <td>{p.alert_state ? STATE_LABEL[p.alert_state] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
