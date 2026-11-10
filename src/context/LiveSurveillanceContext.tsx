/**
 * Live Surveillance: the mode switch and the in-browser source simulation.
 *
 * Two modes, kept apart:
 *  - Live Surveillance — the primary experience and the default: synthetic
 *    observations arriving through three simulated source feeds, processed
 *    and scored in the browser;
 *  - Scenario Replay — the secondary training mode: the controlled five-day
 *    Respiratory Viral Syndrome scenario (SimulationContext), unchanged.
 *
 * A fresh session opens in Live Surveillance. An explicit choice of Scenario
 * Replay is kept for the browser session (sessionStorage) until the analyst
 * switches back or the session ends; a refresh keeps it. The live
 * simulation itself is NOT persisted: a refresh starts it again from the
 * beginning, so it is always deterministic and nothing is stored. There is
 * exactly one timer; it exists only while playing and is cleared on pause,
 * reset, finish and unmount.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AcknowledgementRecord, HospitalId } from '../types';
import { LiveSimulator } from '../lib/live/simulator';
import type { LiveTestCode } from '../lib/live/dataset';

export type SurveillanceMode = 'replay' | 'live';

export const MODE_STORAGE_KEY = 'labsentinel.surveillanceMode.v1';
/** Real milliseconds between simulation steps. */
export const TICK_MS = 250;
/** Simulated operating minutes per step at 1x: one surveillance day in about 12.5 seconds. */
export const MINUTES_PER_TICK = 15;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

const readMode = (): SurveillanceMode => {
  try {
    return window.sessionStorage.getItem(MODE_STORAGE_KEY) === 'replay' ? 'replay' : 'live';
  } catch {
    return 'live';
  }
};

export interface LiveSurveillanceValue {
  mode: SurveillanceMode;
  setMode: (mode: SurveillanceMode) => void;
  simulator: LiveSimulator;
  /** Changes whenever the simulation does; use it as a memo dependency. */
  version: number;
  playing: boolean;
  started: boolean;
  speed: Speed;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setSpeed: (speed: Speed) => void;
  /** A synthetic test observation, through the facility's own adapter. */
  inject: (hospitalId: HospitalId, code: LiveTestCode, positive: boolean) => void;
  acknowledgements: Record<string, AcknowledgementRecord>;
  acknowledge: (alertId: string) => void;
}

const LiveContext = createContext<LiveSurveillanceValue | undefined>(undefined);

export function LiveSurveillanceProvider({ children }: { children: ReactNode }) {
  const simulator = useRef<LiveSimulator | null>(null);
  simulator.current ??= new LiveSimulator();
  const [mode, setModeState] = useState<SurveillanceMode>(readMode);
  const [version, setVersion] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [acknowledgements, setAcknowledgements] = useState<Record<string, AcknowledgementRecord>>({});

  const setMode = useCallback((next: SurveillanceMode) => {
    setModeState(next);
    try {
      window.sessionStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the mode still applies for this page.
    }
  }, []);

  // The one timer. Re-created only when playing or speed changes; always cleared.
  useEffect(() => {
    if (!playing) return undefined;
    const sim = simulator.current!;
    const id = window.setInterval(() => {
      sim.advance(MINUTES_PER_TICK * speed);
      if (sim.finished) setPlaying(false);
      setVersion(sim.version);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  const start = useCallback(() => {
    setStarted(true);
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const resume = useCallback(() => {
    if (!simulator.current!.finished) setPlaying(true);
  }, []);
  const reset = useCallback(() => {
    setPlaying(false);
    setStarted(false);
    simulator.current!.reset();
    setAcknowledgements({});
    setVersion(simulator.current!.version);
  }, []);
  const inject = useCallback((hospitalId: HospitalId, code: LiveTestCode, positive: boolean) => {
    simulator.current!.inject(hospitalId, code, positive);
    setStarted(true);
    setVersion(simulator.current!.version);
  }, []);
  const acknowledge = useCallback((alertId: string) => {
    const sim = simulator.current!;
    setAcknowledgements((current) =>
      current[alertId]
        ? current
        : {
            ...current,
            [alertId]: {
              day: sim.currentDay as AcknowledgementRecord['day'],
              simulationTime: new Date().toISOString(),
              realTime: new Date().toISOString(),
            },
          },
    );
  }, []);

  const value = useMemo<LiveSurveillanceValue>(
    () => ({
      mode,
      setMode,
      simulator: simulator.current!,
      version,
      playing,
      started,
      speed,
      start,
      pause,
      resume,
      reset,
      setSpeed,
      inject,
      acknowledgements,
      acknowledge,
    }),
    [mode, setMode, version, playing, started, speed, start, pause, resume, reset, inject, acknowledgements, acknowledge],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLiveSurveillance(): LiveSurveillanceValue {
  const context = useContext(LiveContext);
  if (!context) throw new Error('useLiveSurveillance must be used inside a LiveSurveillanceProvider.');
  return context;
}

/** For components that may render outside the provider (tests, sign-in). */
export function useOptionalLiveSurveillance(): LiveSurveillanceValue | undefined {
  return useContext(LiveContext);
}
