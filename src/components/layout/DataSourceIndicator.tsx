import { useDataSourceContext } from '../../data-access/DataSourceProvider';

/**
 * A quiet statement of where the numbers on screen come from.
 *
 * Local mode: "Local Demo Mode" (synthetic data in the browser). API mode:
 * "API Capstone" with the backend's live health,
 * checked on load, about once a minute, and whenever this is clicked — it
 * never claims a connection it has not just confirmed.
 */
export default function DataSourceIndicator() {
  const { source, health, checkingHealth, recheckHealth } = useDataSourceContext();

  if (source.mode === 'local') {
    return (
      <span
        className="hidden items-center rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-muted xl:inline-flex"
        title="Local Demo Mode: the prototype's synthetic data, computed in the browser. No backend is used."
      >
        Local Demo Mode
      </span>
    );
  }

  const connected = health?.api === 'connected' && health.database === 'connected';
  const state = health === null ? 'Checking' : connected ? 'Connected' : 'Unavailable';
  const dot =
    health === null ? 'bg-muted' : connected ? 'bg-severity-low' : 'bg-severity-critical';
  const detail =
    health === null
      ? 'Checking the API…'
      : connected
        ? 'PostgreSQL API connected'
        : health.api === 'connected'
          ? 'API reachable, but its database is unavailable'
          : 'API unavailable';
  const checked = health ? ` · checked ${health.checkedAt.toLocaleTimeString('en-US')}` : '';

  return (
    <button
      type="button"
      onClick={recheckHealth}
      disabled={checkingHealth}
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-canvas disabled:cursor-progress"
      title={`API capstone mode · ${source.label} · ${detail}${checked}. Click to re-check.`}
      aria-label={`Data source: ${detail}. Re-check connection.`}
    >
      <span className="text-muted">API Capstone</span>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>{state}</span>
    </button>
  );
}
