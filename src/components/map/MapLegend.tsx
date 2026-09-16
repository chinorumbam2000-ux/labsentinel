import type { Severity } from '../../types';
import { SEVERITY_COLORS } from '../../lib/format';

const BANDS: Array<{ severity: Severity; range: string }> = [
  { severity: 'Low', range: '0–19' },
  { severity: 'Watch', range: '20–39' },
  { severity: 'Moderate', range: '40–64' },
  { severity: 'High', range: '65–84' },
  { severity: 'Critical', range: '85–100' },
];

export default function MapLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-lg border border-hairline bg-white/95 p-3 shadow-card backdrop-blur">
      <p className="ls-label">Severity</p>
      <ul className={`mt-2 ${compact ? 'flex flex-wrap gap-x-3 gap-y-1' : 'space-y-1.5'}`}>
        {BANDS.map((band) => (
          <li key={band.severity} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: SEVERITY_COLORS[band.severity] }}
            />
            <span className="font-medium text-ink">{band.severity}</span>
            {!compact ? (
              <span className="ml-auto tabular-nums text-muted">{band.range}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
