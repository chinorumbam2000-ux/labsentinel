/**
 * Shared loading / empty / error states.
 * Kept in one file so every page presents the same three states identically.
 */
import type { ReactNode } from 'react';

export function LoadingState({ label = 'Recalculating simulation state…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-hairline border-t-brand" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon = '◇',
  action,
}: {
  title: string;
  message: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-lg text-muted"
      >
        {icon}
      </span>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center"
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-severity-critical/10 text-lg text-severity-critical"
      >
        !
      </span>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="ls-btn mt-3">
          Retry
        </button>
      ) : null}
    </div>
  );
}
