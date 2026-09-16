import { useNavigate } from 'react-router-dom';
import type { SignalScoreResult, SimulationScenario } from '../../types';
import { SEVERITY_STYLES, formatPercentagePoints, formatSignedPercent } from '../../lib/format';
import { SIGNAL_DISCLAIMER } from '../../lib/signalScore';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../../data/simulation';
import SeverityBadge from '../signals/SeverityBadge';
import { EmptyState } from '../common/States';

interface AlertCardProps {
  scenario: SimulationScenario;
  score: SignalScoreResult;
}

/** The headline alert. Explains, in plain language, what produced the score. */
export default function AlertCard({ scenario, score }: AlertCardProps) {
  const navigate = useNavigate();
  const styles = SEVERITY_STYLES[score.severity];

  if (score.composite === 0) {
    return (
      <div className="ls-card">
        <EmptyState
          icon="✓"
          title="No active outbreak signal"
          message="Regional respiratory activity is at the expected baseline. LabSentinel raises an alert only when the composite signal rises above baseline. Advance the simulation to see a signal develop."
        />
      </div>
    );
  }

  const facts = [
    {
      label: 'Test volume deviation',
      value: `${formatSignedPercent(score.volumeIncreasePercent, 0)} vs baseline`,
      detail: `${scenario.totalTests} tests vs baseline ${BASELINE_TEST_VOLUME}`,
    },
    {
      label: 'Positivity deviation',
      value: formatPercentagePoints(score.positivityDeltaPoints),
      detail: `${BASELINE_POSITIVITY_RATE.toFixed(1)}% → ${scenario.positivityRate.toFixed(
        1,
      )}% (${scenario.totalPositives} of ${scenario.totalTests})`,
    },
    {
      label: 'Healthcare facilities affected',
      value: `${scenario.affectedHospitals.length} of 3`,
      detail: scenario.affectedHospitals.join(', ') || 'None',
    },
    {
      label: 'Surveillance areas affected',
      value: `${scenario.affectedZipCodes.length} of 3`,
      detail: scenario.affectedZipCodes.join(', ') || 'None',
    },
  ];

  return (
    <div className={`ls-card overflow-hidden border ${styles.soft}`}>
      <span aria-hidden="true" className={`block h-1 w-full ${styles.accent}`} />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={score.severity} size="md" />
              <h2 className="text-base font-semibold text-ink">
                {score.severity === 'Critical' || score.severity === 'High'
                  ? 'Regional early-warning signal'
                  : 'Elevated regional activity'}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              Respiratory Viral Syndrome · Worcester County, MA · {scenario.stage}
            </p>
          </div>
          <div className="text-right">
            <p className="ls-label">Composite Score</p>
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {score.composite}
              <span className="text-base font-medium text-muted"> / 100</span>
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-lg bg-white/70 p-3 ring-1 ring-hairline">
              <dt className="ls-label">{fact.label}</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{fact.value}</dd>
              <dd className="mt-0.5 text-xs text-muted">{fact.detail}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs font-medium text-muted">{SIGNAL_DISCLAIMER}</p>
          <button
            type="button"
            onClick={() => navigate('/signals?view=current')}
            className="ls-btn-primary"
          >
            Investigate Signal →
          </button>
        </div>
      </div>
    </div>
  );
}
