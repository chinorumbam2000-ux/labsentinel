import type { FacilityFeedHealth, Hospital } from '../../types';
import { formatMinutesAgo } from '../../lib/dataConfidence';

/**
 * How a facility's laboratory data reaches Signal by ProbeSyQ, for the reader who
 * wants it — collapsed by default, because it is not part of an analyst's
 * routine work.
 *
 * Every row is either a fixed fact about the synthetic data model or a value
 * the app actually holds (the simulated feed telemetry, today's observation
 * count). Nothing here claims a live interface, a sync or an engine run that
 * the app has not performed.
 */
export default function IntegrationDetails({
  facility,
  feed,
  observationsToday,
}: {
  facility: Hospital;
  feed: FacilityFeedHealth | undefined;
  observationsToday: number;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Source environment', value: facility.environmentLabel },
    { label: 'Record format', value: 'FHIR-style laboratory Observation (synthetic)' },
    { label: 'Test coding', value: feed?.isReporting ? `LOINC · ${feed.terminologyMappedPercent.toFixed(1)}% of results mapped` : 'LOINC' },
    { label: 'Observations received today', value: String(observationsToday) },
    { label: 'Last event received', value: feed?.isReporting ? formatMinutesAgo(feed.minutesSinceLastEvent) : 'No data currently available' },
  ];

  return (
    <details className="ls-card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="ls-card-title block">Integration details</span>
          <span className="mt-0.5 block text-xs text-muted">
            How {facility.name}&apos;s laboratory data reaches Signal by ProbeSyQ
          </span>
        </span>
        <span aria-hidden="true" className="text-sm text-muted transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <dl className="divide-y divide-hairline border-t border-hairline px-5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="text-right text-sm font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-hairline px-5 py-3 text-[11px] leading-snug text-muted">
        Synthetic data from a simulated environment. No live FHIR endpoint, vendor API or terminology service
        is contacted.
      </p>
    </details>
  );
}
