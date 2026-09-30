import { MODES, type AppMode } from '../../lib/appModes';

/**
 * Names the concept the current screen belongs to (Classroom Demo, Dynamic
 * Surveillance, ...). The label is always written out, so the mode never
 * depends on colour alone.
 */
export default function ModeChip({ mode, withDescription = false }: { mode: AppMode; withDescription?: boolean }) {
  const definition = MODES[mode];
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${definition.chip}`}
        title={definition.description}
        data-mode={mode}
      >
        <span className="sr-only">Current mode: </span>
        {definition.label}
      </span>
      {withDescription ? (
        <span className="hidden truncate text-xs text-muted md:inline">{definition.description}</span>
      ) : null}
    </span>
  );
}
