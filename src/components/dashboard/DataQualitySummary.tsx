import type { DataConfidenceResult, FacilityFeedHealth } from '../../types';
import { formatMinutesAgo } from '../../lib/dataConfidence';

interface DataQualitySummaryProps {
  confidence: DataConfidenceResult;
  feeds: FacilityFeedHealth[];
}

/**
 * Section 4 at a glance. Five tiles that answer "can I rely on today's
 * numbers?" without making the reader open anything; the per-facility detail
 * sits behind a disclosure beneath it.
 */
export default function DataQualitySummary({
  confidence,
  feeds,
}: DataQualitySummaryProps) {
  const healthy = feeds.filter((feed) => feed.status === 'HEALTHY').length;
  const offline = feeds.filter((feed) => !feed.isReporting).length;
  const notHealthy = feeds.length - healthy;

  const tiles = [
    {
      label: 'Facilities Reporting',
      value: `${confidence.facilitiesReporting} / ${confidence.facilitiesTotal}`,
      note:
        offline > 0
          ? `${offline} offline — no data currently available`
          : 'All participating facilities delivering',
      tone: offline > 0 ? 'warn' : 'normal',
    },
    {
      label: 'Facility Feed Health',
      value: `${healthy} healthy`,
      note:
        notHealthy === 0
          ? 'No delayed or degraded feeds'
          : `${notHealthy} delayed or degraded`,
      tone: notHealthy > 0 ? 'warn' : 'normal',
    },
    {
      label: 'LOINC Mapping Quality',
      value: `${confidence.terminologyMappedPercent.toFixed(1)}%`,
      note: 'Weighted by events delivered per feed',
      tone: 'normal',
    },
    {
      label: 'Data Completeness',
      value: `${confidence.completenessPercent.toFixed(1)}%`,
      note: 'Required fields populated',
      tone: 'normal',
    },
    {
      label: 'Last Event Received',
      value:
        confidence.freshestMinutes < 0
          ? 'None'
          : formatMinutesAgo(confidence.freshestMinutes),
      note:
        confidence.totalIssues === 0
          ? 'No failed or duplicate events'
          : `${confidence.totalIssues} failed or duplicate events`,
      tone: confidence.freshestMinutes < 0 ? 'warn' : 'normal',
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className="ls-card p-4">
          <p className="ls-label">{tile.label}</p>
          <p className="mt-2 text-2xl font-semibold leading-none tabular-nums text-ink">
            {tile.value}
          </p>
          <p
            className={`mt-2 text-[11px] leading-snug ${
              tile.tone === 'warn' ? 'font-medium text-[#B45309]' : 'text-muted'
            }`}
          >
            {tile.note}
          </p>
        </div>
      ))}
    </div>
  );
}
