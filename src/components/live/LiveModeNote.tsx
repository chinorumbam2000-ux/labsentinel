import { useOptionalLiveSurveillance } from '../../context/LiveSurveillanceContext';

/**
 * Shown only in Live Surveillance, on pages that still work on Scenario
 * Replay: says so, rather than mixing the two.
 */
export default function LiveModeNote({ what }: { what: string }) {
  const live = useOptionalLiveSurveillance();
  if (live?.mode !== 'live') return null;
  return (
    <p role="note" className="ls-card border-l-4 border-l-brand px-4 py-3 text-sm text-ink" data-testid="live-mode-note">
      {what} follow Scenario Replay in this release. Live Surveillance alerts are reviewed and acknowledged on the
      Signals page.
    </p>
  );
}
