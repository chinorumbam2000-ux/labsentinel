import { COPYRIGHT_NOTICE, TRADEMARK_NOTICE } from '../../lib/brand';

/**
 * The portfolio's ownership notice: small, and only on the sign-in footer and
 * in About this data — never on the analyst working screens.
 */
export default function OwnershipNotice({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-snug text-muted ${className}`} data-testid="ownership-notice">
      {TRADEMARK_NOTICE} {COPYRIGHT_NOTICE}
    </p>
  );
}
