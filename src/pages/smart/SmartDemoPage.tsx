/**
 * /smart-demo — SMART on FHIR Sandbox (inside the app shell).
 *
 * Explains the sandbox launch, shows the configuration LabSentinel will use
 * (no secrets exist to show), starts a Standalone launch, and gives the exact
 * SMART Health IT launcher link for an EHR launch — the launcher, acting as
 * the EHR, must start that one; LabSentinel does not pretend to.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import { SmartStatusBadge } from '../../components/smart/SmartParts';
import { SMART_BUILD_CONFIG, SMART_HEALTH_IT_LAUNCHER, type SmartEnabledConfig } from '../../smart/config';
import { beginStandaloneLaunch, hasStoredSession } from '../../smart/client';
import { SMART_STATUS, type SmartStatus } from '../../smart/context';
import { ehrScope, standaloneScope } from '../../smart/launch';

export const SMART_DISCLAIMER =
  'SMART sandbox integration demonstrates standards-based launch and FHIR access using synthetic data. It is not a live Epic, Oracle Health or MEDITECH production connection.';

/** The SMART Health IT launcher, prefilled with LabSentinel's launch URL (R4, provider EHR launch). */
export const launcherLink = (launchUri: string): string =>
  `${SMART_HEALTH_IT_LAUNCHER}?launch_url=${encodeURIComponent(launchUri)}&fhir_version=r4`;

export default function SmartDemoPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">SMART on FHIR Sandbox</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          This demonstration launches LabSentinel using the SMART App Launch standard against synthetic sandbox
          FHIR data.
        </p>
      </header>
      <p role="note" className="rounded-lg border border-severity-watch/60 bg-severity-watch/10 px-4 py-2.5 text-sm text-ink">
        {SMART_DISCLAIMER}
      </p>
      {!SMART_BUILD_CONFIG.ok ? (
        <Card title="SMART configuration" action={<SmartStatusBadge status="config-error" />}>
          <p role="alert" className="text-sm text-ink">
            {SMART_BUILD_CONFIG.error}
          </p>
        </Card>
      ) : SMART_BUILD_CONFIG.config.enabled ? (
        <EnabledDemo config={SMART_BUILD_CONFIG.config} />
      ) : (
        <Card title="SMART configuration" action={<SmartStatusBadge status="not-configured" />}>
          <p className="text-sm text-muted">
            {SMART_STATUS['not-configured'].message} Build or start the app with{' '}
            <code className="font-mono">VITE_SMART_ENABLED=true</code> to use the sandbox (see backend/README.md).
          </p>
        </Card>
      )}
      <Comparison />
    </div>
  );
}

function EnabledDemo({ config }: { config: SmartEnabledConfig }) {
  const [status, setStatus] = useState<SmartStatus>('ready');
  const [session, setSession] = useState(false);
  useEffect(() => setSession(hasStoredSession()), []);

  const standalone = () => {
    setStatus('authorizing');
    beginStandaloneLaunch(config).catch(() => setStatus('config-error'));
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="SMART session" action={<SmartStatusBadge status={session && status === 'ready' ? 'connected' : status} />}>
        <div className="space-y-3 text-sm">
          <p className="text-muted" role="status" aria-live="polite">
            {session && status === 'ready'
              ? 'This tab has a SMART session.'
              : SMART_STATUS[status].message}
          </p>
          <div className="flex flex-wrap gap-2">
            {session ? (
              <Link to="/smart/sidecar" className="ls-btn-primary">
                Open SMART Sidecar
              </Link>
            ) : null}
            <button type="button" className="ls-btn" onClick={standalone} disabled={status === 'authorizing'}>
              Launch SMART Sandbox (Standalone)
            </button>
          </div>
          <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">Client ID (public)</dt>
            <dd className="break-all font-mono text-ink">{config.clientId}</dd>
            <dt className="text-muted">Launch URL</dt>
            <dd className="break-all font-mono text-ink">{config.launchUri}</dd>
            <dt className="text-muted">Redirect URL</dt>
            <dd className="break-all font-mono text-ink">{config.redirectUri}</dd>
            <dt className="text-muted">EHR launch scopes</dt>
            <dd className="break-all font-mono text-ink">{ehrScope(config.scopes)}</dd>
            <dt className="text-muted">Standalone scopes</dt>
            <dd className="break-all font-mono text-ink">{standaloneScope(config.scopes)}</dd>
            <dt className="text-muted">Standalone FHIR base</dt>
            <dd className="break-all font-mono text-ink">{config.standaloneIss}</dd>
          </dl>
        </div>
      </Card>

      <Card title="EHR launch from the SMART Health IT launcher">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
          <li>
            Open the{' '}
            <a className="font-medium text-brand underline" href={launcherLink(config.launchUri)} target="_blank" rel="noreferrer">
              SMART Health IT launcher (prefilled)
            </a>
            .
          </li>
          <li>Launch Type: Provider EHR Launch; FHIR Version: R4; Client Type: Public; PKCE: Auto.</li>
          <li>Select a synthetic patient (and optionally a provider).</li>
          <li>Check the App Launch URL is LabSentinel&apos;s launch URL, then press Launch.</li>
          <li>Sign in and approve on the sandbox screens; LabSentinel opens its SMART Sidecar.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          The launcher acts as the EHR: it opens LabSentinel with <span className="font-mono">iss</span> and{' '}
          <span className="font-mono">launch</span>. LabSentinel does not start an EHR launch itself.
        </p>
      </Card>
    </div>
  );
}

function Comparison() {
  const rows: Array<[string, string, string, string]> = [
    ['What it is', 'Product/architecture illustration inside LabSentinel', 'Real SMART App Launch against a public sandbox', 'Registered app in a vendor EHR'],
    ['Data', 'LabSentinel synthetic dataset', 'Synthetic sandbox FHIR data', 'Real clinical data under agreements'],
    ['Authorization', 'None (simulated)', 'OAuth 2.0 + PKCE, public client', 'Vendor-registered client, production security review'],
    ['Proves', 'The sidecar concept and workflow', 'Standards-based launch and FHIR access', 'Vendor-specific production compatibility'],
    ['Status', 'Implemented', 'Implemented (development)', 'Not started'],
  ];
  return (
    <Card title="Simulated vendor sidecar vs live SMART sandbox session" bodyClassName="p-0">
      <div className="w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Simulated, sandbox and production integrations compared">
        <table className="w-full min-w-[640px] border-collapse">
          <caption className="sr-only">Comparison of simulated, sandbox and production integrations</caption>
          <thead className="border-b border-hairline bg-canvas">
            <tr>
              {['', 'Simulated vendor sidecar', 'Live SMART sandbox session', 'Future production vendor integration'].map(
                (label) => (
                  <th key={label || 'aspect'} scope="col" className="ls-th">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map(([aspect, ...cells]) => (
              <tr key={aspect}>
                <th scope="row" className="ls-td text-left font-semibold">
                  {aspect}
                </th>
                {cells.map((cell, index) => (
                  <td key={index} className="ls-td text-muted">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
