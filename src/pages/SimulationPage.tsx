import { useSimulation } from '../context/SimulationContext';
import Card from '../components/common/Card';
import { ErrorState } from '../components/common/States';
import SeverityBadge from '../components/signals/SeverityBadge';
import { SCENARIOS } from '../data/simulation';
import { getScoreForDay } from '../lib/selectors';
import { SEVERITY_STYLES, formatFullTimestamp } from '../lib/format';
import { SCORE_DISCLAIMER } from '../lib/signalScore';

export default function SimulationPage() {
  const {
    currentDay,
    currentScenario,
    signalScore,
    lastUpdated,
    isPlaying,
    isFirstDay,
    isLastDay,
    error,
    clearError,
    nextDay,
    previousDay,
    goToDay,
    resetSimulation,
    playSimulation,
    pauseSimulation,
  } = useSimulation();

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  const styles = SEVERITY_STYLES[signalScore.severity];

  const state = [
    { label: 'Tests', value: currentScenario.totalTests.toLocaleString('en-US') },
    { label: 'Positivity', value: `${currentScenario.positivityRate.toFixed(1)}%` },
    { label: 'Affected Hospitals', value: `${currentScenario.affectedHospitals.length} / 3` },
    { label: 'Affected ZIP Codes', value: `${currentScenario.affectedZipCodes.length} / 3` },
    {
      label: 'Persistence',
      value: `${currentScenario.persistenceDays} ${
        currentScenario.persistenceDays === 1 ? 'day' : 'days'
      }`,
    },
    { label: 'Signal Score', value: `${signalScore.composite} / 100` },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Respiratory Outbreak Simulation
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            This page drives the entire prototype. Changing the day here updates the
            dashboard, map, laboratory table, alerts, hospital views and all three vendor
            sidecars.
          </p>
        </div>
        <div className="text-left sm:ml-auto sm:text-right">
          <p className="ls-label">Last updated</p>
          <p className="mt-0.5 text-xs text-muted">{formatFullTimestamp(lastUpdated)}</p>
        </div>
      </header>

      <div className={`ls-card overflow-hidden border ${styles.soft}`}>
        <span aria-hidden="true" className={`block h-1 w-full ${styles.accent}`} />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="ls-label">Current Simulation Day</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-ink">
                Day {currentDay} <span className="text-muted">of 5</span>
              </p>
              <p className="mt-1.5 text-lg font-medium text-brand">
                {currentScenario.stage}
              </p>
            </div>
            <div className="text-left sm:ml-auto sm:text-right">
              <p className="ls-label">Composite Signal Score</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums text-ink">
                {signalScore.composite}
                <span className="text-xl font-medium text-muted"> / 100</span>
              </p>
              <div className="mt-2 flex sm:justify-end">
                <SeverityBadge severity={signalScore.severity} size="md" />
              </div>
            </div>
          </div>

          <p className="mt-5 max-w-4xl text-sm leading-relaxed text-ink">
            {currentScenario.description}
          </p>

          {/* Day-by-day progress rail: the isolated signal becoming regional. */}
          <ol className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-5">
            {SCENARIOS.map((scenario) => {
              const isCurrent = scenario.day === currentDay;
              const isReached = scenario.day <= currentDay;
              const scenarioScore = getScoreForDay(scenario.day);
              return (
                <li key={scenario.day}>
                  <button
                    type="button"
                    onClick={() => goToDay(scenario.day)}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isCurrent
                        ? 'border-brand bg-white shadow-card'
                        : isReached
                          ? 'border-hairline bg-white/70 hover:bg-white'
                          : 'border-dashed border-hairline bg-transparent hover:bg-white/50'
                    }`}
                  >
                    <span
                      className={`block h-1 w-full rounded-full ${
                        isReached
                          ? SEVERITY_STYLES[scenarioScore.severity].accent
                          : 'bg-hairline'
                      }`}
                    />
                    <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                      Day {scenario.day}
                    </span>
                    <span
                      className={`mt-0.5 block text-xs font-medium leading-snug ${
                        isReached ? 'text-ink' : 'text-muted'
                      }`}
                    >
                      {scenario.stage}
                    </span>
                    <span className="mt-1 block text-[11px] tabular-nums text-muted">
                      {isReached ? `Score ${scenarioScore.composite}` : 'Not yet reached'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={previousDay}
              disabled={isFirstDay}
              className="ls-btn"
            >
              ‹ Previous Day
            </button>
            <button
              type="button"
              onClick={nextDay}
              disabled={isLastDay}
              className="ls-btn-primary"
            >
              Advance Day ›
            </button>
            <button
              type="button"
              onClick={playSimulation}
              disabled={isPlaying}
              className="ls-btn"
            >
              ▶ Auto Play
            </button>
            <button
              type="button"
              onClick={pauseSimulation}
              disabled={!isPlaying}
              className="ls-btn"
            >
              ❚❚ Pause
            </button>
            <button type="button" onClick={resetSimulation} className="ls-btn">
              ↺ Reset Simulation
            </button>

            {isPlaying ? (
              <span className="ml-1 inline-flex items-center gap-2 rounded-full bg-brand-light px-3 py-1 text-xs font-medium text-brand">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                Auto-playing — advances every 3 seconds, stops at Day 5
              </span>
            ) : null}
            {isLastDay && !isPlaying ? (
              <span className="ml-1 text-xs font-medium text-muted">
                Final day reached. Reset to run the scenario again.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <Card title="Current State" subtitle={`Derived from Simulation Day ${currentDay}`}>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
          {state.map((item) => (
            <div key={item.label} className="rounded-lg bg-canvas p-3">
              <dt className="ls-label">{item.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                {item.value}
              </dd>
            </div>
          ))}
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Severity</dt>
            <dd className="mt-1.5">
              <SeverityBadge severity={signalScore.severity} />
            </dd>
          </div>
        </dl>
      </Card>

      <Card
        title="How the outbreak develops"
        subtitle="From an isolated laboratory signal to a regional multi-site signal"
        bodyClassName="p-0"
      >
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="border-b border-hairline bg-canvas">
              <tr>
                <th scope="col" className="ls-th">Day</th>
                <th scope="col" className="ls-th">Stage</th>
                <th scope="col" className="ls-th text-right">Tests</th>
                <th scope="col" className="ls-th text-right">Positivity</th>
                <th scope="col" className="ls-th text-right">Hospitals</th>
                <th scope="col" className="ls-th text-right">ZIPs</th>
                <th scope="col" className="ls-th text-right">Persistence</th>
                <th scope="col" className="ls-th text-right">Score</th>
                <th scope="col" className="ls-th">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {SCENARIOS.map((scenario) => {
                const isReached = scenario.day <= currentDay;
                const scenarioScore = getScoreForDay(scenario.day);
                return (
                  <tr
                    key={scenario.day}
                    onClick={() => goToDay(scenario.day)}
                    className={`cursor-pointer transition-colors hover:bg-canvas ${
                      scenario.day === currentDay ? 'bg-brand-light' : ''
                    } ${isReached ? '' : 'opacity-45'}`}
                  >
                    <td className="ls-td font-semibold">Day {scenario.day}</td>
                    <td className="ls-td">{scenario.stage}</td>
                    <td className="ls-td text-right tabular-nums">
                      {isReached ? scenario.totalTests : '—'}
                    </td>
                    <td className="ls-td text-right tabular-nums">
                      {isReached ? `${scenario.positivityRate.toFixed(1)}%` : '—'}
                    </td>
                    <td className="ls-td text-right tabular-nums">
                      {isReached ? scenario.affectedHospitals.length : '—'}
                    </td>
                    <td className="ls-td text-right tabular-nums">
                      {isReached ? scenario.affectedZipCodes.length : '—'}
                    </td>
                    <td className="ls-td text-right tabular-nums">
                      {isReached ? scenario.persistenceDays : '—'}
                    </td>
                    <td className="ls-td text-right font-semibold tabular-nums">
                      {isReached ? scenarioScore.composite : '—'}
                    </td>
                    <td className="ls-td">
                      {isReached ? (
                        <SeverityBadge severity={scenarioScore.severity} />
                      ) : (
                        <span className="text-xs text-muted">Not yet reached</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-hairline px-4 py-3 text-[11px] leading-snug text-muted">
          {SCORE_DISCLAIMER}
        </p>
      </Card>
    </div>
  );
}
