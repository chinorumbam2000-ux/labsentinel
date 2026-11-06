import type { OutbreakAlert } from '../../types';
import { formatSimulationDateTime } from '../../lib/format';
import SeverityBadge from './SeverityBadge';
import { EmptyState } from '../common/States';

interface SignalTableProps {
  alerts: OutbreakAlert[];
  onInvestigate: (alert: OutbreakAlert) => void;
  onAcknowledge: (alertId: string) => void;
  /**
   * The surveillance profile each alert belongs to, by alert id. When given,
   * the table gains Profile and Score columns (alerts from several profiles).
   */
  profileNames?: Record<string, string>;
  /** Shown when there are no alerts. */
  emptyMessage?: string;
  /** Alerts that open a profile's investigation shell ("Review"), e.g. another profile's alerts. */
  canReview?: (alert: OutbreakAlert) => boolean;
}

const STATUS_STYLES: Record<OutbreakAlert['status'], string> = {
  New: 'bg-brand-light text-brand ring-1 ring-inset ring-brand/20',
  Active: 'bg-severity-high/10 text-[#9A3412] ring-1 ring-inset ring-severity-high/25',
  Acknowledged: 'bg-canvas text-muted ring-1 ring-inset ring-hairline',
};

export default function SignalTable({
  alerts,
  onInvestigate,
  onAcknowledge,
  profileNames,
  emptyMessage,
  canReview = () => false,
}: SignalTableProps) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon="✓"
        title="No alerts on this replay day"
        message={
          emptyMessage ??
          'Regional respiratory activity is at the expected baseline, so no Signal by ProbeSyQ alert has been raised. Advance the replay day to watch alerts appear as the signal develops.'
        }
      />
    );
  }
  const profileOf = (alert: OutbreakAlert) => profileNames?.[alert.id];

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse">
        <caption className="sr-only">
          Alert history. Values shown are those recorded when each alert was detected.
        </caption>
        <thead className="border-b border-hairline bg-canvas">
          <tr>
            <th scope="col" className="ls-th">Detected</th>
            {profileNames ? <th scope="col" className="ls-th">Profile</th> : null}
            <th scope="col" className="ls-th">Alert</th>
            {profileNames ? <th scope="col" className="ls-th text-right">Score</th> : null}
            <th scope="col" className="ls-th">Severity</th>
            <th scope="col" className="ls-th">Geography</th>
            <th scope="col" className="ls-th">Facilities</th>
            <th scope="col" className="ls-th">Status</th>
            <th scope="col" className="ls-th text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {alerts.map((alert) => (
            <tr key={alert.id} className="transition-colors hover:bg-canvas">
              <td className="ls-td text-muted">
                <span className="block">{formatSimulationDateTime(alert.detectedAt)}</span>
                <span className="block text-[11px]">Day {alert.detectedDay}</span>
              </td>
              {profileNames ? <td className="ls-td font-medium text-ink">{profileOf(alert)}</td> : null}
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-ink">{alert.title}</p>
                <p className="text-xs text-muted">{alert.detection.detail}</p>
              </td>
              {profileNames ? (
                <td className="ls-td text-right tabular-nums text-ink">
                  {alert.detection.compositeScore}
                  <span className="sr-only"> out of 100 at detection</span>
                </td>
              ) : null}
              <td className="ls-td">
                <SeverityBadge severity={alert.detection.severity} />
              </td>
              <td className="ls-td text-muted">{alert.detection.geography}</td>
              <td className="ls-td text-muted">{alert.detection.facilities}</td>
              <td className="ls-td">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${
                    STATUS_STYLES[alert.status]
                  }`}
                >
                  {alert.status === 'New' ? 'New today' : alert.status}
                </span>
                {alert.acknowledgement ? (
                  <span className="mt-1 block text-[11px] text-muted">
                    on Day {alert.acknowledgement.day}
                  </span>
                ) : null}
              </td>
              <td className="ls-td">
                <div className="flex items-center justify-end gap-2">
                  {alert.investigable ? (
                    <button
                      type="button"
                      onClick={() => onInvestigate(alert)}
                      className="ls-btn px-3 py-1.5 text-xs"
                    >
                      Investigate
                    </button>
                  ) : canReview(alert) ? (
                    <button
                      type="button"
                      onClick={() => onInvestigate(alert)}
                      className="ls-btn px-3 py-1.5 text-xs"
                      aria-label={`Review alert: ${profileOf(alert) ? `${profileOf(alert)} — ` : ''}${alert.title}`}
                    >
                      Review
                    </button>
                  ) : null}
                  {alert.status === 'Acknowledged' ? (
                    <span className="text-xs text-muted">Acknowledged</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(alert.id)}
                      className="ls-btn px-3 py-1.5 text-xs"
                      aria-label={`Acknowledge alert: ${profileOf(alert) ? `${profileOf(alert)} — ` : ''}${alert.title}, detected on replay day ${alert.detectedDay}`}
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
