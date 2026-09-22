import type { ConfidenceLevel, DataConfidenceResult } from '../../types';
import { CONFIDENCE_DISCLAIMER, formatMinutesAgo } from '../../lib/dataConfidence';

/**
 * Data Confidence — how trustworthy the data is.
 *
 * Deliberately styled differently from the outbreak severity palette so it is
 * never mistaken for the Composite Outbreak Signal Score. Confidence uses a
 * neutral slate/teal treatment; severity keeps the red-amber-green scale.
 */
const LEVEL_STYLES: Record<
  ConfidenceLevel,
  { badge: string; bar: string; text: string }
> = {
  'Very High': {
    badge: 'bg-[#0F766E]/10 text-[#0F766E] ring-1 ring-inset ring-[#0F766E]/25',
    bar: 'bg-[#0F766E]',
    text: 'text-[#0F766E]',
  },
  High: {
    badge: 'bg-[#0369A1]/10 text-[#0369A1] ring-1 ring-inset ring-[#0369A1]/25',
    bar: 'bg-[#0369A1]',
    text: 'text-[#0369A1]',
  },
  Moderate: {
    badge: 'bg-[#B45309]/10 text-[#B45309] ring-1 ring-inset ring-[#B45309]/25',
    bar: 'bg-[#B45309]',
    text: 'text-[#B45309]',
  },
  Low: {
    badge: 'bg-[#B91C1C]/10 text-[#B91C1C] ring-1 ring-inset ring-[#B91C1C]/25',
    bar: 'bg-[#B91C1C]',
    text: 'text-[#B91C1C]',
  },
};

interface DataConfidenceCardProps {
  confidence: DataConfidenceResult;
  /** Compact hides the component breakdown. */
  compact?: boolean;
  className?: string;
}

export default function DataConfidenceCard({
  confidence,
  compact = false,
  className = '',
}: DataConfidenceCardProps) {
  const styles = LEVEL_STYLES[confidence.level];

  const facts = [
    `${confidence.facilitiesReporting} / ${confidence.facilitiesTotal} facilities reporting`,
    `${confidence.terminologyMappedPercent.toFixed(0)}% terminology mapped`,
    confidence.freshestMinutes < 0
      ? 'No events received'
      : `Last event received ${formatMinutesAgo(confidence.freshestMinutes)}`,
    confidence.totalIssues === 0
      ? 'No major integrity issues'
      : `${confidence.totalIssues} failed or duplicate ${
          confidence.totalIssues === 1 ? 'event' : 'events'
        }`,
  ];

  return (
    <section
      className={`ls-card p-5 ${className}`}
      aria-label="Data confidence"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ls-label">Data Confidence</p>
          <p className="mt-2 text-3xl font-semibold leading-none tabular-nums text-ink">
            {confidence.score}
            <span className="text-lg font-medium text-muted"> / 100</span>
          </p>
        </div>
        <span
          className={`mt-1 inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${styles.badge}`}
        >
          {confidence.level}
        </span>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-hairline"
        role="img"
        aria-label={`Data confidence ${confidence.score} of 100, ${confidence.level}`}
      >
        <span
          className={`block h-full rounded-full transition-all duration-500 ${styles.bar}`}
          style={{ width: `${Math.max(confidence.score, 2)}%` }}
        />
      </div>

      <ul className="mt-3 space-y-1">
        {facts.map((fact) => (
          <li key={fact} className="text-xs text-muted">
            {fact}
          </li>
        ))}
      </ul>

      {!compact ? (
        <>
          <p className="mt-3 text-xs leading-relaxed text-ink">{confidence.explanation}</p>

          <details className="mt-3 rounded-lg bg-canvas p-3">
            <summary className="cursor-pointer text-xs font-medium text-brand">
              How this score was calculated
            </summary>
            <table className="mt-3 w-full border-collapse text-xs">
              <caption className="sr-only">
                Weighted contribution of each data confidence component
              </caption>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="pb-1.5 text-left font-semibold text-muted">
                    Component
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-semibold text-muted">
                    Points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {confidence.components.map((component) => (
                  <tr key={component.key}>
                    <td className="py-1.5 pr-2 text-ink">
                      <span className="block font-medium">{component.label}</span>
                      <span className="block text-[11px] text-muted">
                        {component.evidence}
                      </span>
                    </td>
                    <td className="py-1.5 text-right align-top tabular-nums text-ink">
                      {component.points} / {component.maxPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/20">
                  <td className="pt-2 font-semibold text-ink">TOTAL</td>
                  <td className="pt-2 text-right font-semibold tabular-nums text-ink">
                    {confidence.score} / 100
                  </td>
                </tr>
              </tfoot>
            </table>
          </details>
        </>
      ) : null}

      <p className="mt-3 text-[11px] leading-snug text-muted">
        {CONFIDENCE_DISCLAIMER} It describes data quality only — it is separate from the
        Composite Outbreak Signal Score.
      </p>
    </section>
  );
}
