import type { FacilityFeedHealth, Hospital, HospitalId, HospitalMetrics } from '../../types';
import { formatMinutesAgo } from '../../lib/dataConfidence';
import { FEED_STATUS_STYLES } from '../common/FeedHealthCard';
import SeverityBadge from '../signals/SeverityBadge';

const STATUS_LABEL: Record<FacilityFeedHealth['status'], string> = {
  HEALTHY: 'Reporting',
  DELAYED: 'Delayed',
  DEGRADED: 'Degraded',
  OFFLINE: 'No data',
};

/**
 * Every participating facility at a glance: is it reporting, how fresh and
 * complete is its data, how well is it mapped to LOINC, and is it
 * contributing to the signal today.
 *
 * Reporting status comes from the app's simulated feed telemetry (the same
 * model Data Confidence uses); contribution comes from the day's facility
 * metrics. Nothing here asserts a live connection.
 */
export default function FacilityStatusOverview({
  facilities,
  feeds,
  metrics,
  selectedId,
  onSelect,
  positivityText = (_id, rate) => `${rate.toFixed(1)}%`,
}: {
  facilities: Hospital[];
  feeds: FacilityFeedHealth[];
  metrics: HospitalMetrics[];
  selectedId: HospitalId;
  onSelect: (id: HospitalId) => void;
  /** A facility's positivity as it may be shown: withheld ("<5") when its count is. */
  positivityText?: (id: HospitalId, rate: number) => string;
}) {
  const reporting = feeds.filter((feed) => feed.isReporting).length;
  const issues = feeds.filter((feed) => feed.status !== 'HEALTHY').length;

  return (
    <section aria-labelledby="facility-status-title" className="ls-card">
      <header className="ls-card-header">
        <div>
          <h2 id="facility-status-title" className="ls-card-title">Facility status</h2>
          <p className="mt-0.5 text-xs text-muted">
            {reporting} of {facilities.length} facilities reporting
            {issues > 0 ? ` · ${issues} with a feed issue` : ' · all feeds healthy'}
          </p>
        </div>
        <span className="ls-label">Simulated feed telemetry</span>
      </header>

      {/* Focusable, so the table can be scrolled sideways from the keyboard on narrow screens. */}
      <div className="w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Facility status table">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">Reporting status, data quality and signal contribution for each facility</caption>
          <thead className="border-b border-hairline bg-canvas">
            <tr>
              <th scope="col" className="ls-th">Facility</th>
              <th scope="col" className="ls-th">Status</th>
              <th scope="col" className="ls-th">Last event</th>
              <th scope="col" className="ls-th">Completeness</th>
              <th scope="col" className="ls-th">LOINC mapping</th>
              <th scope="col" className="ls-th">Signal contribution</th>
              <th scope="col" className="ls-th text-right">
                <span className="sr-only">Show details</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {facilities.map((facility) => {
              const feed = feeds.find((item) => item.hospitalId === facility.id);
              const site = metrics.find((item) => item.hospital.id === facility.id);
              const selected = facility.id === selectedId;
              return (
                <tr key={facility.id} className={selected ? 'bg-brand-light/50' : undefined}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <span className="block font-medium text-ink">{facility.name}</span>
                    <span className="block text-xs text-muted">
                      {facility.city}, {facility.state} {facility.zipCode}
                    </span>
                  </th>
                  <td className="ls-td">
                    {feed ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${FEED_STATUS_STYLES[feed.status].badge}`}>
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${FEED_STATUS_STYLES[feed.status].dot}`} />
                        {STATUS_LABEL[feed.status]}
                      </span>
                    ) : (
                      <span className="text-muted">Unknown</span>
                    )}
                  </td>
                  <td className="ls-td">{feed?.isReporting ? formatMinutesAgo(feed.minutesSinceLastEvent) : 'No data'}</td>
                  <td className="ls-td tabular-nums">{feed?.isReporting ? `${feed.completenessPercent.toFixed(1)}%` : '—'}</td>
                  <td className="ls-td tabular-nums">{feed?.isReporting ? `${feed.terminologyMappedPercent.toFixed(1)}%` : '—'}</td>
                  <td className="ls-td">
                    {site?.isAffected ? (
                      <span className="inline-flex items-center gap-2">
                        <SeverityBadge severity={site.severity} />
                        <span className="text-xs text-muted">{positivityText(site.hospital.id, site.positivityRate)} positive</span>
                      </span>
                    ) : (
                      <span className="text-muted">Not contributing</span>
                    )}
                  </td>
                  <td className="ls-td text-right">
                    <button
                      type="button"
                      onClick={() => onSelect(facility.id)}
                      aria-pressed={selected}
                      className={selected ? 'ls-btn-primary px-3 py-1.5 text-xs' : 'ls-btn px-3 py-1.5 text-xs'}
                    >
                      Details<span className="sr-only"> for {facility.name}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
