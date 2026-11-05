import type { MethodComparison } from '../../data-access/cusum';
import { formatSurveillanceDate } from '../../lib/dynamicSurveillance';
import { anyState } from '../../lib/cusum';
import SeverityBadge from '../signals/SeverityBadge';

/**
 * The analyst's summary of the two statistical methods for the selected date:
 * do EWMA and CUSUM confirm elevated activity? Read from the stored results
 * only. The Composite Outbreak Signal Score is the operational signal and is
 * shown beside the summary, never counted in it or combined with it.
 *
 * Method details (formulas, parameters, control limits, reference periods)
 * stay below, behind "View method details".
 */
export default function StatisticalConfirmation({ comparison }: { comparison: MethodComparison }) {
  const methods = [
    { name: 'EWMA', state: anyState(comparison.ewma.overall), signalling: comparison.methods.ewma },
    { name: 'CUSUM', state: anyState(comparison.cusum.overall), signalling: comparison.methods.cusum },
  ];
  const available = methods.filter((method) => method.signalling !== null);
  const confirming = available.filter((method) => method.signalling).length;
  const summary =
    available.length === 0
      ? 'No statistical result for this date.'
      : `${confirming} of ${available.length} statistical ${available.length === 1 ? 'method indicates' : 'methods indicate'} elevated activity.`;
  const composite = comparison.composite;

  return (
    <section aria-labelledby="statistical-confirmation" className="ls-card">
      <header className="ls-card-header">
        <div>
          <h2 id="statistical-confirmation" className="ls-card-title">Statistical confirmation</h2>
          <p className="mt-0.5 text-xs text-muted">{formatSurveillanceDate(comparison.signal_date)}</p>
        </div>
      </header>
      <div className="grid gap-px bg-hairline md:grid-cols-3">
        <div className="bg-white px-5 py-4">
          <p className="ls-label">Operational signal</p>
          <p className="mt-1 text-sm font-semibold text-ink">Composite Outbreak Signal Score</p>
          {composite && composite.severity && composite.composite_score !== null ? (
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-lg font-semibold tabular-nums text-ink">{composite.composite_score}</span>
              <span className="text-muted">/ 100</span>
              <SeverityBadge severity={composite.severity} />
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">Not calculated for this date.</p>
          )}
        </div>
        {methods.map((method) => (
          <div key={method.name} className="bg-white px-5 py-4">
            <p className="ls-label">Statistical method</p>
            <p className="mt-1 text-sm font-semibold text-ink">{method.name}</p>
            <p className={`mt-1 text-sm font-semibold ${method.signalling ? 'text-severity-critical' : 'text-ink'}`}>
              {method.state}
            </p>
          </div>
        ))}
      </div>
      <div role="status" className="border-t border-hairline bg-canvas px-5 py-3">
        <p className="text-sm font-semibold text-ink">{summary}</p>
        <p className="mt-1 text-xs text-muted">
          EWMA and CUSUM confirm the Composite signal statistically. They are separate methods, never combined
          with it into one score. A statistical alert is not a confirmed outbreak.
        </p>
      </div>
    </section>
  );
}
