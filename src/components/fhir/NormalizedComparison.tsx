import type { IngestionOutcome, NormalizedObservation } from '../../data-access/fhirIngestion';
import type { SourceSummary } from '../../lib/fhirDemo';

export interface FacilityInfo {
  name: string;
  vendor: string;
}

const Row = ({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) => (
  <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 py-1">
    <dt className="text-xs text-muted">{label}</dt>
    <dd className={`break-words text-xs text-ink ${mono ? 'font-mono' : ''}`}>{value || '—'}</dd>
  </div>
);

const formatTime = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : `${date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'America/New_York' })} ET`;
};

const resultText = (record: NormalizedObservation) =>
  record.result_type === 'quantity'
    ? `${record.result_value} ${record.result_unit ?? ''}`.trim()
    : (record.result_value ?? '—');

/**
 * SOURCE FHIR next to the NORMALIZED LABSENTINEL RECORD, with the terminology,
 * facility and time explanations. Every normalized value shown comes from
 * the stored record returned by GET /api/observations/{id}.
 */
export default function NormalizedComparison({
  source,
  record,
  outcome,
  facility,
}: {
  source: SourceSummary | null;
  record: NormalizedObservation;
  outcome: IngestionOutcome;
  facility: FacilityInfo | null;
}) {
  const environment = facility ? `Simulated ${facility.vendor} Environment` : null;
  const mapped = record.terminology_status === 'mapped';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-2">
        <section aria-labelledby="source-fhir" className="rounded-lg border border-hairline bg-canvas p-3">
          <h3 id="source-fhir" className="ls-label">
            Source FHIR
          </h3>
          <dl className="mt-1">
            <Row label="Resource" value={outcome.resource} mono />
            <Row label="Code (LOINC)" value={source?.loinc ? `${source.loinc.code} — ${source.loinc.display ?? ''}` : null} />
            <Row label="Value" value={source?.value} />
            <Row label="Effective" value={source?.effective} mono />
            <Row label="Performer" value={source?.performer} />
            <Row label="Subject" value={source ? `${source.subject} (not stored)` : null} mono />
          </dl>
        </section>

        <section aria-labelledby="normalized-record" className="rounded-lg border border-brand/30 bg-brand-light p-3">
          <h3 id="normalized-record" className="ls-label">
            Normalized LabSentinel record
          </h3>
          <dl className="mt-1">
            <Row label="Observation" value={`#${record.id}`} mono />
            <Row label="Source observation ID" value={record.source_observation_id} mono />
            <Row label="Facility" value={facility ? `${facility.name} (${outcome.facility_code})` : outcome.facility_code} />
            <Row label="Source system" value={record.source_system} mono />
            <Row label="Synthetic patient ref." value={record.patient_reference} mono />
            <Row label="Syndrome" value={record.syndrome ?? 'None — LOINC not mapped'} />
            <Row label="Test name" value={record.test_name} />
            <Row label="LOINC code" value={record.loinc_code} mono />
            <Row label="Result" value={resultText(record)} />
            <Row label="Effective time" value={formatTime(record.effective_datetime)} />
            <Row label="Received time" value={formatTime(record.received_datetime)} />
            <Row label="Geographic unit" value={record.geographic_unit} mono />
            <Row label="FHIR status" value={record.status} />
          </dl>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section aria-labelledby="terminology-card" className="rounded-lg border border-hairline p-3">
          <h3 id="terminology-card" className="ls-label">
            Terminology
          </h3>
          <p className="mt-1 text-xs text-muted">FHIR coding</p>
          <p className="break-words font-mono text-xs text-ink">system: {source?.loinc?.system ?? '—'}</p>
          <p className="font-mono text-xs text-ink">code: {record.loinc_code}</p>
          <p className="break-words text-xs text-ink">display: {record.code_display ?? source?.loinc?.display ?? '—'}</p>
          <p aria-hidden="true" className="my-1 text-center text-xs text-muted">↓</p>
          <p className="text-xs text-muted">LabSentinel</p>
          {mapped ? (
            <>
              <p className="text-xs text-ink">Normalized test: <strong>{record.test_name}</strong></p>
              <p className="text-xs text-ink">Surveillance syndrome: <strong>{record.syndrome}</strong></p>
            </>
          ) : (
            <p className="text-xs text-ink">
              <strong>Not mapped.</strong> Stored with no syndrome for terminology review; no syndrome is guessed.
            </p>
          )}
        </section>

        <section aria-labelledby="facility-card" className="rounded-lg border border-hairline p-3">
          <h3 id="facility-card" className="ls-label">
            Facility resolution
          </h3>
          <p className="mt-1 text-xs text-ink">{outcome.facility_resolution ?? '—'}</p>
          <p aria-hidden="true" className="my-1 text-center text-xs text-muted">↓ Facility resolver ↓</p>
          <p className="text-xs font-semibold text-ink">{facility?.name ?? outcome.facility_code}</p>
          {environment ? <p className="text-xs text-ink">{environment}</p> : null}
          <p className="mt-2 text-[11px] text-muted">
            Facility mappings are synthetic development configuration and do not represent live vendor
            connectivity.
          </p>
        </section>

        <section aria-labelledby="time-card" className="rounded-lg border border-hairline p-3">
          <h3 id="time-card" className="ls-label">
            Effective vs received time
          </h3>
          <p className="mt-1 text-xs font-semibold text-ink">Effective time</p>
          <p className="text-xs text-ink">{formatTime(record.effective_datetime)}</p>
          <p className="text-[11px] text-muted">When the synthetic laboratory event occurred.</p>
          <p className="mt-2 text-xs font-semibold text-ink">Received time</p>
          <p className="text-xs text-ink">{formatTime(record.received_datetime) ?? 'Not recorded'}</p>
          <p className="text-[11px] text-muted">When LabSentinel ingested the FHIR resource.</p>
        </section>
      </div>
    </div>
  );
}
