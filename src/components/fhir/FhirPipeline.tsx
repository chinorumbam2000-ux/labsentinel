import type { PipelineStage, StageStatus } from '../../lib/fhirDemo';

/** Icon and word for each state, so status never depends on color alone. */
const STATUS: Record<StageStatus, { icon: string; word: string; tone: string }> = {
  pending: { icon: '○', word: 'Pending', tone: 'border-hairline bg-white text-muted' },
  success: { icon: '✓', word: 'Success', tone: 'border-severity-low/40 bg-severity-low/5 text-[#166534]' },
  warning: { icon: '!', word: 'Warning', tone: 'border-severity-moderate/50 bg-severity-moderate/10 text-[#92400E]' },
  failed: { icon: '✕', word: 'Failed', tone: 'border-severity-critical/40 bg-severity-critical/5 text-severity-critical' },
  skipped: { icon: '–', word: 'Not reached', tone: 'border-dashed border-hairline bg-canvas text-muted' },
};

/**
 * The ingestion pipeline, in the order the backend runs it. States come from
 * the actual ingestion response (see lib/fhirDemo.ts).
 */
export default function FhirPipeline({ stages }: { stages: PipelineStage[] }) {
  return (
    <ol className="space-y-1.5" aria-label="Ingestion pipeline">
      {stages.map((stage, index) => {
        const status = STATUS[stage.status];
        return (
          <li key={stage.key}>
            <div className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${status.tone}`}>
              <span aria-hidden="true" className="mt-0.5 w-4 shrink-0 text-center font-bold">
                {status.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold text-ink">
                  <span>{stage.label}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">{status.word}</span>
                </p>
                <p className="break-words text-xs text-muted">{stage.detail}</p>
              </div>
            </div>
            {index < stages.length - 1 ? (
              <p aria-hidden="true" className="py-0.5 text-center text-xs leading-none text-muted">
                ↓
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
