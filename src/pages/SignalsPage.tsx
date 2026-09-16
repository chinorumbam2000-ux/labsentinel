import { useState } from 'react';
import { useSimulation } from '../context/SimulationContext';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import SignalTable from '../components/signals/SignalTable';
import SignalInvestigation from '../components/signals/SignalInvestigation';
import SeverityBadge from '../components/signals/SeverityBadge';
import { ErrorState, LoadingState } from '../components/common/States';
import { SCORE_DISCLAIMER, SIGNAL_DISCLAIMER } from '../lib/signalScore';
import { formatPercent, formatSimulationDateTime } from '../lib/format';

export default function SignalsPage() {
  const {
    currentDay,
    currentScenario,
    signalScore,
    alerts,
    acknowledgeAlert,
    unacknowledgedCount,
    newTodayCount,
    isLoading,
    error,
    clearError,
  } = useSimulation();

  const [investigating, setInvestigating] = useState(false);

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  if (investigating) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Signal Investigation
          </h1>
          <p className="mt-1 text-sm text-muted">
            How the LabSentinel composite outbreak signal score was calculated for
            Simulation Day {currentDay}.
          </p>
        </header>
        <SignalInvestigation
          scenario={currentScenario}
          score={signalScore}
          onBack={() => setInvestigating(false)}
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
        subtitle="Values are frozen at detection time. Click Investigate on the regional signal for the full breakdown."
        bodyClassName="p-0"
      >
        {isLoading ? (
          <LoadingState label="Loading alert history…" />
        ) : (
          <SignalTable
            alerts={alerts}
            onInvestigate={() => setInvestigating(true)}
            onAcknowledge={acknowledgeAlert}
          />
        )}
      </Card>

      {/* Current values kept explicitly separate from the frozen detection values. */}
      <Card
        title={`Current regional figures — Day ${currentDay}`}
        subtitle="Live values for the selected simulation day, shown separately from the detection-time values above"
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
