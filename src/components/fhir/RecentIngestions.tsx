import type { NormalizedObservation } from '../../data-access/fhirIngestion';
import { EmptyState, ErrorState, LoadingState } from '../common/States';

export type RecentState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: NormalizedObservation[] };

const received = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'America/New_York',
      })
    : '—';

/** The latest FHIR-ingested observations (GET /api/observations?origin=fhir). */
export default function RecentIngestions({
  state,
  facilityName,
  onRetry,
}: {
  state: RecentState;
  facilityName: (facilityId: number) => string;
  onRetry: () => void;
}) {
  if (state.status === 'loading') return <LoadingState label="Loading recent FHIR ingestions…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={onRetry} />;
  if (state.rows.length === 0) {
    return (
      <EmptyState
        icon="⇄"
        title="No FHIR ingestions yet"
        message="Ingest a synthetic example to see it here."
      />
    );
  }
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <caption className="sr-only">Most recently ingested FHIR observations</caption>
        <thead className="border-b border-hairline bg-canvas">
          <tr>
            {['Received (ET)', 'Facility', 'Test', 'LOINC', 'Result', 'Source ID', 'Status'].map((label) => (
              <th key={label} scope="col" className="ls-th">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {state.rows.map((row) => (
            <tr key={row.id}>
              <td className="ls-td whitespace-nowrap text-muted">{received(row.received_datetime)}</td>
              <td className="ls-td">{facilityName(row.facility_id)}</td>
              <td className="ls-td">{row.test_name}</td>
              <td className="ls-td font-mono text-xs text-muted">{row.loinc_code}</td>
              <td className="ls-td">
                {row.result_type === 'quantity' ? `${row.result_value} ${row.result_unit ?? ''}` : row.result_value}
              </td>
              <td className="ls-td font-mono text-xs">{row.source_observation_id}</td>
              <td className="ls-td text-muted">
                {row.status}
                {row.terminology_status === 'unmapped' ? ' · unmapped' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
