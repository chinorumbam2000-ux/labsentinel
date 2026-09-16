import { useSimulation } from '../../context/SimulationContext';
import { formatClockTime, formatSimulationDate } from '../../lib/format';

/**
 * The standard page header meta block.
 *
 * Shows the two clocks separately and labels them, so the simulation calendar
 * (which stamps observations and alerts) is never mistaken for the real
 * session clock (which only says when this tab last recalculated).
 */
export default function PageMeta() {
  const { currentDay, currentScenario, simulationDate, lastUpdated } = useSimulation();

  return (
    <div className="text-left sm:ml-auto sm:text-right">
      <p className="ls-label">
        Day {currentDay} of 5 · {currentScenario.stage}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        <span className="font-medium text-ink">Simulation date:</span>{' '}
        {formatSimulationDate(simulationDate)}
      </p>
      <p className="text-xs text-muted">
        Session updated {formatClockTime(lastUpdated)} (real time)
      </p>
    </div>
  );
}
