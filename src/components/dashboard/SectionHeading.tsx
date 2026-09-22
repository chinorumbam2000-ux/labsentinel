import type { ReactNode } from 'react';

interface SectionHeadingProps {
  /** Section number, shown as a quiet ordinal so the page reads in order. */
  index: number;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  id: string;
}

/**
 * One consistent heading treatment for every dashboard section, so the page
 * scans as a sequence rather than a pile of cards.
 */
export default function SectionHeading({
  index,
  title,
  subtitle,
  action,
  id,
}: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="ls-label">Section {index}</p>
        <h2 id={id} className="mt-0.5 text-base font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
