import { useNavigate } from 'react-router-dom';
import type { SignalScoreResult, SimulationScenario } from '../../types';
import { SEVERITY_STYLES, formatClockTime } from '../../lib/format';

interface VendorSidecarProps {
  scenario: SimulationScenario;
  score: SignalScoreResult;
  lastUpdated: Date;
}

/**
 * THE reusable LabSentinel sidecar.
 *
 * This exact component is rendered unchanged inside all three simulated EHR
 * environments. The surrounding shell changes; LabSentinel does not. That is
 * the vendor-agnostic point the prototype is making.
 */
export default function VendorSidecar({
  scenario,
  score,
  lastUpdated,
}: VendorSidecarProps) {
  const navigate = useNavigate();
  const styles = SEVERITY_STYLES[score.severity];

  return (
    <aside
      aria-label="LabSentinel regional respiratory activity"
      className="overflow-hidden rounded-xl border border-hairline bg-white shadow-card"
    >
      <div className="flex items-center gap-2 bg-sidebar px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded bg-brand text-[10px] font-bold text-white"
        >
          LS
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-white">
            LabSentinel
          </p>
          <p className="truncate text-[11px] leading-tight text-white/55">
            Regional Respiratory Activity
          </p>
        </div>
      </div>

      <div className={`border-b px-4 py-3 ${styles.soft}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-sm font-bold uppercase tracking-[0.08em] ${styles.text}`}
          >
            {score.severity}
          </span>
          <span className="text-lg font-semibold tabular-nums text-ink">
            {score.composite}
            <span className="text-sm font-medium text-muted"> / 100</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
          <span
            className={`block h-full rounded-full transition-all duration-500 ${styles.accent}`}
            style={{ width: `${Math.max(score.composite, 2)}%` }}
          />
        </div>
      </div>

      <dl className="divide-y divide-hairline px-4">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-xs text-muted">Test volume</dt>
          <dd className="text-xs font-semibold text-ink">
            {score.volumeIncreasePercent > 0 ? '↑ ' : ''}
            {score.volumeIncreasePercent >= 0 ? '+' : ''}
            {score.volumeIncreasePercent.toFixed(0)}%
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-xs text-muted">Positivity</dt>
          <dd className="text-xs font-semibold text-ink">
            {score.positivityDeltaPoints > 0 ? '↑ ' : ''}
            {scenario.positivityRate.toFixed(1)}%
            <span className="ml-1 font-normal text-muted">
              ({scenario.totalPositives}/{scenario.totalTests})
            </span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-xs text-muted">Affected hospitals</dt>
          <dd className="text-xs font-semibold text-ink">
            {scenario.affectedHospitals.length} of 3 facilities
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3 py-2.5">
          <dt className="text-xs text-muted">Affected ZIP codes</dt>
          <dd className="text-right text-xs font-semibold text-ink">
            {scenario.affectedZipCodes.length === 0
              ? 'None'
              : scenario.affectedZipCodes.join(', ')}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-xs text-muted">Session updated</dt>
          <dd className="text-xs font-semibold text-ink">
            {formatClockTime(lastUpdated)}
          </dd>
        </div>
      </dl>

      <div className="p-4 pt-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="ls-btn-primary w-full text-xs"
        >
          View Regional Intelligence
        </button>
        <p className="mt-2 text-center text-[10px] leading-snug text-muted">
          Early-warning signal — not a confirmed outbreak.
        </p>
      </div>
    </aside>
  );
}
