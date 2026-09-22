import type { ArchitectureStatus } from '../../types';

/**
 * Status badges for the architecture page.
 *
 * The colour separation matters: IMPLEMENTED and PROTOTYPE are solid and
 * confident; PLANNED and FUTURE are deliberately muted and outlined, so
 * nothing that does not exist yet can be mistaken at a glance for something
 * that does.
 */
const STYLES: Record<ArchitectureStatus, string> = {
  IMPLEMENTED:
    'bg-severity-low/10 text-severity-low ring-1 ring-inset ring-severity-low/30',
  PROTOTYPE: 'bg-brand-light text-brand ring-1 ring-inset ring-brand/25',
  PLANNED:
    'bg-transparent text-muted ring-1 ring-inset ring-dashed ring-muted/40 border border-dashed border-muted/40',
  FUTURE:
    'bg-transparent text-muted ring-1 ring-inset ring-dashed ring-muted/30 border border-dashed border-muted/30 italic',
};

export const STATUS_MEANING: Record<ArchitectureStatus, string> = {
  IMPLEMENTED: 'Built and working in this prototype.',
  PROTOTYPE: 'Built, but with synthetic data and simplified logic.',
  PLANNED: 'Not built. Scoped for the next development stage.',
  FUTURE: 'Not built. A longer-term architectural direction.',
};

export default function StatusBadge({
  status,
  className = '',
}: {
  status: ArchitectureStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${STYLES[status]} ${className}`}
      title={STATUS_MEANING[status]}
    >
      {status}
    </span>
  );
}

/** The key, so the badges are self-explanatory on the page. */
export function StatusLegend({ className = '' }: { className?: string }) {
  return (
    <dl className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`}>
      {(Object.keys(STATUS_MEANING) as ArchitectureStatus[]).map((status) => (
        <div key={status} className="rounded-lg bg-canvas p-3">
          <dt>
            <StatusBadge status={status} />
          </dt>
          <dd className="mt-1.5 text-xs leading-relaxed text-muted">
            {STATUS_MEANING[status]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
