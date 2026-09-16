import type { Severity } from '../../types';
import { SEVERITY_STYLES } from '../../lib/format';

interface SeverityBadgeProps {
  severity: Severity;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export default function SeverityBadge({
  severity,
  size = 'sm',
  showDot = true,
}: SeverityBadgeProps) {
  const styles = SEVERITY_STYLES[severity];
  const sizing =
    size === 'md'
      ? 'px-3 py-1 text-xs tracking-[0.06em]'
      : 'px-2 py-0.5 text-[11px] tracking-[0.05em]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase ${sizing} ${styles.badge}`}
    >
      {showDot ? (
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${styles.accent}`} />
      ) : null}
      {severity}
    </span>
  );
}
