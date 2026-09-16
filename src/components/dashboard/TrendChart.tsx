import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '../../lib/analytics';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../../data/simulation';

const VOLUME_COLOR = '#2563EB';
const POSITIVITY_COLOR = '#DC2626';
const AXIS_COLOR = '#64748B';
const GRID_COLOR = '#DCE6F1';

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | string;
  payload?: TrendPoint;
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-hairline bg-white px-3 py-2 shadow-panel">
      <p className="text-xs font-semibold text-ink">
        Day {point.day} — {point.stage}
      </p>
      <dl className="mt-1.5 space-y-1 text-xs">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-1.5 text-muted">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: VOLUME_COLOR }}
            />
            Test volume
          </dt>
          <dd className="font-semibold tabular-nums text-ink">{point.tests}</dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-1.5 text-muted">
            <span
              aria-hidden="true"
              className="h-0.5 w-2.5 rounded-full"
              style={{ backgroundColor: POSITIVITY_COLOR }}
            />
            Positivity
          </dt>
          <dd className="font-semibold tabular-nums text-ink">
            {point.positivity.toFixed(1)}%
          </dd>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-hairline pt-1">
          <dt className="text-muted">Signal score</dt>
          <dd className="font-semibold tabular-nums text-ink">{point.score}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Blue bars = test volume, red line = positivity. Two measures on different
 * scales share one plot, as specified by the blueprint, so both axes are
 * explicitly labelled and colour-keyed to their series.
 */
export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const maxTests = Math.max(BASELINE_TEST_VOLUME, ...data.map((point) => point.tests));
  const maxPositivity = Math.max(
    BASELINE_POSITIVITY_RATE,
    ...data.map((point) => point.positivity),
  );

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="dayLabel"
            tick={{ fill: AXIS_COLOR, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
          />
          <YAxis
            yAxisId="volume"
            tick={{ fill: VOLUME_COLOR, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[0, Math.ceil((maxTests * 1.15) / 20) * 20]}
            label={{
              value: 'Tests',
              angle: -90,
              position: 'insideLeft',
              offset: 12,
              style: { fill: VOLUME_COLOR, fontSize: 11, fontWeight: 600 },
            }}
          />
          <YAxis
            yAxisId="positivity"
            orientation="right"
            tick={{ fill: POSITIVITY_COLOR, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[0, Math.ceil((maxPositivity * 1.35) / 5) * 5]}
            tickFormatter={(value: number) => `${value}%`}
            label={{
              value: 'Positivity',
              angle: 90,
              position: 'insideRight',
              offset: 12,
              style: { fill: POSITIVITY_COLOR, fontSize: 11, fontWeight: 600 },
            }}
          />
          <Tooltip
            content={<TrendTooltip />}
            cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }}
          />
          <Bar
            yAxisId="volume"
            dataKey="tests"
            name="Test volume"
            fill={VOLUME_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
          />
          <Line
            yAxisId="positivity"
            type="monotone"
            dataKey="positivity"
            name="Positivity rate"
            stroke={POSITIVITY_COLOR}
            strokeWidth={2}
            dot={{ r: 4, fill: POSITIVITY_COLOR, strokeWidth: 2, stroke: '#FFFFFF' }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
