import SeverityBadge from '../signals/SeverityBadge';
import MethodNote from '../common/MethodNote';
import ProfileStatusTag from './ProfileStatusTag';
import { DATA_ORIGIN_LABEL, TEST_BY_CODE, settingsFor } from '../../lib/profiles/registry';
import type { ProfileView } from '../../lib/profiles/usePortfolio';

const ORIGIN_NOTE = {
  'replay-scenario': 'The narrated five-day Scenario Replay.',
  'replay-derived':
    'Built from the same replay results as Respiratory Viral Syndrome, filtered to this profile’s tests. Its daily counts are smaller, so its score moves more from day to day.',
  'portfolio-fixture':
    'Synthetic portfolio data with demonstration test codes (not LOINC). Not part of the narrated replay.',
} as const;

/**
 * Names the profile the page is showing, its status in words, where its data
 * comes from, and the settings it is scored with.
 */
export default function ProfileHeading({ view, compact = false }: { view: ProfileView; compact?: boolean }) {
  const { profile, status, score, statusReason } = view;
  const settings = settingsFor(profile.id);
  const tests = profile.testCodes.map((code) => TEST_BY_CODE[code]?.name ?? code).join(', ');

  return (
    <section
      aria-label={`Profile: ${profile.displayName}`}
      className="ls-card flex flex-col gap-2 px-4 py-3"
      data-testid="profile-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="ls-label">Viewing</p>
        <h2 className="text-base font-semibold text-ink">{profile.displayName}</h2>
        {score ? <SeverityBadge severity={score.severity} /> : null}
        <ProfileStatusTag status={status} />
        <span className="text-xs text-muted">
          {profile.category} · {DATA_ORIGIN_LABEL[profile.dataOrigin]}
        </span>
      </div>
      <p className="text-sm text-ink">{statusReason}</p>
      {view.display.lowVolume ? (
        <p role="note" className="rounded-md border border-dashed border-muted/60 px-3 py-2 text-xs text-ink" data-testid="low-volume-note">
          <span className="font-semibold">{view.display.lowVolume.title}: </span>
          {view.display.lowVolume.text}
        </p>
      ) : null}
      {score ? (
        // Traceability: the score is the sum of these five components, the same
        // objects Roella explains. Rates are withheld where the count is.
        <details className="group" data-testid="score-components">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-semibold text-ink hover:text-brand [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
            Score components ({score.composite} of 100)
          </summary>
          <ul className="mt-1.5 space-y-1 text-xs text-ink">
            {[...score.components].map((component) => (
              <li key={component.key}>
                <span className="font-semibold">{component.label}</span>: {component.points} of {component.maxPoints}{' '}
                points — <span className="text-muted">{view.display.evidence(component)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {compact ? null : (
        <>
          <p className="text-xs text-muted">
            {ORIGIN_NOTE[profile.dataOrigin]} Tests: {tests}. Data Confidence is overall participating-source
            quality: the same for every profile, not specific to {profile.displayName}.
          </p>
          <MethodNote label="Profile settings">
            {settings.label}: {settings.note} Replay baseline Day {settings.replay.baselineDay} (at least{' '}
            {settings.replay.minimumBaselineTests} tests); a facility is affected at +
            {settings.replay.affectedMarginPoints} percentage points over baseline and assessed only with at
            least {settings.engine.facilityMinimumTests} tests; positivity scale {settings.replay.positivityScalePoints}{' '}
            points; persistence cap {settings.replay.persistenceCapDays} days. Detection methods (live data only):
            EWMA λ {settings.ewma.lambda}, k {settings.ewma.k}, {settings.ewma.referenceDays}-day reference; CUSUM k{' '}
            {settings.cusum.k}, h {settings.cusum.h}.
            {profile.liveAvailable
              ? ' The backend calculates this profile from ingested results.'
              : ' The backend does not yet calculate this profile from ingested results; EWMA and CUSUM are not run for it.'}
          </MethodNote>
        </>
      )}
    </section>
  );
}
