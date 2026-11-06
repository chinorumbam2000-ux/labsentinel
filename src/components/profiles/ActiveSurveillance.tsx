import SeverityBadge from '../signals/SeverityBadge';
import ProfileStatusTag from './ProfileStatusTag';
import { DATA_ORIGIN_LABEL } from '../../lib/profiles/registry';
import { activeSignals, type ProfileSummary } from '../../lib/profiles/portfolio';
import type { Portfolio } from '../../lib/profiles/usePortfolio';
import { useOptionalLiveSurveillance } from '../../context/LiveSurveillanceContext';
import { liveProvisional } from '../../lib/live/view';
import type { ProfileDay } from '../../lib/profiles/derive';

/**
 * ACTIVE SURVEILLANCE — every surveillance profile's reading for the replay
 * day, rendered from the profiles' own data. Each profile is scored against
 * its own baseline; scores are never combined. Profiles with no data or no
 * usable baseline are counted on their own, never as "within expected range".
 */
export default function ActiveSurveillance({ portfolio, day }: { portfolio: Portfolio; day: number }) {
  const { summaries, ranked, counts, selection, setSelection, focusId, period } = portfolio;
  const live = useOptionalLiveSurveillance();
  // Live Surveillance: the open day's calculation so far, beside each closed-day score.
  const provisional = period.mode === 'live' && live ? liveProvisional(live.simulator) : {};
  const active = activeSignals(summaries);
  const showAll = selection === 'all';
  const cards = showAll ? ranked : active;
  const others = ranked.filter((s) => s.status !== 'ACTIVE_SIGNAL');
  const headline =
    counts.activeSignal === 0
      ? 'No signals require attention'
      : `${counts.activeSignal} ${counts.activeSignal === 1 ? 'signal requires' : 'signals require'} attention`;

  return (
    <section aria-labelledby="active-surveillance-heading" className="space-y-3" data-testid="active-surveillance">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ls-label">Active surveillance</p>
          <h2 id="active-surveillance-heading" className="text-lg font-semibold text-ink">
            {headline}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {period.mode === 'live' ? `Live Surveillance · ${period.currentLabel} (latest closed day)` : `Replay Day ${day}`} · each
            profile scored against its own baseline — scores are never combined.
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Profiles shown">
          <button
            type="button"
            className={`ls-btn px-2.5 py-1 text-xs ${!showAll ? 'ring-2 ring-brand' : ''}`}
            aria-pressed={!showAll}
            onClick={() => setSelection('active')}
          >
            Active signals
          </button>
          <button
            type="button"
            className={`ls-btn px-2.5 py-1 text-xs ${showAll ? 'ring-2 ring-brand' : ''}`}
            aria-pressed={showAll}
            onClick={() => setSelection('all')}
          >
            All profiles
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Profile status counts">
        <Count label="Active signal" value={counts.activeSignal} />
        <Count label="Within expected range" value={counts.withinExpectedRange} />
        <Count label="Insufficient baseline" value={counts.insufficientBaseline} />
        <Count label="No data" value={counts.noData} />
        {counts.inactive > 0 ? <Count label="Inactive" value={counts.inactive} /> : null}
      </dl>

      {cards.length === 0 ? (
        <p className="ls-card px-4 py-3 text-sm text-muted">No profile has an active signal on {period.label(day)}.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={showAll ? 'All profiles' : 'Active signals'}>
          {cards.map((summary) => (
            <ProfileCard
              key={summary.profile.id}
              summary={summary}
              selected={summary.profile.id === focusId}
              onView={() => setSelection(summary.profile.id)}
              today={provisional[summary.profile.id]}
            />
          ))}
        </ul>
      )}

      {!showAll && others.length > 0 ? (
        <div className="ls-card px-4 py-3">
          <p className="ls-label">Other profiles</p>
          <ul className="mt-2 space-y-1.5" aria-label="Other profiles">
            {others.map((s) => (
              <li key={s.profile.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <button
                  type="button"
                  onClick={() => setSelection(s.profile.id)}
                  className="font-semibold text-ink hover:text-brand hover:underline"
                  aria-current={s.profile.id === focusId ? 'true' : undefined}
                >
                  {s.profile.displayName}
                </button>
                <ProfileStatusTag status={s.status} />
                <span className="text-xs text-muted">{s.current.statusReason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="ls-card px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function ProfileCard({
  summary,
  selected,
  onView,
  today,
}: {
  summary: ProfileSummary;
  selected: boolean;
  onView: () => void;
  /** Live Surveillance only: the open day so far. */
  today?: ProfileDay;
}) {
  const { profile, current, score, scoreChange, status } = summary;
  const facilities = current.scenario.affectedHospitals.length;
  const areas = current.scenario.affectedZipCodes;
  return (
    <li
      className={`ls-card flex flex-col gap-2 px-4 py-3 ${selected ? 'ring-2 ring-brand' : ''}`}
      aria-current={selected ? 'true' : undefined}
      data-testid={`profile-card-${profile.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink" title={profile.displayName}>
            {profile.displayName}
          </h3>
          <p className="text-[11px] text-muted">
            {profile.category} · {DATA_ORIGIN_LABEL[profile.dataOrigin]}
          </p>
        </div>
        {score ? (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold leading-none tabular-nums text-ink">
              {score.composite}
              <span className="sr-only"> out of 100</span>
            </p>
            {scoreChange !== null ? (
              <p className="mt-0.5 text-[11px] text-muted">
                {scoreChange > 0 ? '+' : ''}
                {scoreChange} since previous day
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {score ? <SeverityBadge severity={score.severity} /> : null}
        <ProfileStatusTag status={status} />
      </div>
      {score ? (
        <p className="text-xs text-muted">
          {facilities} of 3 facilities · {areas.length === 0 ? 'no area affected' : `${areas.length} ${areas.length === 1 ? 'area' : 'areas'} affected`}
        </p>
      ) : (
        <p className="text-xs text-muted">{current.statusReason}</p>
      )}
      {today ? (
        <p className="text-[11px] text-muted" data-testid={`today-${profile.id}`}>
          Today so far (provisional): {today.score ? `${today.score.composite} · ${today.score.severity}` : 'no score yet'} ·{' '}
          {today.scenario.totalTests} {today.scenario.totalTests === 1 ? 'result' : 'results'}
        </p>
      ) : null}
      <div className="mt-auto pt-1">
        <button type="button" onClick={onView} className="ls-btn px-2.5 py-1 text-xs" aria-pressed={selected}>
          {selected ? 'Viewing' : 'View'}
          <span className="sr-only"> {profile.displayName}</span>
        </button>
      </div>
    </li>
  );
}
