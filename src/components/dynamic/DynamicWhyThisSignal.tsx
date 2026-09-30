import type { DynamicSignal } from '../../data-access/dynamicSurveillance';
import { SEVERITY_STYLES } from '../../lib/format';
import {
  DYNAMIC_DISCLAIMER,
  DYNAMIC_LABEL,
  componentEvidence,
  explainDynamicSignal,
  formatSurveillanceDate,
} from '../../lib/dynamicSurveillance';
import { SIGNAL_DISCLAIMER } from '../../lib/signalScore';
import SeverityBadge from '../signals/SeverityBadge';

/**
 * "Why this dynamic signal?" — the same five questions and weighted table as
 * the classroom demonstration's panel, answered from the backend's dynamic
 * calculation: every value, baseline and contribution is the one it stored.
 */
export default function DynamicWhyThisSignal({ signal }: { signal: DynamicSignal }) {
  if (signal.composite_score === null || signal.severity === null || !signal.calculation.components) return null;
  const styles = SEVERITY_STYLES[signal.severity];
  const sections = explainDynamicSignal(signal);
  const components = signal.calculation.components;

  return (
    <section className={`ls-card overflow-hidden border ${styles.soft}`} aria-label="Why this dynamic signal">
      <span aria-hidden="true" className={`block h-1 w-full ${styles.accent}`} />
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Why this dynamic signal?</h2>
          <p className="mt-0.5 text-xs text-muted">
            {signal.syndrome} · {formatSurveillanceDate(signal.signal_date)} · {DYNAMIC_LABEL}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={signal.severity} />
          <span className="text-lg font-semibold tabular-nums text-ink">
            {signal.composite_score}
            <span className="text-sm font-medium text-muted">/100</span>
          </span>
        </div>
      </header>

      <dl className="divide-y divide-hairline">
        {sections.map((section) => (
          <div key={section.key} className="px-5 py-3.5">
            <dt className="ls-label">{section.heading}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink">{section.body}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-hairline px-5 py-3">
        <h3 className="text-xs font-semibold text-ink">Weighted calculation</h3>
        <div className="mt-2 w-full overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">
              Each component's current value, baseline, normalized score and weighted contribution
            </caption>
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className="pb-1.5 text-left font-semibold text-muted">
                  Component
                </th>
                <th scope="col" className="pb-1.5 text-right font-semibold text-muted">
                  Normalized
                </th>
                <th scope="col" className="pb-1.5 text-right font-semibold text-muted">
                  Contribution
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {components.map((item) => (
                <tr key={item.key}>
                  <td className="py-1.5 pr-2 text-ink">
                    <span className="block font-medium">
                      {item.label} <span className="font-normal text-muted">({Math.round(item.weight * 100)}%)</span>
                    </span>
                    <span className="block text-[11px] text-muted">{componentEvidence(item)}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right align-top tabular-nums text-ink">
                    {item.normalized.toFixed(1)}
                  </td>
                  <td className="py-1.5 text-right align-top tabular-nums text-ink">
                    {item.weighted.toFixed(1)} / {item.max_points}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/20">
                <td className="pt-2 font-semibold text-ink">Composite Outbreak Signal Score</td>
                <td className="pt-2 text-right text-muted tabular-nums">
                  {signal.calculation.composite?.unrounded.toFixed(2)}
                </td>
                <td className="pt-2 text-right font-semibold tabular-nums text-ink">
                  {signal.composite_score} / 100
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="border-t border-hairline px-5 py-3">
        <p className="text-xs font-semibold text-ink">{SIGNAL_DISCLAIMER}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{DYNAMIC_DISCLAIMER}</p>
      </div>
    </section>
  );
}
