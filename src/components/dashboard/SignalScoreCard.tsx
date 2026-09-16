import type { SignalScoreResult } from '../../types';
import { SEVERITY_STYLES } from '../../lib/format';

/** KPI card whose styling is driven by the calculated severity band. */
export default function SignalScoreCard({ score }: { score: SignalScoreResult }) {
  const styles = SEVERITY_STYLES[score.severity];

  return (
    <div className={`ls-card relative overflow-hidden border p-5 ${styles.soft}`}>
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${styles.accent}`} />
      <p className="ls-label">Outbreak Signal Score</p>
      <p className="mt-2 text-3xl font-semibold leading-none tabular-nums text-ink">
        {score.composite}
        <span className="text-lg font-medium text-muted"> / 100</span>
      </p>
      <p
        className={`mt-2 text-xs font-bold uppercase tracking-[0.08em] ${styles.text}`}
      >
        {score.severity}
      </p>
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-hairline"
        role="img"
        aria-label={`Composite outbreak signal score ${score.composite} of 100, severity ${score.severity}`}
      >
        <span
          className={`block h-full rounded-full transition-all duration-500 ${styles.accent}`}
          style={{ width: `${Math.max(score.composite, 2)}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted">
        Illustrative, non-validated prototype model.
      </p>
    </div>
  );
}
