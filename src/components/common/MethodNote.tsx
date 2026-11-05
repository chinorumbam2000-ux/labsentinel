import type { ReactNode } from 'react';

/**
 * A short, collapsed note about how a score, measure or rule should be read
 * (for example that a model is illustrative and not validated). The text is
 * always one click away and always in the page for assistive technology; it
 * simply does not compete with the figures it explains.
 */
export default function MethodNote({
  children,
  label = 'About this score',
  className = '',
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-[11px] font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        {label}
      </summary>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{children}</p>
    </details>
  );
}
