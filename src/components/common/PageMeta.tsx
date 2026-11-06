import { useLocation } from 'react-router-dom';
import { useSimulation } from '../../context/SimulationContext';
import { formatSimulationDate } from '../../lib/format';
import { usePortfolio } from '../../lib/profiles/usePortfolio';
import { RVS_PROFILE_ID } from '../../lib/profiles/registry';

/**
 * The standard page header meta block.
 *
 * Shows the two clocks separately and labels them, so the simulation calendar
 * (which stamps observations and alerts) is never mistaken for the real
 * session clock (which only says when this tab last recalculated).
 *
 * The stage ("Regional Early-Warning Signal") is the narrated replay's, so it
 * is shown on Scenario Replay and while Respiratory Viral Syndrome is the
 * selected profile — never beside another profile.
 */
export default function PageMeta() {
  const { currentDay, currentScenario, simulationDate } = useSimulation();
  const { pathname } = useLocation();
  const { focusId } = usePortfolio();
  const showStage = pathname === '/replay' || pathname === '/simulation' || focusId === RVS_PROFILE_ID;

  return (
    <div className="text-left sm:ml-auto sm:text-right">
      <p className="ls-label">
        Replay Day {currentDay} of 5{showStage ? ` · ${currentScenario.stage}` : ''}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        <span className="font-medium text-ink">Surveillance date:</span>{' '}
        {formatSimulationDate(simulationDate)}
      </p>
    </div>
  );
}
