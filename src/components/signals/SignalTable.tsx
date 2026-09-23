import type { OutbreakAlert } from '../../types';
import { formatSimulationDateTime } from '../../lib/format';
import SeverityBadge from './SeverityBadge';
import { EmptyState } from '../common/States';

interface SignalTableProps {
  alerts: OutbreakAlert[];
  onInvestigate: (alert: OutbreakAlert) => void;
  onAcknowledge: (alertId: string) => void;
}

const STATUS_STYLES: Record<OutbreakAlert['status'], string> = {
  New: 'bg-brand-light text-brand ring-1 ring-inset ring-brand/20',
  Active: 'bg-severity-high/10 text-[#C2410C] ring-1 ring-inset ring-severity-high/25',
  Acknowledged: 'bg-canvas text-muted ring-1 ring-inset ring-hairline',
};

export default function SignalTable({
  alerts,
  onInvestigate,
  onAcknowledge,
}: SignalTableProps) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon="✓"
        title="No alerts on this simulation day"
        message="Regional respiratory activity is at the expected baseline, so no LabSentinel alert has been raised. Advance the simulation day to watch alerts appear as the signal develops."
      />
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse">
        <caption className="sr-only">
          Alert history. Values shown are those recorded when each alert was detected.
        </caption>
        <thead className="border-b border-hairline bg-canvas">
          <tr>
            <th scope="col" className="ls-th">Detected (simulation)</th>
            <th scope="col" className="ls-th">Alert</th>
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
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-ink">{alert.title}</p>
                <p className="text-xs text-muted">{alert.detection.detail}</p>
              </td>
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
                  ) : null}
                  {alert.status === 'Acknowledged' ? (
                    <span className="text-xs text-muted">Acknowledged</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(alert.id)}
                      className="ls-btn px-3 py-1.5 text-xs"
                      aria-label={`Acknowledge alert: ${alert.title}, detected on simulation day ${alert.detectedDay}`}
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
