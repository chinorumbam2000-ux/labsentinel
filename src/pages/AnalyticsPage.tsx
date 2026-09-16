import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSimulation } from '../context/SimulationContext';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../data/simulation';

const VOLUME_COLOR = '#2563EB';
const POSITIVITY_COLOR = '#DC2626';
const SCORE_COLOR = '#F97316';
const GEO_COLOR = '#0B1F33';
const AXIS_COLOR = '#64748B';
const GRID_COLOR = '#DCE6F1';

type TabKey = 'volume' | 'positivity' | 'score' | 'geography';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'volume', label: 'Test Volume' },
  { key: 'positivity', label: 'Positivity' },
  { key: 'score', label: 'Signal Score' },
  { key: 'geography', label: 'Geographic Spread' },
];

const axisProps = {
  tick: { fill: AXIS_COLOR, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: GRID_COLOR },
};

const tooltipStyles = {
  contentStyle: {
    borderRadius: 8,
    border: '1px solid #DCE6F1',
    fontSize: 12,
    boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.10)',
  },
  labelStyle: { color: '#0F172A', fontWeight: 600 },
};

export default function AnalyticsPage() {
  const { currentDay, trendSeries, isLoading, error, clearError } = useSimulation();
  const [tab, setTab] = useState<TabKey>('volume');

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  const config: Record<
    TabKey,
    { title: string; subtitle: string; unit: string; rows: Array<{ day: number; value: string }> }
  > = {
    volume: {
      title: 'Test Volume',
      subtitle: `Respiratory tests per day · baseline ${BASELINE_TEST_VOLUME}`,
      unit: 'tests',
      rows: trendSeries.map((point) => ({ day: point.day, value: String(point.tests) })),
    },
    positivity: {
      title: 'Positivity',
      subtitle: `Share of tests returning positive · baseline ${BASELINE_POSITIVITY_RATE.toFixed(1)}%`,
      unit: '%',
      rows: trendSeries.map((point) => ({
        day: point.day,
        value: `${point.positivity.toFixed(1)}%`,
      })),
    },
    score: {
      title: 'Signal Score',
      subtitle: 'Composite outbreak signal score, calculated from five weighted components',
      unit: '/ 100',
      rows: trendSeries.map((point) => ({ day: point.day, value: String(point.score) })),
    },
    geography: {
      title: 'Geographic Spread',
      subtitle: 'Number of synthetic surveillance areas affected',
      unit: 'areas',
      rows: trendSeries.map((point) => ({
        day: point.day,
        value: `${point.affectedZips} ${point.affectedZips === 1 ? 'area' : 'areas'}`,
      })),
    },
  };

  const active = config[tab];

  const renderChart = () => {
    if (trendSeries.length === 0) {
      return (
        <EmptyState
          icon="◫"
          title="No data to chart yet"
          message="Advance the simulation to build a trend series."
        />
      );
    }

    const common = {
      data: trendSeries,
      margin: { top: 8, right: 16, bottom: 4, left: -8 },
    };

    if (tab === 'volume') {
      return (
        <BarChart {...common}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="dayLabel" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} width={52} />
          <Tooltip {...tooltipStyles} formatter={(value: number) => [value, 'Tests']} />
          <Bar dataKey="tests" fill={VOLUME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={56} />
        </BarChart>
      );
    }

    if (tab === 'positivity') {
      return (
        <LineChart {...common}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="dayLabel" {...axisProps} />
          <YAxis
            {...axisProps}
            axisLine={false}
            width={52}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            {...tooltipStyles}
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Positivity']}
          />
          <Line
            type="monotone"
            dataKey="positivity"
            stroke={POSITIVITY_COLOR}
            strokeWidth={2}
            dot={{ r: 4, fill: POSITIVITY_COLOR, stroke: '#FFFFFF', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      );
    }

    if (tab === 'score') {
      return (
        <AreaChart {...common}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SCORE_COLOR} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SCORE_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="dayLabel" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} width={52} domain={[0, 100]} />
          <Tooltip {...tooltipStyles} formatter={(value: number) => [value, 'Score']} />
          <Area
            type="monotone"
            dataKey="score"
            stroke={SCORE_COLOR}
            strokeWidth={2}
            fill="url(#scoreFill)"
            dot={{ r: 4, fill: SCORE_COLOR, stroke: '#FFFFFF', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      );
    }

    return (
      <BarChart {...common}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="dayLabel" {...axisProps} />
        <YAxis
          {...axisProps}
          axisLine={false}
          width={52}
          allowDecimals={false}
          domain={[0, 3]}
        />
        <Tooltip
          {...tooltipStyles}
          formatter={(value: number) => [value, 'Surveillance areas']}
        />
        <Bar dataKey="affectedZips" fill={GEO_COLOR} radius={[4, 4, 0, 0]} maxBarSize={56} />
      </BarChart>
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Trends &amp; Analytics
          </h1>
          <p className="mt-1 text-sm text-muted">
            Progression from Day 1 through Day {currentDay} · synthetic aggregate data
          </p>
        </div>
        <PageMeta />
      </header>

      <div
        role="tablist"
        aria-label="Analytics views"
        className="flex flex-wrap gap-1.5 rounded-xl border border-hairline bg-white p-1.5 shadow-card"
      >
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === item.key
                ? 'bg-brand text-white'
                : 'text-muted hover:bg-canvas hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <LoadingState label="Rebuilding trend series…" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Card
            className="xl:col-span-2"
            title={active.title}
            subtitle={active.subtitle}
            bodyClassName="p-4"
          >
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Values" subtitle={`Day 1 → Day ${currentDay}`} bodyClassName="p-0">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[280px] border-collapse">
                <thead className="border-b border-hairline bg-canvas">
                  <tr>
                    <th scope="col" className="ls-th">Day</th>
                    <th scope="col" className="ls-th">Stage</th>
                    <th scope="col" className="ls-th text-right">
                      {active.title}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {active.rows.map((row, index) => (
                    <tr key={row.day} className="hover:bg-canvas">
                      <td className="ls-td font-medium">Day {row.day}</td>
                      <td className="ls-td text-xs text-muted">
                        {trendSeries[index]?.stage}
                      </td>
                      <td className="ls-td text-right font-semibold tabular-nums">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-hairline px-4 py-3 text-[11px] leading-snug text-muted">
              Values beyond the current simulation day are withheld until the day is
              reached.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
