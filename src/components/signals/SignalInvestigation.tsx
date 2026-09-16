import type { SignalScoreResult, SimulationScenario } from '../../types';
import { SCORE_DISCLAIMER, SIGNAL_DISCLAIMER } from '../../lib/signalScore';
import { SEVERITY_STYLES } from '../../lib/format';
import SeverityBadge from './SeverityBadge';

interface SignalInvestigationProps {
  scenario: SimulationScenario;
  score: SignalScoreResult;
  onBack: () => void;
}

/**
 * Explains the five components that produced the composite score, with the
 * weighted contribution of each. Nothing here is hard-coded — every number is
 * read from the calculated score result.
 */
export default function SignalInvestigation({
  scenario,
  score,
  onBack,
}: SignalInvestigationProps) {
  const styles = SEVERITY_STYLES[score.severity];
  const totalPoints = score.components.reduce(
    (sum, component) => sum + component.points,
    0,
  );

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="ls-btn px-3 py-1.5 text-xs">
        ← Back to all signals
      </button>

      <div className={`ls-card overflow-hidden border ${styles.soft}`}>
        <span aria-hidden="true" className={`block h-1 w-full ${styles.accent}`} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="ls-label">Signal</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              Respiratory Viral Syndrome
            </h2>
            <p className="mt-1 text-sm text-muted">
              Worcester County, MA · Simulation Day {scenario.day} · {scenario.stage}
            </p>
          </div>
          <div className="text-right">
            <p className="ls-label">Severity</p>
            <div className="mt-1 flex items-center justify-end gap-2">
              <SeverityBadge severity={score.severity} size="md" />
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {score.composite}
                <span className="text-base font-medium text-muted">/100</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section className="ls-card xl:col-span-3">
          <header className="ls-card-header">
            <h3 className="ls-card-title">Why did LabSentinel trigger this?</h3>
          </header>
          <ul className="divide-y divide-hairline">
            {score.components.map((component) => (
              <li key={component.key} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{component.label}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink">
                    {component.points}
                    <span className="text-muted"> / {component.maxPoints}</span>
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted">{component.evidence}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
                    <span
                      className="block h-full rounded-full bg-brand transition-all duration-500"
                      style={{ width: `${Math.max(component.score, 0)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-muted">
                    {component.score.toFixed(0)}/100 × {Math.round(component.weight * 100)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="ls-card xl:col-span-2">
          <header className="ls-card-header">
            <h3 className="ls-card-title">Composite score</h3>
            <span className="ls-label">Weighted contributions</span>
          </header>
          <div className="p-5">
            <table className="w-full border-collapse font-mono text-sm">
              <caption className="sr-only">
                Weighted contribution of each component to the composite outbreak
                signal score
              </caption>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Component
                  </th>
                  <th scope="col" className="pb-2 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {score.components.map((component) => (
                  <tr key={component.key}>
                    <td className="py-2.5 text-ink">{component.label}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink">
                      {String(component.points).padStart(2, ' ')} / {component.maxPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/20">
                  <td className="pt-3 text-sm font-semibold text-ink">TOTAL</td>
                  <td className="pt-3 text-right text-sm font-semibold tabular-nums text-ink">
                    {score.composite} / 100
                  </td>
                </tr>
              </tfoot>
            </table>

            {totalPoints !== score.composite ? (
              <p className="mt-3 text-[11px] leading-snug text-muted">
                Component points are rounded for display, so they may differ from the
                composite total by one point. The composite is calculated from the
                unrounded weighted sum.
              </p>
            ) : null}

            <div className="mt-5 rounded-lg bg-canvas p-3">
              <p className="ls-label">Interpretation</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">
                {score.composite === 0
                  ? 'Regional respiratory testing and positivity are at expected baseline levels. No component is currently contributing to the composite signal.'
                  : `Sustained increases in respiratory testing and positivity are occurring across ${scenario.affectedHospitals.length} participating ${
                      scenario.affectedHospitals.length === 1 ? 'facility' : 'facilities'
                    } and ${scenario.affectedZipCodes.length} geographic ${
                      scenario.affectedZipCodes.length === 1 ? 'area' : 'areas'
                    }, persisting for ${scenario.persistenceDays} consecutive ${
                      scenario.persistenceDays === 1 ? 'day' : 'days'
                    }.`}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="ls-card border-l-4 border-l-severity-critical p-5">
        <p className="text-sm font-semibold text-ink">{SIGNAL_DISCLAIMER}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{SCORE_DISCLAIMER}</p>
      </div>
    </div>
  );
}
