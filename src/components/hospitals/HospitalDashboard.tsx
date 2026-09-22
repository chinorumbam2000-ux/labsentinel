import {
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
import type { HospitalMetrics } from '../../types';
import { formatClockTime, formatDateTime } from '../../lib/format';
import SeverityBadge from '../signals/SeverityBadge';
import { EmptyState } from '../common/States';

const VOLUME_COLOR = '#2563EB';
const POSITIVITY_COLOR = '#DC2626';
const AXIS_COLOR = '#64748B';
const GRID_COLOR = '#DCE6F1';

interface HospitalDashboardProps {
  metrics: HospitalMetrics;
  lastUpdated: Date;
  currentDay: number;
}

const axisProps = {
  tick: { fill: AXIS_COLOR, fontSize: 11 },
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

export default function HospitalDashboard({
  metrics,
  lastUpdated,
  currentDay,
}: HospitalDashboardProps) {
  const stats = [
    {
      label: `Tests — Day ${currentDay}`,
      value: metrics.totalTests.toLocaleString('en-US'),
      note: `${metrics.cumulativeTests.toLocaleString('en-US')} cumulative through Day ${currentDay}`,
    },
    {
      label: `Positivity — Day ${currentDay}`,
      value: `${metrics.positivityRate.toFixed(1)}%`,
      note: `${metrics.positiveTests} of ${metrics.totalTests} tests positive`,
    },
    {
      // Never reveals a day the simulation has not reached yet.
      label: 'First Signal',
      value: metrics.firstSignalDay ? `Day ${metrics.firstSignalDay}` : 'Not yet detected',
      note: metrics.firstSignalDay
        ? metrics.isAffected
          ? 'Currently contributing'
          : 'Not contributing on this day'
        : 'No signal through the current day',
    },
    {
      label: 'Last Sync',
      value: formatClockTime(lastUpdated),
      note: 'Session clock (real time)',
    },
  ];

  const volumeData = metrics.volumeSeries.map((point) => ({
    ...point,
    dayLabel: `Day ${point.day}`,
  }));
  const positivityData = metrics.positivitySeries.map((point) => ({
    ...point,
    dayLabel: `Day ${point.day}`,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="ls-card p-4">
            <p className="ls-label">{stat.label}</p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-ink">
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] text-muted">{stat.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="ls-card">
          <header className="ls-card-header">
            <h2 className="ls-card-title">Test Volume</h2>
            <span className="ls-label">Day 1 → current</span>
          </header>
          <div className="h-[200px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dayLabel" {...axisProps} />
                <YAxis {...axisProps} axisLine={false} width={40} />
                <Tooltip {...tooltipStyles} formatter={(value: number) => [value, 'Tests']} />
                <Bar
                  dataKey="tests"
                  fill={VOLUME_COLOR}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="ls-card">
          <header className="ls-card-header">
            <h2 className="ls-card-title">Positivity Rate</h2>
            <span className="ls-label">Day 1 → current</span>
          </header>
          <div className="h-[200px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={positivityData}
                margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
              >
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dayLabel" {...axisProps} />
                <YAxis
                  {...axisProps}
                  axisLine={false}
                  width={44}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <Tooltip
                  {...tooltipStyles}
                  formatter={(value: number) => [`${value}%`, 'Positivity']}
                />
                <Line
                  type="monotone"
                  dataKey="positivity"
                  stroke={POSITIVITY_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: POSITIVITY_COLOR, stroke: '#FFFFFF', strokeWidth: 2 }}
                  activeDot={{ r: 5.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="ls-card">
        <header className="ls-card-header">
          <h2 className="ls-card-title">Recent Observations — Day {currentDay}</h2>
          <div className="flex items-center gap-2">
            <span className="ls-label">
              {metrics.dayObservations.length} on this day ·{' '}
              {metrics.observations.length} cumulative
            </span>
            <SeverityBadge severity={metrics.severity} />
          </div>
        </header>
        {metrics.dayObservations.length === 0 ? (
          <EmptyState
            icon="≡"
            title="No observations received yet"
            message="This facility has not delivered any synthetic laboratory observations for the current simulation day."
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-hairline bg-canvas">
                <tr>
                  <th scope="col" className="ls-th">Date/Time</th>
                  <th scope="col" className="ls-th">Patient ID</th>
                  <th scope="col" className="ls-th">Test</th>
                  <th scope="col" className="ls-th">LOINC</th>
                  <th scope="col" className="ls-th">Result</th>
                  <th scope="col" className="ls-th">FHIR Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {metrics.dayObservations.slice(0, 8).map((observation) => (
                  <tr key={observation.id} className="hover:bg-canvas">
                    <td className="ls-td text-muted">
                      {formatDateTime(observation.effectiveDateTime)}
                    </td>
                    <td className="ls-td font-mono text-xs">{observation.patientId}</td>
                    <td className="ls-td">{observation.testName}</td>
                    <td className="ls-td font-mono text-xs text-muted">
                      {observation.loincCode}
                    </td>
                    <td className="ls-td">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          observation.result === 'Positive'
                            ? 'bg-severity-critical/10 text-severity-critical ring-1 ring-inset ring-severity-critical/25'
                            : 'bg-severity-low/10 text-[#166534] ring-1 ring-inset ring-severity-low/20'
                        }`}
                      >
                        {observation.result}
                      </span>
                    </td>
                    <td className="ls-td text-muted">
                      {observation.fhirStatus} <span className="text-[#166534]">✓</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
