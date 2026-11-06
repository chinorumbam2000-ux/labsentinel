import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { HospitalId } from '../../types';
import { HOSPITALS } from '../../data/hospitals';
import { SPEEDS, useLiveSurveillance, type SurveillanceMode } from '../../context/LiveSurveillanceContext';
import { ALL_DATES, SOURCE_TYPE, TEST_NAMES, type LiveTestCode } from '../../lib/live/dataset';
import { clock } from '../../lib/live/sources';
import { END_MINUTE, LIVE_PROFILES, dayAndMinuteOf, shortFacilityName, type AuditEntry } from '../../lib/live/simulator';
import { liveDayLabel, liveProvisional } from '../../lib/live/view';
import { PROFILE_BY_ID } from '../../lib/profiles/registry';
import SeverityBadge from '../signals/SeverityBadge';

/* ------------------------------------------------------------------------ */

/** "Feb 13 · 10:40" — the simulated clock. */
export function useLiveClock(): string {
  const { simulator } = useLiveSurveillance();
  const { dayIndex, minute } = dayAndMinuteOf(simulator.op);
  return `${liveDayLabel(dayIndex)} · ${clock(minute)}`;
}

/**
 * Live Surveillance | Scenario Replay. Switching keeps the page, except that
 * Scenario Replay's own page belongs to the replay and the Live
 * Surveillance page to the live simulation.
 */
