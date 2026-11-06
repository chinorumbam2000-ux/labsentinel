import { Link } from 'react-router-dom';
import SeverityBadge from '../signals/SeverityBadge';
import { SIGNAL_DISCLAIMER } from '../../lib/signalScore';
import type { ProfileView } from '../../lib/profiles/usePortfolio';

/**
 * A profile's alerts so far, for profiles other than the narrated one (whose
 * dashboard keeps its full current-alert section). Same alert rules for every
 * profile; acknowledgement happens on the Signals page.
 */
export default function ProfileAlertList({ view, day }: { view: ProfileView; day: number }) {
  const { profile, alerts, score, statusReason } = view;
  const signalsPath = `/signals?profile=${encodeURIComponent(profile.id)}`;

  if (alerts.length === 0) {
    return (
      <div className="ls-card px-4 py-3 text-sm text-muted">
        <p>
          No {profile.displayName} alert has been raised through Day {day}.{' '}
          {score ? '' : statusReason}
        </p>
      </div>
    );
  }

  const ordered = [...alerts].sort((a, b) => b.detectedDay - a.detectedDay || a.title.localeCompare(b.title));
  return (
    <div className="ls-card px-4 py-3">
      <ul className="divide-y divide-hairline" aria-label={`${profile.displayName} alerts`}>
        {ordered.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={alert.detection.severity} />
              <span className="text-sm font-semibold text-ink">{alert.title}</span>
              <span className="text-xs text-muted">{alert.detection.detail}</span>
            </div>
            <span className="text-xs text-muted">
              Detected Day {alert.detectedDay} · {alert.status}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{SIGNAL_DISCLAIMER}</p>
        <Link to={signalsPath} className="ls-btn px-2.5 py-1 text-xs">
          Review in Signals →
        </Link>
      </div>
    </div>
  );
}
