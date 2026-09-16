import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSimulation } from '../../context/SimulationContext';
import { formatClockTime } from '../../lib/format';
import SeverityBadge from '../signals/SeverityBadge';

export default function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const {
    currentDay,
    currentScenario,
    signalScore,
    nextDay,
    previousDay,
    resetSimulation,
    refresh,
    lastUpdated,
    alerts,
    newAlertCount,
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
        className="ls-btn px-2.5 py-1.5 lg:hidden"
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

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={previousDay}
          disabled={isFirstDay}
          className="ls-btn px-2.5 py-1.5"
          aria-label="Previous simulation day"
          title={isFirstDay ? 'Already at Day 1' : 'Previous day'}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={nextDay}
          disabled={isLastDay}
          className="ls-btn px-2.5 py-1.5"
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
        <div className="hidden text-right md:block">
          <p className="ls-label">Last Updated</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-medium text-brand hover:underline"
            title="Refresh timestamp"
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
            className="ls-btn relative px-2.5 py-1.5"
            aria-label={`Notifications: ${newAlertCount} new`}
            aria-expanded={showAlerts}
          >
            <span aria-hidden="true">🔔</span>
            {newAlertCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-severity-critical px-1 text-[10px] font-bold text-white">
                {newAlertCount}
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
                  Active Alerts — Day {currentDay}
                </p>
                {alerts.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted">
                    No active alerts. Regional activity is at baseline.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-1 overflow-y-auto">
                    {alerts.map((alert) => (
                      <li key={alert.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAlerts(false);
                            navigate('/signals');
                          }}
                          className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-canvas"
                        >
                          <span className="mt-0.5">
                            <SeverityBadge severity={alert.severity} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {alert.title}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {alert.detail}
                            </span>
                          </span>
                        </button>
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
