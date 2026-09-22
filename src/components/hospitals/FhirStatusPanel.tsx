import type { VendorName } from '../../types';
import { formatClockTime } from '../../lib/format';

interface FhirStatusPanelProps {
  vendor: VendorName;
  lastUpdated: Date;
  observationCount: number;
}

/**
 * The same interoperability contract, reported identically for every vendor.
 * Only the vendor name differs — which is the entire point.
 */
export default function FhirStatusPanel({
  vendor,
  lastUpdated,
  observationCount,
}: FhirStatusPanelProps) {
  const rows: Array<{ label: string; value: string; verified?: boolean }> = [
    { label: 'Vendor', value: vendor },
    { label: 'FHIR Resource', value: 'Observation' },
    { label: 'FHIR Status', value: 'Received', verified: true },
    { label: 'Terminology', value: 'LOINC', verified: true },
    { label: 'Normalization', value: 'Complete', verified: true },
    { label: 'Signal Engine', value: 'Updated', verified: true },
    { label: 'Last Sync', value: formatClockTime(lastUpdated) },
  ];

  return (
    <section className="ls-card">
      <header className="ls-card-header">
        <h2 className="ls-card-title">Interoperability Status</h2>
        <span className="ls-label">
          {observationCount} simulated {observationCount === 1 ? 'resource' : 'resources'}
        </span>
      </header>
      <dl className="divide-y divide-hairline px-5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              {row.value}
              {row.verified ? (
                <span aria-label="verified" className="text-[#166534]">
                  ✓
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="px-5 pb-4 pt-3 text-[11px] leading-snug text-muted">
        Simulated interoperability status. No live FHIR endpoint, vendor API or
        production terminology service is contacted by this prototype.
      </p>
    </section>
  );
}
