import type { ChangeDirection, DayOverDayComparison } from '../../types';

const DIRECTION_STYLES: Record<ChangeDirection, string> = {
  up: 'text-severity-critical',
  down: 'text-[#166534]',
  none: 'text-muted',
};

const DIRECTION_GLYPH: Record<ChangeDirection, string> = {
  up: '↑',
  down: '↓',
  none: '→',
};

interface DayOverDayChangeProps {
  comparison: DayOverDayComparison;
  className?: string;
}

/**
 * What changed between the previous simulation day and this one, and why the
 * Composite Outbreak Signal Score moved. Reads the existing scorer — it never
 * recalculates the score itself.
 */
export default function DayOverDayChange({
  comparison,
  className = '',
}: DayOverDayChangeProps) {
  if (!comparison.available) {
    return (
      <section className={`ls-card ${className}`} aria-label="Day-to-day change">
        <header className="ls-card-header">
          <h2 className="ls-card-title">Change since previous day</h2>
        </header>
        <div className="px-5 py-6 text-center">
          <p className="text-sm font-medium text-ink">
            Baseline — no previous surveillance day available.
          </p>
          <p className="mt-1.5 text-xs text-muted">
            Day 1 establishes the baseline that later days are compared against.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`ls-card ${className}`} aria-label="Day-to-day change">
      <header className="ls-card-header">
        <h2 className="ls-card-title">
          Change: Day {comparison.previousDay} → Day {comparison.currentDay}
        </h2>
        <span
          className={`text-sm font-semibold tabular-nums ${
            DIRECTION_STYLES[
              comparison.scoreDelta > 0 ? 'up' : comparison.scoreDelta < 0 ? 'down' : 'none'
            ]
          }`}
        >
          Score {comparison.scoreDelta > 0 ? '+' : ''}
          {comparison.scoreDelta}
        </span>
      </header>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <caption className="sr-only">
            Comparison of simulation day {comparison.previousDay} with day{' '}
            {comparison.currentDay}
          </caption>
          <thead className="border-b border-hairline bg-canvas">
            <tr>
              <th scope="col" className="ls-th">Metric</th>
              <th scope="col" className="ls-th text-right">
                Day {comparison.previousDay}
              </th>
              <th scope="col" className="ls-th text-right">
                Day {comparison.currentDay}
              </th>
              <th scope="col" className="ls-th text-right">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {comparison.metrics.map((metric) => (
              <tr key={metric.label} className="hover:bg-canvas">
                <td className="ls-td">{metric.label}</td>
                <td className="ls-td text-right tabular-nums text-muted">
                  {metric.previous}
                </td>
                <td className="ls-td text-right font-semibold tabular-nums">
                  {metric.current}
                </td>
                <td
                  className={`ls-td text-right font-medium ${DIRECTION_STYLES[metric.direction]}`}
                >
                  <span aria-hidden="true">{DIRECTION_GLYPH[metric.direction]}</span>{' '}
                  {metric.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-hairline bg-canvas px-5 py-3.5">
        <p className="ls-label">Why the score moved</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">{comparison.explanation}</p>
      </div>
    </section>
  );
}
