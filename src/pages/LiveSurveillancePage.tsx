import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PageMeta from '../components/common/PageMeta';
import { useLiveSurveillance } from '../context/LiveSurveillanceContext';
import {
  ActivityStream,
  InjectObservation,
  LiveControls,
  SourceStatusPanel,
  TodaySoFar,
  useLiveClock,
} from '../components/live/LiveParts';
import { HISTORY_DATES } from '../lib/live/dataset';
import { settingsFor, RVS_PROFILE_ID } from '../lib/profiles/registry';
import { withProfileParam } from '../lib/profiles/selection';

/**
 * Live Surveillance: synthetic observations arriving through three simulated
 * source feeds, processed in the browser — the same pipeline and engine
 * rules as the backend, without needing it.
 */
export default function LiveSurveillancePage() {
  const { setMode } = useLiveSurveillance();
  const { search } = useLocation();
  const clock = useLiveClock();
  // This page is the live simulation.
  useEffect(() => setMode('live'), [setMode]);
  const reference = settingsFor(RVS_PROFILE_ID).ewma.referenceDays;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Live Surveillance</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Synthetic laboratory observations arrive through three simulated source feeds and are validated,
            normalized, routed to every applicable profile and scored as they arrive. Simulated clock:{' '}
            <span className="font-semibold text-ink">{clock}</span>.
          </p>
        </div>
        <PageMeta />
      </header>

      <div className="ls-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <LiveControls />
        <Link to={withProfileParam('/dashboard', search)} className="ls-btn px-3 py-1.5 text-sm">
          Open the dashboard →
        </Link>
      </div>

      <TodaySoFar />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-3">
          <SourceStatusPanel />
          <InjectObservation />
          <section aria-labelledby="pipeline-heading" className="ls-card px-4 py-3">
            <h2 id="pipeline-heading" className="text-sm font-semibold text-ink">
              How an observation becomes a signal
            </h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink">
              <li>A simulated source sends a result in its own format: FHIR R4, HL7 v2, or a LIS/API JSON record.</li>
              <li>The source&apos;s adapter parses and validates it (facility, LOINC check digit, result, collection time).</li>
              <li>It is normalized: LOINC test, Positive or Negative.</li>
              <li>It is routed to every profile its test belongs to — an Influenza A result counts towards Influenza A and Respiratory Viral Syndrome, once each.</li>
              <li>The profile&apos;s counts for the day change, and the engine recalculates: rolling 7-day baseline, affected facilities, areas, persistence, the five components and the score.</li>
              <li>At the end of the day the result becomes the profile&apos;s current signal on every page.</li>
            </ol>
            <p className="mt-2 text-[11px] text-muted">
              The engine follows the backend&apos;s rules exactly; a parity test runs the backend on the same
              observations and checks it gets the same signals.
            </p>
          </section>
          <section aria-labelledby="stats-heading" className="ls-card px-4 py-3" data-testid="live-statistics">
            <h2 id="stats-heading" className="text-sm font-semibold text-ink">
              Statistical confirmation (EWMA, CUSUM)
            </h2>
            <p className="mt-1 text-sm text-ink">
              Insufficient reference history: the live simulation holds {HISTORY_DATES.length} days of history before
              the live period, and EWMA and CUSUM need a {reference}-day reference period. No statistical result is
              shown, and none is invented.
            </p>
            <p className="mt-1 text-[11px] text-muted">
              The history exists to establish the 7-day rolling baseline. The backend runs EWMA and CUSUM on its own
              stored history (Detection Methods, full-stack mode).
            </p>
          </section>
        </div>
        <div className="xl:col-span-2">
          <ActivityStream />
        </div>
      </div>
    </div>
  );
}
