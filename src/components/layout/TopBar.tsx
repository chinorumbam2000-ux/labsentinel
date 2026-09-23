import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSimulation } from '../../context/SimulationContext';
import { formatClockTime, formatSimulationDate } from '../../lib/format';
import SeverityBadge from '../signals/SeverityBadge';

export default function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const {
    currentDay,
    currentScenario,
    simulationDate,
    signalScore,
    nextDay,
    previousDay,
    resetSimulation,
    refresh,
    lastUpdated,
    alerts,
    unacknowledgedCount,
    acknowledgeAlert,
    isFirstDay,
    isLastDay,
  } = useSimulation();
  const navigate = useNavigate();
  const [showAlerts, setShowAlerts] = useState(false);

  return (
    <header className="relative z-30 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-hairline bg-white px-4 py-3 lg:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        className="ls-btn min-w-[34px] px-2.5 py-1.5 lg:hidden"
        aria-label="Open navigation"
      >
        ☰
      </button>

      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="ls-label">Simulation Day</p>
          <p className="truncate text-sm font-semibold text-ink">
            Day {currentDay} of 5
            <span className="ml-2 font-normal text-muted">{currentScenario.stage}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={previousDay}
          disabled={isFirstDay}
          className="ls-btn min-w-[34px] px-2.5 py-1.5"
          aria-label="Previous simulation day"
          title={isFirstDay ? 'Already at Day 1' : 'Previous day'}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={nextDay}
          disabled={isLastDay}
          className="ls-btn min-w-[34px] px-2.5 py-1.5"
          aria-label="Next simulation day"
          title={isLastDay ? 'Already at Day 5' : 'Next day'}
        >
          ›
        </button>
        <button type="button" onClick={resetSimulation} className="ls-btn px-3 py-1.5">
          Reset
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right lg:block">
          <p className="ls-label">Simulation date</p>
          <p className="text-sm font-medium text-ink">
            {formatSimulationDate(simulationDate)}
          </p>
        </div>

        <div className="hidden text-right md:block">
          <p className="ls-label">Session updated</p>
          <button
            type="button"
            onClick={refresh}
            className="-my-1.5 inline-flex items-center py-1.5 text-sm font-medium text-brand hover:underline"
            title="Refresh the session timestamp (real time, not simulation time)"
          >
            {formatClockTime(lastUpdated)}
          </button>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <SeverityBadge severity={signalScore.severity} />
          <span className="text-sm font-semibold tabular-nums text-ink">
            {signalScore.composite}
            <span className="text-muted">/100</span>
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAlerts((open) => !open)}
            className="ls-btn relative min-w-[34px] px-2.5 py-1.5"
            aria-label={`Notifications: ${unacknowledgedCount} ${
              unacknowledgedCount === 1 ? 'alert' : 'alerts'
            } awaiting acknowledgement`}
            aria-expanded={showAlerts}
          >
            <span aria-hidden="true">🔔</span>
            {unacknowledgedCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-severity-critical px-1 text-[10px] font-bold text-white">
                {unacknowledgedCount}
              </span>
            ) : null}
          </button>

          {showAlerts ? (
            <>
              <button
                type="button"
                aria-label="Close notifications"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setShowAlerts(false)}
              />
              <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-hairline bg-white p-2 shadow-panel">
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {unacknowledgedCount} awaiting acknowledgement · Day {currentDay}
                </p>
                {alerts.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted">
                    No alerts detected yet. Regional activity is at baseline.
                  </p>
                ) : (
                  <ul className="max-h-80 space-y-1 overflow-y-auto">
                    {alerts.map((alert) => (
                      <li key={alert.id} className="rounded-lg px-2 py-2 hover:bg-canvas">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAlerts(false);
                            navigate('/signals');
                          }}
                          className="flex w-full items-start gap-2 text-left"
                        >
                          <span className="mt-0.5">
                            <SeverityBadge severity={alert.detection.severity} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {alert.title}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {alert.detection.detail} · detected Day {alert.detectedDay}
                            </span>
                          </span>
                        </button>
                        {alert.status !== 'Acknowledged' ? (
                          <button
                            type="button"
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="ls-btn mt-1.5 w-full px-2 py-1 text-[11px]"
                            aria-label={`Acknowledge alert: ${alert.title}`}
                          >
                            Acknowledge
                          </button>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted">
                            Acknowledged on Day {alert.acknowledgement?.day}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-l border-hairline pl-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand"
          >
            PA
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-ink">Demo User</p>
            <p className="text-[11px] text-muted">Public Health Analyst</p>
          </div>
        </div>
      </div>
    </header>
  );
}
