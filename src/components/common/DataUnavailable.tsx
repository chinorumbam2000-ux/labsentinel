import BrandMark from './BrandMark';
import { ErrorState, LoadingState } from './States';

/**
 * Shown instead of the application while its data source cannot supply data:
 * loading on first connection, or the reason it failed. Nothing is shown from
 * any other source in the meantime — in API mode, silently falling back to the
 * prototype's local data would make it impossible to tell whether the backend
 * is actually working.
 */
export default function DataUnavailable({
  mode,
  label,
  message,
  onRetry,
}: {
  mode: 'local' | 'api';
  label: string;
  /** Null while loading. */
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="ls-card w-full max-w-lg">
        <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
          <BrandMark size={28} />
          <div>
            <p className="text-sm font-semibold text-ink">LabSentinel</p>
            <p className="text-xs text-muted">
              {mode === 'api' ? `API capstone mode · ${label}` : label}
            </p>
          </div>
        </div>
        {message === null ? (
          <LoadingState label="Connecting to the LabSentinel API…" />
        ) : (
          <>
            <ErrorState
              title="LabSentinel API is currently unavailable."
              message={message}
              onRetry={onRetry}
            />
            {mode === 'api' ? (
              <p className="border-t border-hairline px-5 py-4 text-xs text-muted">
                This build reads from the FastAPI backend and does not fall back to other
                data. Start the backend (see backend/README.md), or run the standalone
                synthetic demo with <code className="font-mono">VITE_DATA_SOURCE=local</code>.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
