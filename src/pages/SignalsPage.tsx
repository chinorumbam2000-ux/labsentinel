import { useSearchParams } from 'react-router-dom';
import { useSimulation } from '../context/SimulationContext';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import SignalTable from '../components/signals/SignalTable';
import SignalInvestigation, {
  type InvestigationMode,
} from '../components/signals/SignalInvestigation';
import SeverityBadge from '../components/signals/SeverityBadge';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { SCORE_DISCLAIMER, SIGNAL_DISCLAIMER } from '../lib/signalScore';
import { formatPercent, formatSimulationDateTime } from '../lib/format';
import { findDetection } from '../lib/alerts';

/**
 * Investigation context lives in the URL:
 *   ?alert=<id>             investigate that alert, at detection by default
 *   ?alert=<id>&view=current  ... but showing current conditions
 *   ?view=current           investigate current conditions with no alert
 *                           (the dashboard and map entry points)
 *
 * Keeping it in the URL is what makes refresh and browser back/forward restore
 * the right screen.
 */
const ALERT_PARAM = 'alert';
const VIEW_PARAM = 'view';

export default function SignalsPage() {
  const {
    currentDay,
    currentScenario,
    signalScore,
    alerts,
    dataConfidence,
    feedHealth,
    dayOverDay,
    lastUpdated,
    acknowledgeAlert,
    unacknowledgedCount,
    newTodayCount,
    isLoading,
    error,
    clearError,
  } = useSimulation();

  const [searchParams, setSearchParams] = useSearchParams();
  const alertParam = searchParams.get(ALERT_PARAM);
  const viewParam = searchParams.get(VIEW_PARAM);

  const openList = () => setSearchParams({});

  const openInvestigation = (alertId: string) => {
    // Detection-time is the default: the user clicked a specific historical alert.
    setSearchParams({ [ALERT_PARAM]: alertId, [VIEW_PARAM]: 'detection' });
  };

  const setMode = (mode: InvestigationMode) => {
    // Only the URL changes. The global simulation day, acknowledgements and the
    // stored alert history are all untouched.
    const next: Record<string, string> = { [VIEW_PARAM]: mode };
    if (alertParam) next[ALERT_PARAM] = alertParam;
    setSearchParams(next);
  };

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  const investigatingCurrentOnly = !alertParam && viewParam === 'current';
  const isInvestigating = Boolean(alertParam) || investigatingCurrentOnly;

  if (isInvestigating) {
    const selectedAlert = alertParam
      ? alerts.find((alert) => alert.id === alertParam)
      : undefined;

    // An alert reference we cannot honour: either it does not exist at all, or
    // it exists but has not been detected by the currently selected day.
    if (alertParam && !selectedAlert) {
      const detection = findDetection(alertParam);
      return (
        <div className="space-y-5">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Signal Investigation
            </h1>
          </header>
          <Card>
            <EmptyState
              icon="!"
              title={
                detection
                  ? 'That alert has not been detected yet'
                  : 'That alert could not be found'
              }
              message={
                detection
                  ? `"${detection.title}" is first detected on simulation Day ${detection.detectedDay}. The simulation is currently on Day ${currentDay}, so there is no detection-time breakdown to show. Advance to Day ${detection.detectedDay} or later, then investigate it from the alert list.`
                  : `No alert matches the reference "${alertParam}". It may be from an older session, or the link may be incomplete.`
              }
              action={
                <button type="button" onClick={openList} className="ls-btn-primary">
                  Back to all signals
                </button>
              }
            />
          </Card>
        </div>
      );
    }

    const mode: InvestigationMode = viewParam === 'current' ? 'current' : 'detection';

    return (
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Signal Investigation
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              How the LabSentinel composite outbreak signal score was calculated.
            </p>
          </div>
          <PageMeta />
        </header>
        <SignalInvestigation
          alert={selectedAlert}
          currentDay={currentDay}
          mode={mode}
          onModeChange={setMode}
          onBack={openList}
          confidence={dataConfidence}
          feeds={feedHealth}
          dayOverDay={dayOverDay}
          lastUpdated={lastUpdated}
        />
      </div>
    );
  }

  const acknowledged = alerts.filter((alert) => alert.status === 'Acknowledged');

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Signals &amp; Alerts
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Each alert reports the values recorded when it was detected. Those values do
            not change as the simulation advances — current regional figures are shown
            separately below.
          </p>
        </div>
        <PageMeta />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ls-card p-5">
          <p className="ls-label">Alerts awaiting acknowledgement</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {unacknowledgedCount}
          </p>
          <p className="mt-1 text-xs text-muted">
            of {alerts.length} detected through Day {currentDay}
          </p>
        </div>
        <div className="ls-card p-5">
          <p className="ls-label">Detected on this day</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {newTodayCount}
          </p>
          <p className="mt-1 text-xs text-muted">
            {acknowledged.length} acknowledged so far
          </p>
        </div>
        <div className="ls-card p-5">
          <p className="ls-label">Current composite score</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {signalScore.composite}
            <span className="text-base font-medium text-muted"> / 100</span>
          </p>
          <p className="mt-1 text-xs text-muted">Severity: {signalScore.severity}</p>
        </div>
        <div className="ls-card p-5">
          <p className="ls-label">Current scope</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {currentScenario.affectedHospitals.length} / 3
          </p>
          <p className="mt-1 text-xs text-muted">
            facilities · {currentScenario.affectedZipCodes.length} surveillance areas
          </p>
        </div>
      </div>

      <Card
        title="Alert history"
        subtitle="Values are frozen at detection time. Investigate opens that alert's own detection-time breakdown."
        bodyClassName="p-0"
      >
        {isLoading ? (
          <LoadingState label="Loading alert history…" />
        ) : (
          <SignalTable
            alerts={alerts}
            onInvestigate={(alert) => openInvestigation(alert.id)}
            onAcknowledge={acknowledgeAlert}
          />
        )}
      </Card>

      {/* Current values kept explicitly separate from the frozen detection values. */}
      <Card
        title={`Current regional figures — Day ${currentDay}`}
        subtitle="Live values for the selected simulation day, shown separately from the detection-time values above"
        action={
          <button
            type="button"
            onClick={() => setSearchParams({ [VIEW_PARAM]: 'current' })}
            className="ls-btn px-3 py-1.5 text-xs"
          >
            Investigate current conditions →
          </button>
        }
      >
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Tests</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {currentScenario.totalTests}
            </dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Positives</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {currentScenario.totalPositives}
            </dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Positivity</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {formatPercent(currentScenario.positivityRate)}
            </dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Composite score</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {signalScore.composite} / 100
            </dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Severity</dt>
            <dd className="mt-1.5">
              <SeverityBadge severity={signalScore.severity} />
            </dd>
          </div>
        </dl>
      </Card>

      {acknowledged.length > 0 ? (
        <Card title="Acknowledgement log" bodyClassName="p-0">
          <ul className="divide-y divide-hairline">
            {acknowledged.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              >
                <span className="text-sm text-ink">{alert.title}</span>
                <span className="text-xs text-muted">
                  Acknowledged on Day {alert.acknowledgement?.day} ·{' '}
                  {alert.acknowledgement
                    ? formatSimulationDateTime(alert.acknowledgement.simulationTime)
                    : ''}{' '}
                  (simulation time)
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="ls-card border-l-4 border-l-severity-critical p-5">
        <p className="text-sm font-semibold text-ink">{SIGNAL_DISCLAIMER}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{SCORE_DISCLAIMER}</p>
      </div>
    </div>
  );
}
