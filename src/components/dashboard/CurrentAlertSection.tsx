import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  DataConfidenceResult,
  FacilityFeedHealth,
  InvestigationRecord,
  OutbreakAlert,
  SignalScoreResult,
  SimulationScenario,
} from '../../types';
import { SEVERITY_STYLES } from '../../lib/format';
import { SIGNAL_DISCLAIMER } from '../../lib/signalScore';
import { INVESTIGATION_STATUS_STYLES } from '../../lib/investigationWorkflow';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../../data/simulation';
import SeverityBadge from '../signals/SeverityBadge';
import WhyThisSignalPanel from '../signals/WhyThisSignalPanel';
import { EmptyState } from '../common/States';

interface CurrentAlertSectionProps {
  scenario: SimulationScenario;
  score: SignalScoreResult;
  confidence: DataConfidenceResult;
  feeds: FacilityFeedHealth[];
  lastUpdated: Date;
  alert: OutbreakAlert | undefined;
  investigation: InvestigationRecord | undefined;
}

/**
 * Section 5 — the current alert, its review state, and the way in.
 *
 * The full Why This Signal panel is one click away rather than always open:
 * the dashboard's job is to let someone decide whether to look closer, not to
 * put the whole explanation in their way first.
 */
export default function CurrentAlertSection({
  scenario,
  score,
  confidence,
  feeds,
  lastUpdated,
  alert,
  investigation,
}: CurrentAlertSectionProps) {
  const navigate = useNavigate();
  const [showWhy, setShowWhy] = useState(false);
  const styles = SEVERITY_STYLES[score.severity];

  if (score.composite === 0 || !alert) {
    // A composite above zero means activity IS elevated; it simply has not
    // reached the regional trigger yet, and lower-level alerts may already be
    // open on /signals. Saying "at the expected baseline" here would be wrong.
    const atBaseline = score.composite === 0;
    return (
      <div className="ls-card">
        <EmptyState
          icon={atBaseline ? '✓' : '◷'}
          title={
            atBaseline
              ? 'No active outbreak signal'
              : 'No regional early-warning signal yet'
          }
          message={
            atBaseline
              ? 'Regional respiratory activity is at the expected baseline, so no alert has been raised. All three facilities are still reporting — this is an absence of signal, not an absence of data. Advance the simulation to watch a signal develop.'
              : `Regional activity is elevated — the composite score is ${score.composite} of 100 (${score.severity}) — but it has not yet reached the threshold that raises a regional early-warning signal. Any volume, positivity or cluster alerts already open for this day are listed under Signals. All three facilities are still reporting.`
          }
        />
      </div>
    );
  }

  const openInvestigation = () =>
    navigate(`/signals?alert=${encodeURIComponent(alert.id)}&view=detection`);

  return (
    <div className="space-y-4">
      <div className={`ls-card overflow-hidden border ${styles.soft}`}>
        <span aria-hidden="true" className={`block h-1 w-full ${styles.accent}`} />

        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={score.severity} size="md" />
                <h2 className="text-base font-semibold text-ink">{alert.title}</h2>
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

          {/* Why This Signal — the short version */}
          <p className="mt-4 text-sm leading-relaxed text-ink">
            Testing moved from {BASELINE_TEST_VOLUME} tests at baseline to{' '}
            {scenario.totalTests} ({score.volumeIncreasePercent >= 0 ? '+' : ''}
            {score.volumeIncreasePercent.toFixed(0)}%) and positivity from{' '}
            {BASELINE_POSITIVITY_RATE.toFixed(1)}% to{' '}
            {scenario.positivityRate.toFixed(1)}%, across{' '}
            {scenario.affectedHospitals.length} of 3 facilities and{' '}
            {scenario.affectedZipCodes.length} of 3 surveillance areas, persisting for{' '}
            {scenario.persistenceDays}{' '}
            {scenario.persistenceDays === 1 ? 'day' : 'days'}.
          </p>

          {/* Investigation status */}
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white/70 p-3 ring-1 ring-hairline">
              <dt className="ls-label">Investigation status</dt>
              <dd className="mt-1.5">
                {investigation ? (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${
                      INVESTIGATION_STATUS_STYLES[investigation.status]
                    }`}
                  >
                    {investigation.status}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-muted">Not yet reviewed</span>
                )}
              </dd>
            </div>
            <div className="rounded-lg bg-white/70 p-3 ring-1 ring-hairline">
              <dt className="ls-label">Assigned investigator</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                {investigation?.assignedInvestigator ?? 'Unassigned'}
              </dd>
            </div>
            <div className="rounded-lg bg-white/70 p-3 ring-1 ring-hairline">
              <dt className="ls-label">Detected</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                Day {alert.detectedDay}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs font-medium text-muted">
              {SIGNAL_DISCLAIMER}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowWhy((open) => !open)}
                aria-expanded={showWhy}
                className="ls-btn text-sm"
              >
                {showWhy ? 'Hide — Why This Signal' : 'Why This Signal?'}
              </button>
              <button type="button" onClick={openInvestigation} className="ls-btn-primary">
                View Investigation →
              </button>
            </div>
          </div>
        </div>
      </div>

      {showWhy ? (
        <WhyThisSignalPanel
          scenario={scenario}
          score={score}
          confidence={confidence}
          feeds={feeds}
          lastUpdated={lastUpdated}
        />
      ) : null}
    </div>
  );
}
