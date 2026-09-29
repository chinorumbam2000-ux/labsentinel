import { useEffect, useState, type ReactNode } from 'react';
import BrandMark from '../common/BrandMark';
import { SMART_STATUS, type SmartStatus, type TechnicalDetail } from '../../smart/context';

const STATUS_TONE: Record<SmartStatus, string> = {
  'not-configured': 'border-hairline bg-canvas text-muted',
  ready: 'border-hairline bg-white text-ink',
  authorizing: 'border-brand/30 bg-brand-light text-brand-dark',
  connected: 'border-severity-low/40 bg-severity-low/5 text-[#166534]',
  denied: 'border-severity-critical/40 bg-severity-critical/5 text-severity-critical',
  'server-error': 'border-severity-critical/40 bg-severity-critical/5 text-severity-critical',
  expired: 'border-severity-moderate/50 bg-severity-moderate/10 text-[#92400E]',
  'config-error': 'border-severity-critical/40 bg-severity-critical/5 text-severity-critical',
};

/** SMART connection state as icon + words (never color alone). */
export function SmartStatusBadge({ status }: { status: SmartStatus }) {
  const { icon, label } = SMART_STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

/** A full-screen state for the launch and callback routes (outside the app shell). */
export function SmartFrame({
  status,
  title,
  children,
}: {
  status: SmartStatus;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="ls-card w-full max-w-lg">
        <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
          <BrandMark size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">LabSentinel · SMART on FHIR Sandbox</p>
            <p className="text-xs text-muted">Synthetic sandbox data only</p>
          </div>
          <SmartStatusBadge status={status} />
        </div>
        <div className="space-y-3 px-5 py-5" role={status === 'authorizing' ? 'status' : 'alert'} aria-live="polite">
          <h1 className="text-base font-semibold text-ink">{title}</h1>
          <p className="text-sm text-muted">{SMART_STATUS[status].message}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Expandable, token-free technical details. */
export function SmartTechnicalDetails({
  details,
  open,
  onToggle,
}: {
  details: TechnicalDetail[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-lg border border-hairline">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="smart-technical-details"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-canvas"
      >
        SMART technical details
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div id="smart-technical-details" className="border-t border-hairline px-3 py-2">
          <dl>
            {details.map((detail) => (
              <div key={detail.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 py-1">
                <dt className="text-xs text-muted">{detail.label}</dt>
                <dd className="break-words font-mono text-xs text-ink">{detail.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-muted">
            Tokens, authorization codes and PKCE verifiers are never displayed or logged.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Loads SMART discovery (public metadata) for the technical panel. */
export function useSmartDiscovery(serverUrl: string | null, enabled: boolean) {
  const [discovery, setDiscovery] = useState<{ pkceMethods: string[] | null } | null>(null);
  useEffect(() => {
    if (!serverUrl || !enabled) return undefined;
    const controller = new AbortController();
    fetch(`${serverUrl.replace(/\/+$/, '')}/.well-known/smart-configuration`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((document: { code_challenge_methods_supported?: unknown } | null) => {
        if (controller.signal.aborted) return;
        const methods = document?.code_challenge_methods_supported;
        setDiscovery({ pkceMethods: Array.isArray(methods) ? methods.map(String) : null });
      })
      .catch(() => {
        if (!controller.signal.aborted) setDiscovery({ pkceMethods: null });
      });
    return () => controller.abort();
  }, [serverUrl, enabled]);
  return discovery;
}
