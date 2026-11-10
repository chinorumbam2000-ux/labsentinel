import { PROFILES } from '../../lib/profiles/registry';
import { STATUS_LABEL } from '../../lib/profiles/derive';
import { SCOPE_LABEL, isScope, type ProfileSelection } from '../../lib/profiles/selection';
import { DEFAULT_PROFILE_ID, PROFILE_BY_ID } from '../../lib/profiles/registry';
import type { Portfolio } from '../../lib/profiles/usePortfolio';

/**
 * The compact surveillance-profile selector. A native <select>, so it is
 * keyboard- and screen-reader-operable as is. Each option carries the
 * profile's status in words; options are grouped as aggregate or
 * pathogen-specific profiles. The choice is kept in the URL (?profile=).
 */
export default function ProfileSelector({
  portfolio,
  className = '',
}: {
  portfolio: Portfolio;
  className?: string;
}) {
  const { selection, setSelection, summaries, focusId, invalidSelection } = portfolio;
  const optionText = (id: (typeof PROFILES)[number]['id']) => {
    const summary = summaries.find((s) => s.profile.id === id);
    if (!summary) return PROFILE_BY_ID[id].displayName;
    const reading = summary.score
      ? `${summary.score.severity} ${summary.score.composite}`
      : STATUS_LABEL[summary.status];
    return `${PROFILE_BY_ID[id].displayName} — ${reading}`;
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <label htmlFor="profile-selector" className="text-xs font-semibold text-ink">
        Surveillance profile
      </label>
      <select
        id="profile-selector"
        value={selection}
        onChange={(event) => setSelection(event.target.value as ProfileSelection)}
        className="max-w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <optgroup label="Portfolio">
          <option value="active">{SCOPE_LABEL.active}</option>
          <option value="all">{SCOPE_LABEL.all}</option>
        </optgroup>
        {/* Grouped by type, so each option says what it represents. */}
        <optgroup label="Aggregate profiles">
          {PROFILES.filter((profile) => profile.type === 'Aggregate').map((profile) => (
            <option key={profile.id} value={profile.id}>
              {optionText(profile.id)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Pathogen-specific profiles">
          {PROFILES.filter((profile) => profile.type === 'Pathogen').map((profile) => (
            <option key={profile.id} value={profile.id}>
              {optionText(profile.id)}
            </option>
          ))}
        </optgroup>
      </select>
      {isScope(selection) ? (
        <p className="w-full text-xs text-muted sm:w-auto" data-testid="profile-focus-note">
          Showing {PROFILE_BY_ID[focusId].displayName}
          {summaries.some((s) => s.status === 'ACTIVE_SIGNAL')
            ? ' — the highest active signal'
            : ' — no profile has an active signal'}
        </p>
      ) : null}
      {invalidSelection ? (
        <p role="status" className="w-full text-xs text-muted">
          “{invalidSelection}” is not a surveillance profile. Showing {PROFILE_BY_ID[DEFAULT_PROFILE_ID].displayName}.
        </p>
      ) : null}
    </div>
  );
}
