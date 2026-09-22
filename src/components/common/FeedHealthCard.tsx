import type { FacilityFeedHealth, FeedStatus } from '../../types';
import { formatSimulationDateTime } from '../../lib/format';
import { formatMinutesAgo } from '../../lib/dataConfidence';

const STATUS_STYLES: Record<FeedStatus, { badge: string; dot: string }> = {
  HEALTHY: {
    badge: 'bg-severity-low/10 text-[#166534] ring-1 ring-inset ring-severity-low/25',
    dot: 'bg-severity-low',
  },
  DELAYED: {
    badge: 'bg-severity-watch/15 text-[#9A7B0A] ring-1 ring-inset ring-severity-watch/40',
    dot: 'bg-severity-watch',
  },
  DEGRADED: {
    badge: 'bg-severity-high/10 text-[#C2410C] ring-1 ring-inset ring-severity-high/30',
    dot: 'bg-severity-high',
  },
  OFFLINE: {
    badge: 'bg-muted/10 text-muted ring-1 ring-inset ring-muted/30',
    dot: 'bg-muted',
  },
};

interface FeedHealthCardProps {
  feeds: FacilityFeedHealth[];
  /** Compact drops the per-facility metric grid. */
  compact?: boolean;
  title?: string;
  className?: string;
}

/**
 * Facility feed health.
 *
 * The critical rule: an OFFLINE feed reads "No data currently available",
 * never "no abnormal activity detected". In surveillance, silence from a
 * facility is missing information, not reassurance — conflating the two is how
 * an outbreak gets missed.
 */
export default function FeedHealthCard({
  feeds,
  compact = false,
  title = 'Facility Feed Health',
  className = '',
}: FeedHealthCardProps) {
  const offline = feeds.filter((feed) => !feed.isReporting);
  const reporting = feeds.length - offline.length;

  return (
    <section className={`ls-card ${className}`} aria-label="Facility feed health">
      <header className="ls-card-header">
        <h2 className="ls-card-title">{title}</h2>
        <span className="ls-label">
          {reporting} of {feeds.length} reporting
        </span>
      </header>

      {offline.length > 0 ? (
        <div
          role="status"
          className="border-b border-hairline bg-canvas px-5 py-3 text-xs leading-relaxed text-ink"
        >
          <span className="font-semibold">No data currently available</span> from{' '}
          {offline.map((feed) => feed.facilityName).join(', ')}. Regional figures below
          describe only the facilities still reporting. A silent feed means the situation
          at that facility is <span className="font-semibold">unknown</span> — it does not
          mean no abnormal activity was detected there.
        </div>
      ) : null}

      <ul className="divide-y divide-hairline">
        {feeds.map((feed) => {
          const styles = STATUS_STYLES[feed.status];
          return (
            <li key={feed.hospitalId} className="px-5 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {feed.facilityName}
                  </p>
                  <p className="text-[11px] text-muted">
                    {feed.vendor} · {feed.hospitalId}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${styles.badge}`}
                >
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                  {feed.status}
                </span>
              </div>

              {feed.isReporting ? (
                <>
                  <p className="mt-1.5 text-xs text-muted">
                    Last event {formatMinutesAgo(feed.minutesSinceLastEvent)} ·{' '}
                    {feed.eventsReceived.toLocaleString('en-US')} events · {feed.note}
                  </p>

                  {!compact ? (
                    <dl className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-canvas px-2.5 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                          Mapped
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                          {feed.terminologyMappedPercent}%
                        </dd>
                      </div>
                      <div className="rounded-lg bg-canvas px-2.5 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                          Complete
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                          {feed.completenessPercent}%
                        </dd>
                      </div>
                      <div className="rounded-lg bg-canvas px-2.5 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                          Failed / dup
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                          {feed.failedEvents} / {feed.duplicateEvents}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-canvas px-2.5 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                          Latency
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                          {feed.latencySeconds}s
                        </dd>
                      </div>
                    </dl>
                  ) : null}

                  <p className="mt-1.5 text-[11px] text-muted">
                    Last event at {formatSimulationDateTime(feed.lastEventAt)} (simulation
                    time)
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-xs font-medium text-ink">
                  No data currently available — status at this facility is unknown.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="border-t border-hairline px-5 py-3 text-[11px] leading-snug text-muted">
        Simulated feed telemetry. Deterministic synthetic values — no live interface
        engine is monitored by this prototype.
      </p>
    </section>
  );
}
