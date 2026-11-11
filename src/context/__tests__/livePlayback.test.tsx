// @vitest-environment jsdom
/**
 * Live Surveillance playback pace: the speed sets only how fast the simulated
 * clock moves in real time. 1× takes one 15-minute step every 500 ms; 2× and 4×
 * move two and four times as fast on the same timer; every speed ends with the
 * same results; there is never more than one timer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LiveSurveillanceProvider, MINUTES_PER_TICK, SPEEDS, TICK_MS, useLiveSurveillance, type Speed } from '../LiveSurveillanceContext';
import { secondsPerDay } from '../../lib/live/playback';
import { END_MINUTE, LIVE_PROFILES, LiveSimulator } from '../../lib/live/simulator';
import { OPERATING_MINUTES } from '../../lib/live/dataset';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const wrapper = ({ children }: { children: ReactNode }) => <LiveSurveillanceProvider>{children}</LiveSurveillanceProvider>;
const mount = () => renderHook(() => useLiveSurveillance(), { wrapper });
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** Everything a run produces: signals, observations, sources, alerts and the audit trail. */
const outcome = (sim: LiveSimulator) => ({
  closed: sim.closed,
  provisional: sim.provisional,
  scores: Object.fromEntries(LIVE_PROFILES.map((id) => [id, Object.values(sim.closed[id]).map((s) => s.score?.composite ?? null)])),
  observations: sim.observations,
  counts: sim.counts,
  feedHealth: sim.feedHealth(),
  alerts: sim.alerts(),
  audit: sim.audit.map(({ id: _id, ...entry }) => entry),
  op: sim.op,
  finished: sim.finished,
});

describe('Live Surveillance playback pace', () => {
  it('1× takes one 15-minute step every 500 ms — half the previous pace (250 ms)', () => {
    expect(TICK_MS).toBe(500);
    expect(MINUTES_PER_TICK).toBe(15);
    expect(SPEEDS).toEqual([1, 2, 4]);
    expect(secondsPerDay(1)).toBe(25);
    expect(secondsPerDay(2)).toBe(12.5);
    expect(secondsPerDay(4)).toBe(6.25);
    expect(OPERATING_MINUTES).toBe(750); // the simulated day itself is unchanged
  });

  it.each(SPEEDS)('at %i× the clock advances %i× as far per step, on the same 500 ms timer', (speed) => {
    const { result } = mount();
    act(() => result.current.setSpeed(speed as Speed));
    act(() => result.current.start());
    expect(vi.getTimerCount()).toBe(1);
    wait(TICK_MS - 1);
    expect(result.current.simulator.op).toBe(0); // nothing yet: the step has not come round
    wait(1);
    expect(result.current.simulator.op).toBe(MINUTES_PER_TICK * speed);
    wait(TICK_MS);
    expect(result.current.simulator.op).toBe(2 * MINUTES_PER_TICK * speed);
    // The first live day closes after 25 s at 1×, 12.5 s at 2× and 6.5 s at 4×
    // (12.5 steps, so its 13th step; ten days average 6.25 s).
    const closedDays = () => Object.keys(result.current.simulator.closed[LIVE_PROFILES[0]]).length;
    const history = closedDays();
    const steps = Math.ceil(OPERATING_MINUTES / (MINUTES_PER_TICK * speed));
    wait((steps - 3) * TICK_MS);
    expect(closedDays()).toBe(history);
    wait(TICK_MS);
    expect(closedDays()).toBe(history + 1);
    expect(steps * TICK_MS).toBe({ 1: 25_000, 2: 12_500, 4: 6_500 }[speed]);
  });

  it('ends with identical results at 1×, 2× and 4× — only the elapsed time differs', () => {
    const reference = new LiveSimulator();
    while (!reference.finished) reference.advance(MINUTES_PER_TICK);
    const elapsed: Record<number, number> = {};
    for (const speed of SPEEDS) {
      const view = mount();
      act(() => view.result.current.setSpeed(speed));
      act(() => view.result.current.start());
      let ms = 0;
      while (view.result.current.playing) {
        wait(TICK_MS);
        ms += TICK_MS;
      }
      const sim = view.result.current.simulator;
      expect(sim.finished).toBe(true);
      expect(sim.op).toBe(END_MINUTE);
      expect(vi.getTimerCount()).toBe(0); // the timer is cleared at the end
      expect(outcome(sim), `${speed}×`).toEqual(outcome(reference));
      elapsed[speed] = ms;
      view.unmount();
    }
    // Ten live days: 250 s at 1×, 125 s at 2×, 62.5 s at 4×.
    expect(elapsed[1]).toBe(250_000);
    expect(elapsed[2]).toBe(125_000);
    expect(elapsed[4]).toBe(62_500);
  });

  it('pause, resume, speed changes and reset keep exactly one timer while playing and none otherwise', () => {
    const { result } = mount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.start());
    expect(vi.getTimerCount()).toBe(1);
    wait(TICK_MS * 4);
    expect(result.current.simulator.op).toBe(60);
    act(() => result.current.pause());
    expect(vi.getTimerCount()).toBe(0);
    wait(TICK_MS * 20);
    expect(result.current.simulator.op).toBe(60); // paused: simulated time stands still
    act(() => result.current.resume());
    expect(vi.getTimerCount()).toBe(1);
    for (const speed of [2, 4, 1, 4] as const) {
      act(() => result.current.setSpeed(speed));
      expect(vi.getTimerCount()).toBe(1); // replaced, never duplicated
    }
    wait(TICK_MS);
    expect(result.current.simulator.op).toBe(60 + MINUTES_PER_TICK * 4);
    act(() => result.current.reset());
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.simulator.op).toBe(0);
    expect(result.current.started).toBe(false);
    expect(outcome(result.current.simulator)).toEqual(outcome(new LiveSimulator()));
    act(() => result.current.start());
    expect(vi.getTimerCount()).toBe(1);
    wait(TICK_MS);
    expect(result.current.simulator.op).toBe(MINUTES_PER_TICK * 4); // the chosen speed survives reset
  });
});
