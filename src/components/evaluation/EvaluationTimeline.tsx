import {
  Bar,
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
import type { Detector, ScenarioSummary, TimelineDay } from '../../data-access/evaluation';
import { DETECTORS, DETECTOR_NAME, alertOn, cellState, shortDate, value } from '../../lib/evaluation';

const AXIS = '#64748B';
const GRID = '#DCE6F1';
const MARKER: Record<Detector, string> = { composite: '#0F766E', ewma: '#2563EB', cusum: '#7C3AED' };

const CELL: Record<string, string> = {
  Alert: 'bg-[#DC2626]',
  High: 'bg-[#DC2626]',
  Critical: 'bg-[#991B1B]',
  Moderate: 'bg-[#F97316]',
  Watch: 'bg-[#FACC15]',
  Low: 'bg-[#CBD5E1]',
  Normal: 'bg-[#CBD5E1]',
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload?: TimelineDay }[] }) {
  const day = active && payload?.[0]?.payload;
  if (!day) return null;
  return (
    <div className="rounded-lg border border-hairline bg-white px-3 py-2 text-xs shadow-panel">
      <p className="font-semibold text-ink">
        {day.date} · {day.truth === 'outbreak' ? 'true outbreak day' : 'normal day'}
      </p>
      <p className="text-muted">Tests: {day.volume} · Positivity: {value(day.positivity, 2)}%</p>
      <p className="text-muted">
        Composite: {day.composite_severity ?? 'not scored'} ({value(day.composite_score, 1)}) · Data Confidence{' '}
        {value(day.data_confidence, 1)}
      </p>
      <p className="text-muted">
        EWMA: {cellState(day, 'ewma')} · CUSUM: {cellState(day, 'cusum')}
      </p>
    </div>
  );
}

/**
 * One representative realization (repetition 0) of a scenario: daily test
 * volume and positivity, the true outbreak window (shaded), each detector's
 * daily state and its first detection (vertical markers). A text table carries
 * the same information for screen readers.
 */
export default function EvaluationTimeline({ scenario }: { scenario: ScenarioSummary }) {
  const representative = scenario.representative;
  if (!representative) return <p className="py-6 text-sm text-muted">No representative run recorded.</p>;
  const days = representative.timeline;
  const truth = scenario.ground_truth;
  const detections = representative.detections;
  const asOf = representative.as_of_detection ?? {};
  const outbreakDays = days.filter((d) => d.truth === 'outbreak');

  return (
    <div className="space-y-3">
      <div
        className="h-64 w-full"
        role="img"
        aria-label={`${scenario.name}: daily tests and positivity for repetition ${representative.repetition}, with the true outbreak window and detection markers`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: AXIS }} minTickGap={16} />
            <YAxis yAxisId="volume" tick={{ fontSize: 11, fill: AXIS }} width={36} />
            <YAxis yAxisId="positivity" orientation="right" tick={{ fontSize: 11, fill: AXIS }} width={36} unit="%" />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {outbreakDays.length > 0 ? (
              <ReferenceArea
                yAxisId="volume"
                x1={outbreakDays[0].date}
                x2={outbreakDays[outbreakDays.length - 1].date}
                fill="#DC2626"
                fillOpacity={0.07}
                label={{ value: 'True outbreak', fontSize: 10, fill: '#991B1B', position: 'insideTopLeft' }}
              />
            ) : null}
            {DETECTORS.map((d) =>
              detections[d] ? (
                <ReferenceLine
                  key={d}
                  yAxisId="volume"
                  x={detections[d] as string}
                  stroke={MARKER[d]}
                  strokeDasharray="4 3"
                  strokeWidth={2}
                />
              ) : null,
            )}
            <Bar yAxisId="volume" name="Tests" dataKey="volume" fill="#94A3B8" fillOpacity={0.55} isAnimationActive={false} />
            <Line
              yAxisId="positivity"
              name="Positivity (%)"
              type="linear"
              dataKey="positivity"
              stroke="#0F172A"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="First detection of the true outbreak">
        {DETECTORS.map((d) => (
          <li key={d} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-0 border-l-2 border-dashed" style={{ borderColor: MARKER[d] }} />
            <span className="font-medium text-ink">{DETECTOR_NAME[d]}</span>{' '}
            {detections[d] ?? (truth.outbreak_present ? 'did not detect' : 'no outbreak to detect')}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto" aria-hidden="true">
        <div className="min-w-[640px] space-y-1">
          {(['truth', ...DETECTORS] as const).map((row) => (
            <div key={row} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-right text-[11px] font-medium text-muted">
                {row === 'truth' ? 'Truth' : DETECTOR_NAME[row]}
              </span>
              <div className="flex flex-1 gap-px">
                {days.map((d) => {
                  const state = row === 'truth' ? (d.truth === 'outbreak' ? 'Alert' : 'Normal') : cellState(d, row);
                  const first = row !== 'truth' && detections[row] === d.date;
                  return (
                    <span
                      key={d.date}
                      title={`${d.date}: ${state}`}
                      className={`h-4 flex-1 rounded-[2px] ${CELL[state] ?? 'bg-[#F1F5F9]'} ${first ? 'ring-2 ring-ink ring-offset-1' : ''}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted">
        Strip colours: grey Low/Normal, yellow Watch, orange Moderate, red High/Critical/Alert (for Truth: red = true outbreak
        day). A ringed cell is the method&apos;s first detection of the true outbreak (with delayed data, the date it was
        seen in real time); red cells on normal days are false alerts. Repetition {representative.repetition} of {scenario.realizations}
        {truth.outbreak_present ? `; true onset ${truth.true_outbreak_start}` : '; no outbreak in this scenario'}.
      </p>
      {Object.keys(asOf).length > 0 ? (
        <p className="text-xs text-muted">
          Real-time (as-of) detection with delayed results in this run:{' '}
          {DETECTORS.map((d) => `${DETECTOR_NAME[d]} ${asOf[d] ?? 'not detected'}`).join(' · ')}. The chart and strip show
          the retrospective states, after every delayed result arrived.
        </p>
      ) : null}

      <table className="sr-only">
        <caption>{scenario.name}: daily values and detector states for one representative run</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Truth</th>
            <th scope="col">Tests</th>
            <th scope="col">Positivity</th>
            <th scope="col">Composite</th>
            <th scope="col">EWMA</th>
            <th scope="col">CUSUM</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.truth}</td>
              <td>{d.volume}</td>
              <td>{value(d.positivity, 2)}</td>
              {DETECTORS.map((det) => (
                <td key={det}>
                  {cellState(d, det)}
                  {alertOn(d, det) ? ' (detection)' : ''}
                  {detections[det] === d.date ? ' — first detection' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
