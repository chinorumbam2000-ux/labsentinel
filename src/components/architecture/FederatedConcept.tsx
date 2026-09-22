import { useSimulation } from '../../context/SimulationContext';
import { HOSPITALS } from '../../data/hospitals';
import {
  FEDERATED_NOTE,
  FUTURE_CONCEPT_LABEL,
  buildExampleAggregatePayload,
} from '../../lib/surveillanceSources';
import StatusBadge from './StatusBadge';

/**
 * Federated surveillance — a FUTURE concept.
 *
 * Under the current prototype, record-level synthetic Observations flow to a
 * central signal engine. Under a federated model each facility would compute
 * its own aggregate locally and share only that, so patient-level data never
 * needs to leave the organisation.
 *
 * Nothing here is wired into the running pipeline. The sample payload is
 * rendered from existing synthetic data purely to show the shape.
 */
export default function FederatedConcept() {
  const { currentDay } = useSimulation();
  const payload = buildExampleAggregatePayload(currentDay, 'HOSP-A');

  return (
    <section className="ls-card" aria-label="Federated surveillance concept">
      <header className="ls-card-header">
        <div>
          <h3 className="ls-card-title">Federated Surveillance</h3>
          <p className="mt-0.5 text-xs text-muted">{FUTURE_CONCEPT_LABEL}</p>
        </div>
        <StatusBadge status="FUTURE" />
      </header>

      <div className="p-5">
        <p className="text-sm leading-relaxed text-ink">{FEDERATED_NOTE}</p>

        {/* Three parallel local pipelines feeding one regional layer. */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {HOSPITALS.map((hospital) => (
            <div
              key={hospital.id}
              className="rounded-xl border border-dashed border-muted/30 p-3"
            >
              <p className="text-sm font-semibold text-muted">{hospital.name}</p>
              <p className="text-[11px] text-muted">{hospital.vendor}</p>
              <div aria-hidden="true" className="py-1.5 text-center text-muted/50">
                ↓
              </div>
              <p className="rounded-lg bg-canvas px-2.5 py-2 text-xs font-medium text-ink">
                Local processing
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Aggregates computed inside the organisation. Patient-level records
                stay put.
              </p>
              <div aria-hidden="true" className="py-1.5 text-center text-muted/50">
                ↓
              </div>
              <p className="rounded-lg bg-canvas px-2.5 py-2 text-xs font-medium text-ink">
                Aggregated surveillance signal
              </p>
            </div>
          ))}
        </div>

        <div aria-hidden="true" className="py-2 text-center text-lg text-muted/50">
          ↓
        </div>

        <div className="rounded-xl border border-dashed border-muted/40 bg-canvas px-4 py-3 text-center">
          <p className="text-sm font-semibold text-ink">
            Regional LabSentinel Surveillance Layer
          </p>
          <p className="mt-1 text-xs text-muted">
            Correlates aggregates across facilities. Never receives record-level data
            under this model.
          </p>
        </div>

        {/* Example payload */}
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="ls-label">Example future aggregated signal payload</p>
            <StatusBadge status="FUTURE" />
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-sidebar p-4 text-[11px] leading-relaxed text-white/90">
            <code>{JSON.stringify(payload, null, 2)}</code>
          </pre>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Illustrative only, rendered from the current synthetic data for Day{' '}
            {currentDay}. It is not produced or consumed by the running prototype, and
            the existing synthetic Observation pipeline is unchanged.
          </p>
        </div>

        <div className="mt-5 rounded-lg border border-dashed border-muted/40 bg-canvas p-4">
          <p className="text-xs font-semibold text-ink">
            What would still need solving
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-relaxed text-muted">
            <li>
              Aggregates can still leak: small local counts need the same suppression
              rules applied before they leave a facility, not after.
            </li>
            <li>
              Every site would have to run the same anomaly logic and the same version
              of it, or the regional layer is comparing incomparable numbers.
            </li>
            <li>
              Local computation makes central re-analysis impossible, so a question
              nobody anticipated cannot be answered retrospectively.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
