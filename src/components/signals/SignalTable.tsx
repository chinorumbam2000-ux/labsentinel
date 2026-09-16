import type { OutbreakAlert } from '../../types';
import { formatDateTime } from '../../lib/format';
import SeverityBadge from './SeverityBadge';
import { EmptyState } from '../common/States';

interface SignalTableProps {
  alerts: OutbreakAlert[];
  onInvestigate: (alert: OutbreakAlert) => void;
}

export default function SignalTable({ alerts, onInvestigate }: SignalTableProps) {
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
      <table className="w-full min-w-[820px] border-collapse">
        <thead className="border-b border-hairline bg-canvas">
          <tr>
            <th scope="col" className="ls-th">Time</th>
            <th scope="col" className="ls-th">Alert</th>
            <th scope="col" className="ls-th">Severity</th>
            <th scope="col" className="ls-th">Geography</th>
            <th scope="col" className="ls-th">Facilities</th>
            <th scope="col" className="ls-th">Status</th>
            <th scope="col" className="ls-th text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {alerts.map((alert) => (
            <tr
              key={alert.id}
              className={`transition-colors hover:bg-canvas ${
                alert.investigable ? 'cursor-pointer' : ''
              }`}
              onClick={alert.investigable ? () => onInvestigate(alert) : undefined}
            >
              <td className="ls-td text-muted">{formatDateTime(alert.time)}</td>
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-ink">{alert.title}</p>
                <p className="text-xs text-muted">{alert.detail}</p>
              </td>
              <td className="ls-td">
                <SeverityBadge severity={alert.severity} />
              </td>
              <td className="ls-td text-muted">{alert.geography}</td>
              <td className="ls-td text-muted">{alert.facilities}</td>
              <td className="ls-td">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${
                    alert.status === 'NEW'
                      ? 'bg-brand-light text-brand ring-1 ring-inset ring-brand/20'
                      : 'bg-canvas text-muted ring-1 ring-inset ring-hairline'
                  }`}
                >
                  {alert.status}
                </span>
              </td>
              <td className="ls-td text-right">
                {alert.investigable ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onInvestigate(alert);
                    }}
                    className="ls-btn px-3 py-1.5 text-xs"
                  >
                    Investigate
                  </button>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