export function ModeSwitch({ onDark = false }: { onDark?: boolean }) {
  const { mode, setMode } = useLiveSurveillance();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const choose = (next: SurveillanceMode) => {
    setMode(next);
    if (next === 'live' && (pathname === '/replay' || pathname === '/simulation')) navigate(`/live${search}`);
    if (next === 'replay' && pathname === '/live') navigate(`/replay${search}`);
  };
  const base = onDark
    ? 'flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors'
    : 'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors';
  const on = onDark ? 'bg-white text-sidebar' : 'bg-brand text-white';
  const off = onDark ? 'text-white/75 hover:text-white' : 'text-ink hover:bg-canvas';
  return (
    <div role="group" aria-label="Surveillance mode" className={`flex gap-1 rounded-lg p-0.5 ${onDark ? 'bg-white/10' : 'border border-hairline bg-white'}`}>
      {(['live', 'replay'] as SurveillanceMode[]).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => choose(m)} className={`${base} ${mode === m ? on : off}`}>
          {m === 'live' ? 'Live Surveillance' : 'Scenario Replay'}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/** One Start / Pause / Resume button, for the top bar. */
export function PlayPauseButton() {
  const { simulator, playing, started, start, pause, resume } = useLiveSurveillance();
  const label = !started ? '▶ Start' : playing ? '❚❚ Pause' : '▶ Resume';
  const action = !started ? start : playing ? pause : resume;
  return (
    <button type="button" className="ls-btn shrink-0 px-2.5 py-1.5 text-xs" onClick={action} disabled={simulator.finished && !playing}>
      {simulator.finished ? 'Complete' : label}
    </button>
  );
}

export function LiveControls({ compact = false }: { compact?: boolean }) {
  const { simulator, playing, started, speed, start, pause, resume, reset, setSpeed } = useLiveSurveillance();
  const finished = simulator.finished;
  const progress = Math.round((simulator.op / END_MINUTE) * 100);
  const btn = compact ? 'ls-btn px-2.5 py-1 text-xs' : 'ls-btn px-3 py-1.5 text-sm';
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Live simulation controls">
      {!started ? (
        <button type="button" className={compact ? 'ls-btn-primary px-2.5 py-1 text-xs' : 'ls-btn-primary'} onClick={start}>
          ▶ Start
        </button>
      ) : playing ? (
        <button type="button" className={btn} onClick={pause}>
          ❚❚ Pause
        </button>
      ) : (
        <button type="button" className={btn} onClick={resume} disabled={finished}>
          ▶ Resume
        </button>
      )}
      <button type="button" className={btn} onClick={reset}>
        ↺ Reset
      </button>
      {compact ? null : (
        <div role="group" aria-label="Speed" className="flex gap-1">
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className={`${btn} ${speed === s ? 'ring-2 ring-brand' : ''}`}>
              {s}×
            </button>
          ))}
        </div>
      )}
      {compact ? null : (
        <span className="text-xs text-muted" aria-live="off">
          {finished ? 'Simulation complete' : `${progress}% of the ${ALL_DATES.length - 7}-day live period`}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

const STATUS_STYLE: Record<string, string> = {
  HEALTHY: 'border-severity-low/40 bg-severity-low/5 text-[#166534]',
  DELAYED: 'border-severity-watch/50 bg-severity-watch/10 text-[#6B5102]',
  DEGRADED: 'border-severity-high/40 bg-severity-high/10 text-[#9A3412]',
  OFFLINE: 'border-severity-critical/40 bg-severity-critical/5 text-[#991B1B]',
};

const minutesText = (minutes: number | null) =>
  minutes === null ? 'none yet' : minutes < 1 ? 'just now' : `${minutes} min ago`;

/** The three simulated sources, from the live state (never a hard-coded "connected"). */
export function SourceStatusPanel({ compact = false }: { compact?: boolean }) {
  const { simulator, started, playing } = useLiveSurveillance();
  const feeds = simulator.feedHealth();
  const active = feeds.filter((f) => f.isReporting && f.status !== 'DELAYED').length;
  // The feeds only send while the simulation runs: never "active" before Start or after the end.
  const run: 'idle' | 'running' | 'paused' | 'complete' = simulator.finished
    ? 'complete'
    : !started
      ? 'idle'
      : playing
        ? 'running'
        : 'paused';
  const heading =
    run === 'idle'
      ? 'Simulated sources · not started'
      : run === 'complete'
        ? 'Simulated sources · live period complete'
        : run === 'paused'
          ? `Simulated sources · paused (${active} / ${feeds.length} active when paused)`
          : `${active} / ${feeds.length} simulated sources active`;
  const chip = (status: string) => {
    if (run === 'idle') return { text: 'Not started', style: 'border-hairline bg-canvas text-muted' };
    if (run === 'complete') return { text: 'Completed', style: 'border-hairline bg-canvas text-ink' };
    const label = status === 'HEALTHY' ? 'Active' : status === 'DELAYED' ? 'Delayed' : status === 'DEGRADED' ? 'Degraded' : 'Offline';
    if (run === 'paused') return { text: `${label} · paused`, style: 'border-hairline bg-canvas text-ink' };
    return { text: label, style: STATUS_STYLE[status] };
  };
  return (
    <section aria-label="Simulated source feeds" className="ls-card px-4 py-3" data-testid="source-status" data-run-state={run}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{heading}</h2>
        <p className="text-[11px] text-muted">Simulated source feeds · times are simulated</p>
      </div>
      <ul className={`mt-2 grid gap-2 ${compact ? 'sm:grid-cols-3' : 'md:grid-cols-3'}`}>
        {feeds.map((f) => (
          <li key={f.hospitalId} className="rounded-lg border border-hairline px-3 py-2" data-testid={`source-${f.hospitalId}`}>
            <p className="truncate text-sm font-semibold text-ink" title={f.facilityName}>
              {f.facilityName}
            </p>
            <p className="text-[11px] text-muted">{SOURCE_TYPE[f.hospitalId]} (simulated)</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip(f.status).style}`}>
                {chip(f.status).text}
              </span>
              <span className="text-muted">Last observation: {minutesText(simulator.minutesSinceResult(f.hospitalId))}</span>
            </p>
            {compact ? null : (
              <p className="mt-1 text-[11px] text-muted">
                {f.eventsReceived.toLocaleString('en-US')} messages · {f.terminologyMappedPercent.toFixed(1)}% mapped ·{' '}
                {f.completenessPercent.toFixed(1)}% complete · {f.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

const KIND_LABEL: Record<AuditEntry['kind'], string> = {
  observation: 'Observation',
  unmapped: 'Unmapped code',
  rejected: 'Rejected',
  score: 'Score (today so far)',
  close: 'Day closed',
  day: 'Day',
  source: 'Source',
};

/**
 * What the feeds did and what it changed. Never shows a patient reference,
 * a pseudonym or a result value: score changes are explained by the engine's
 * own component points.
 */
export function ActivityStream({ limit = 40, kinds }: { limit?: number; kinds?: AuditEntry['kind'][] }) {
  const { simulator } = useLiveSurveillance();
  const entries = simulator.audit.filter((e) => !kinds || kinds.includes(e.kind)).slice(-limit).reverse();
  // Only day closes and source changes are announced: each observation would be noise.
  const announce = [...simulator.audit].reverse().find((e) => e.kind === 'source' || (e.kind === 'close' && e.profileId === 'respiratory-viral-syndrome'));
  return (
    <section aria-labelledby="activity-heading" className="ls-card flex min-h-0 flex-col" data-testid="activity-stream">
      <header className="ls-card-header">
        <h2 id="activity-heading" className="ls-card-title">Live activity</h2>
        <span className="text-[11px] text-muted">Newest first · simulated time</span>
      </header>
      <p className="sr-only" aria-live="polite">
        {announce ? announce.text : ''}
      </p>
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No activity yet. Start the live simulation to see observations arrive.</p>
      ) : (
        <ol className="max-h-[28rem] divide-y divide-hairline overflow-y-auto" tabIndex={0} aria-label="Live activity, newest first">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-2 text-xs">
              <p className="flex flex-wrap items-center gap-x-2 text-muted">
                <span className="font-mono tabular-nums">{liveDayLabel(e.dayIndex)} {clock(e.minute)}</span>
                <span className="font-semibold uppercase tracking-[0.05em]">{KIND_LABEL[e.kind]}</span>
              </p>
              <p className="mt-0.5 text-ink">{e.text}</p>
              {e.drivers && e.drivers.length ? (
                <p className="mt-0.5 text-muted">
                  Drivers: {e.drivers.map((d) => `${d.label} ${d.before} → ${d.after} points`).join('; ')}
                  {e.facilityChanges && e.facilityChanges.length ? `; ${e.facilityChanges.join('; ')}` : ''}
                </p>
              ) : e.facilityChanges && e.facilityChanges.length ? (
                <p className="mt-0.5 text-muted">{e.facilityChanges.join('; ')}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------ */

/** The open day's calculation so far, per live profile — provisional until the day closes. */
export function TodaySoFar() {
  const { simulator } = useLiveSurveillance();
  const provisional = liveProvisional(simulator);
  const { dayIndex } = dayAndMinuteOf(simulator.op);
  return (
    <section aria-label="Today so far" className="ls-card px-4 py-3" data-testid="today-so-far">
      <h2 className="text-sm font-semibold text-ink">
        {simulator.finished ? 'Live period complete' : `Today so far · ${liveDayLabel(dayIndex)} (provisional)`}
      </h2>
      <p className="text-[11px] text-muted">
        Provisional: recalculated with every observation. Today&apos;s volume is still being compared with a
        full-day baseline, so these scores build up as results arrive. For comparisons use closed days: at 19:30
        the day closes and becomes the current signal.
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {LIVE_PROFILES.map((id) => {
          const p = provisional[id];
          return (
            <li key={id} className="rounded-lg border border-hairline px-3 py-2">
              <p className="text-xs font-semibold text-ink">{PROFILE_BY_ID[id].displayName}</p>
              {p?.score ? (
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <span className="font-semibold tabular-nums text-ink">{p.score.composite}</span>
                  <SeverityBadge severity={p.score.severity} />
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">{p?.status === 'NO_DATA' || !p ? 'No results yet today' : 'No score'}</p>
              )}
              <p className="text-[11px] text-muted">{p ? `${p.scenario.totalTests} ${p.scenario.totalTests === 1 ? 'result' : 'results'} so far` : ''}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

/**
 * Enter one synthetic test observation. The person changes data, never an
 * outcome: the observation goes through its facility's own adapter, routing
 * and recalculation like any other.
 */
export function InjectObservation() {
  const { inject, simulator } = useLiveSurveillance();
  const [hospitalId, setHospitalId] = useState<HospitalId>('HOSP-A');
  const [code, setCode] = useState<LiveTestCode>('94500-6');
  const [positive, setPositive] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  return (
    <details className="ls-card px-4 py-3" data-testid="inject">
      <summary className="cursor-pointer text-sm font-semibold text-ink">Inject a synthetic test observation</summary>
      <p className="mt-1 text-xs text-muted">
        A test observation, not a patient result. It is sent in the facility&apos;s simulated format and processed
        exactly like any other observation; scores change only through the data.
      </p>
      <form
        className="mt-2 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (simulator.finished) return setDone('The live period is complete. Reset to inject observations.');
          inject(hospitalId, code, positive);
          return setDone(`Sent: ${TEST_NAMES[code]}, ${positive ? 'positive' : 'negative'}, from ${shortFacilityName(hospitalId)} (${SOURCE_TYPE[hospitalId]}).`);
        }}
      >
        <label className="text-xs font-semibold text-ink">
          Facility
          <select className="ls-select mt-1 block" value={hospitalId} onChange={(e) => setHospitalId(e.target.value as HospitalId)}>
            {HOSPITALS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({SOURCE_TYPE[h.id]})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink">
          Test
          <select className="ls-select mt-1 block" value={code} onChange={(e) => setCode(e.target.value as LiveTestCode)}>
            {(Object.keys(TEST_NAMES) as LiveTestCode[]).map((c) => (
              <option key={c} value={c}>
                {TEST_NAMES[c]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-xs font-semibold text-ink">
          <legend>Result</legend>
          <div className="mt-1 flex gap-3">
            {[true, false].map((value) => (
              <label key={String(value)} className="flex items-center gap-1 font-normal">
                <input type="radio" name="inject-result" checked={positive === value} onChange={() => setPositive(value)} />
                {value ? 'Positive' : 'Negative'}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="ls-btn px-3 py-1.5 text-sm">
          Send test observation
        </button>
      </form>
      {done ? (
        <p role="status" className="mt-2 text-xs text-ink">
          {done}
        </p>
      ) : null}
    </details>
  );
}
