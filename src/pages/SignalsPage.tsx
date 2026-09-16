import { useState } from 'react';
import { useSimulation } from '../context/SimulationContext';
import Card from '../components/common/Card';
import SignalTable from '../components/signals/SignalTable';
import SignalInvestigation from '../components/signals/SignalInvestigation';
import { ErrorState, LoadingState } from '../components/common/States';
import { SCORE_DISCLAIMER, SIGNAL_DISCLAIMER } from '../lib/signalScore';
import { formatFullTimestamp } from '../lib/format';

export default function SignalsPage() {
  const {
    currentDay,
    currentScenario,
    signalScore,
    alerts,
    lastUpdated,
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

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Signals &amp; Alerts
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Alerts are generated from the current simulation state. Advancing or resetting
            the simulation day regenerates this list.
          </p>
        </div>
        <div className="text-left sm:ml-auto sm:text-right">
          <p className="ls-label">
            Day {currentDay} of 5 · {currentScenario.stage}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Last updated {formatFullTimestamp(lastUpdated)}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="ls-card p-5">
          <p className="ls-label">Active Alerts</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {alerts.length}
          </p>
          <p className="mt-1 text-xs text-muted">
            {alerts.filter((alert) => alert.status === 'NEW').length} new on this day
          </p>
        </div>
        <div className="ls-card p-5">
          <p className="ls-label">Composite Signal Score</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {signalScore.composite}
            <span className="text-base font-medium text-muted"> / 100</span>
          </p>
          <p className="mt-1 text-xs text-muted">Severity: {signalScore.severity}</p>
        </div>
        <div className="ls-card p-5">
          <p className="ls-label">Scope</p>
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
        subtitle="Click the regional signal to open the full investigation"
        bodyClassName="p-0"
      >
        {isLoading ? (
          <LoadingState label="Regenerating alerts…" />
        ) : (
          <SignalTable alerts={alerts} onInvestigate={() => setInvestigating(true)} />
        )}
      </Card>

      <div className="ls-card border-l-4 border-l-severity-critical p-5">
        <p className="text-sm font-semibold text-ink">{SIGNAL_DISCLAIMER}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{SCORE_DISCLAIMER}</p>
      </div>
    </div>
  );
}
