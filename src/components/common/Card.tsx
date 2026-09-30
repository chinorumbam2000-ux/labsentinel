import type { ReactNode } from 'react';

interface CardProps {
  /** Optional anchor, e.g. for Presentation Mode's scroll-to-step. */
  id?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** The standard white rounded card used across every page. */
export default function Card({
  id,
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = 'p-5',
}: CardProps) {
  return (
    <section id={id} className={`ls-card flex flex-col scroll-mt-4 ${className}`}>
      {title ? (
        <header className="ls-card-header">
          <div className="min-w-0">
            <h2 className="ls-card-title">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
