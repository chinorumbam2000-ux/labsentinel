import { useState } from 'react';
import type { InvestigationAction, InvestigationRecord } from '../../types';
import SeverityBadge from '../signals/SeverityBadge';
import InvestigationWorkflowPanel from '../signals/InvestigationWorkflowPanel';
import { SIGNAL_DISCLAIMER } from '../../lib/signalScore';
import { formatSimulationDateTime } from '../../lib/format';
import { PROFILE_BY_ID, type ProfileId } from '../../lib/profiles/registry';
import { rateDisplay, regionalPositivePrivacy } from '../../lib/profiles/privacy';
import type { ProfileAlert } from '../../lib/profiles/portfolio';

/**
 * The investigation of an alert from a profile other than the narrated one.
 *
 * The review workflow (acknowledge, assign, review, escalate or close, notes,
 * report) works the same for every profile. The detailed evidence view —
 * the step-by-step score breakdown and facility, area and data-quality trace
 * at detection — is built for Respiratory Viral Activity only, so it is not
 * shown here and nothing stands in for it. What is shown are the alert's own
 * detection-time values, frozen when it was raised.
 */
export default function ProfileInvestigationShell({
  alert,
  investigation,
  onAction,
  onPrepareReport,
  hasReport,
  onBack,
}: {
  alert: ProfileAlert;
  investigation: InvestigationRecord | undefined;
  onAction: (action: InvestigationAction, note?: string) => string | null;
  /** Returns an explanation when no report can be prepared. */
  onPrepareReport: () => string | null;
  hasReport: boolean;
  onBack: () => void;
}) {
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const profile = PROFILE_BY_ID[alert.profileId as ProfileId];
  const d = alert.detection;
  const positives = regionalPositivePrivacy(profile.id, alert.detectedDay);

  return (
    <div className="space-y-5" data-testid="profile-investigation">
      <section className="ls-card p-5" aria-label={`${profile.displayName} alert at detection`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ls-label">{profile.displayName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={d.severity} size="md" />
              <h2 className="text-base font-semibold text-ink">{alert.title}</h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              Detected on Replay Day {alert.detectedDay} · {formatSimulationDateTime(alert.detectedAt)} (scenario time) · {alert.status}
            </p>
          </div>
          <button type="button" onClick={onBack} className="ls-btn text-sm">
            ← Back to signals
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['What was detected', d.detail],
            ['Composite score at detection', `${d.compositeScore} / 100`],
            ['Tests at detection', String(d.totalTests)],
            ['Positivity at detection', rateDisplay(positives, d.positivityRate)],
            ['Facilities', d.facilities],
            ['Areas', d.geography],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-canvas p-3">
              <dt className="ls-label">{label}</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          These values were recorded when the alert was raised and do not change as the replay advances.
        </p>
      </section>

      <p role="note" className="ls-card border-l-4 border-l-brand px-4 py-3 text-sm text-ink" data-testid="evidence-unavailable">
        Detailed evidence review for {profile.displayName} is not yet available. The step-by-step evidence view
        (the score breakdown at detection and the facility, area and data-quality trace) covers Respiratory Viral
        Syndrome in this release. The review steps below work for every profile.
      </p>

      {investigation ? (
        <InvestigationWorkflowPanel
          record={investigation}
          onAction={onAction}
          onPrepareReport={() => setReportMessage(onPrepareReport())}
          hasReport={hasReport}
        />
      ) : null}
      {reportMessage ? (
        <p role="status" className="text-sm text-ink">
          {reportMessage}
        </p>
      ) : null}

      <p className="text-xs font-medium text-muted">{SIGNAL_DISCLAIMER}</p>
    </div>
  );
}
