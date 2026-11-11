/**
 * Live Surveillance playback pace: how fast simulated time advances in real
 * time. Only the wall-clock pace lives here. The simulated clock, the
 * observations, source timing and every result are the simulator's alone and
 * do not depend on it.
 */
import { OPERATING_MINUTES } from './dataset';

/** Real milliseconds between simulation steps, at every speed. */
export const TICK_MS = 500;
/** Simulated operating minutes per step at 1×; 2× and 4× advance two and four times as many. */
export const MINUTES_PER_TICK = 15;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** Real seconds one surveillance day takes at the given speed (25 at 1×). */
export const secondsPerDay = (speed: Speed = 1) => (OPERATING_MINUTES / (MINUTES_PER_TICK * speed)) * (TICK_MS / 1000);
