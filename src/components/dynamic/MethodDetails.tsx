import type { ReactNode } from 'react';

/**
 * "View method details": where the statistical methods' formulas, parameters
 * (λ, k, h), control limits and reference periods live. Collapsed by default,
 * so an analyst reads the result first; nothing inside is removed.
 */
export default function MethodDetails({
  children,
  label = 'View method details',
  className = '',
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-semibold text-brand hover:underline [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
