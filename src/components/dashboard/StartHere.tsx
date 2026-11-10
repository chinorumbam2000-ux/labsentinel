import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveSurveillance } from '../../context/LiveSurveillanceContext';

export const START_HERE_KEY = 'labsentinel.startHere.dismissed.v1';

const readDismissed = () => {
  try {
    return window.sessionStorage.getItem(START_HERE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * One line for a first-time visitor: what the product does, and the two ways
 * to see it — Live Surveillance first and recommended, Scenario Replay as the
 * secondary training walkthrough. Dismissible for the browser session;
 * changes no data.
 */
export default function StartHere() {
  const { mode, started, setMode, start } = useLiveSurveillance();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed || (mode === 'live' && started)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(START_HERE_KEY, '1');
    } catch {
      /* storage unavailable: dismissed for this page only */
    }
  };
  const watchLive = () => {
    setMode('live');
    start();
    navigate('/live');
  };

  return (
    <section
      aria-label="Start here"
      className="ls-card flex flex-wrap items-center justify-between gap-3 border-brand/30 px-4 py-3"
      data-testid="start-here"
    >
      <p className="min-w-0 flex-1 text-sm text-ink">
        <span className="font-semibold">Start here.</span> Signal by ProbeSyQ turns laboratory results into an
        early-warning outbreak signal for each surveillance profile. Everything is synthetic —{' '}
        <Link to="/overview#about-the-data" className="text-brand underline-offset-2 hover:underline">
          what that means
        </Link>
        .
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="ls-btn-primary px-3 py-1.5 text-xs" onClick={watchLive}>
          ▶ Watch Live Surveillance
        </button>
        <Link
          to="/replay"
          className="rounded-md px-2 py-1.5 text-xs font-medium text-brand underline-offset-2 hover:underline"
          title="Historical training scenario — the controlled five-day outbreak sequence"
        >
          View Scenario Replay
        </Link>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm text-muted hover:bg-canvas hover:text-ink"
          aria-label="Dismiss the introduction"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </section>
  );
}
