import type { PrivacyResult } from '../../types';
import { PRIVACY_DISCLAIMER, PRIVACY_TOOLTIP } from '../../lib/geographicPrivacy';

/**
 * Renders a geographic count that may have been suppressed.
 *
 * A suppressed value is never rendered as 0 or as a blank — it shows "<5" and
 * says why. Rendering it as zero would read as "nothing happening here", which
 * is precisely the wrong conclusion.
 */
export function PrivacyValue({
  privacy,
  className = '',
}: {
  privacy: PrivacyResult;
  className?: string;
}) {
  if (!privacy.suppressed) {
    return <span className={className}>{privacy.displayValue}</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={`${privacy.explanation} ${PRIVACY_TOOLTIP}`}
    >
      <span className="font-semibold text-muted">{privacy.displayValue}</span>
      <abbr
        title={PRIVACY_TOOLTIP}
        className="cursor-help text-[10px] font-semibold uppercase tracking-[0.05em] text-muted no-underline"
      >
        suppressed
      </abbr>
    </span>
  );
}

/** The standing explanation of the rule, for use under a table or panel. */
export function PrivacyNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-snug text-muted ${className}`}>
      {PRIVACY_TOOLTIP} {PRIVACY_DISCLAIMER}
    </p>
  );
}

/** A per-day summary of what is currently being withheld and why. */
export function PrivacyDisclosure({
  summary,
  className = '',
}: {
  summary: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-canvas px-4 py-3 ${className}`}
      role="note"
    >
      <p className="ls-label">Geographic disclosure</p>
      <p className="mt-1 text-xs leading-relaxed text-ink">{summary}</p>
      <PrivacyNote className="mt-1.5" />
    </div>
  );
}
