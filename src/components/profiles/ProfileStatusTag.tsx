import type { ProfileStatus } from '../../lib/profiles/derive';
import { STATUS_LABEL } from '../../lib/profiles/derive';

/**
 * A profile's status as words (never colour alone). Missing data and a
 * missing baseline look deliberately different from "within expected range".
 */
const STYLE: Record<ProfileStatus, { className: string; mark: string }> = {
  ACTIVE_SIGNAL: { className: 'border-severity-critical/40 bg-severity-critical/5 text-ink', mark: '▲' },
  WITHIN_EXPECTED_RANGE: { className: 'border-severity-low/40 bg-severity-low/5 text-[#166534]', mark: '✓' },
  INSUFFICIENT_BASELINE: { className: 'border-dashed border-muted/60 bg-white text-muted', mark: '◌' },
  NO_DATA: { className: 'border-dashed border-muted/60 bg-white text-muted', mark: '–' },
  INACTIVE: { className: 'border-hairline bg-white text-muted', mark: '○' },
};

export default function ProfileStatusTag({ status }: { status: ProfileStatus }) {
  const style = STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.className}`}
    >
      <span aria-hidden="true">{style.mark}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
