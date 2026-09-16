/**
 * The single source of truth for the whole prototype.
 *
 * Exactly one `currentDay` exists. Every page reads it from here, so advancing
 * the day updates the dashboard, map, tables, alerts, hospital views and all
 * three vendor sidecars in the same render.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
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
import type {
  HospitalMetrics,
  LabObservation,
  OutbreakAlert,
  SignalScoreResult,
  SimulationDay,
  SimulationScenario,
  ZipMetrics,
} from '../types';
import {
  AUTOPLAY_INTERVAL_MS,
  FIRST_DAY,
  LAST_DAY,
  getScenario,
} from '../data/simulation';
import { getVisibleObservations } from '../data/observations';
import {
  getAllHospitalMetrics,
  getScoreForDay,
  getZipMetrics,
} from '../lib/selectors';
import { getAlerts, getNewAlertCount, getRegionalAlert } from '../lib/alerts';
import { getTrendSeries, type TrendPoint } from '../lib/analytics';

export interface SimulationContextValue {
  currentDay: SimulationDay;
  currentScenario: SimulationScenario;
  visibleObservations: LabObservation[];
  signalScore: SignalScoreResult;
  zipMetrics: ZipMetrics[];
  hospitalMetrics: HospitalMetrics[];
  alerts: OutbreakAlert[];
  regionalAlert: OutbreakAlert | undefined;
  newAlertCount: number;
  trendSeries: TrendPoint[];
  lastUpdated: Date;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  isFirstDay: boolean;
  isLastDay: boolean;
  nextDay: () => void;
  previousDay: () => void;
  goToDay: (day: number) => void;
  resetSimulation: () => void;
  playSimulation: () => void;
  pauseSimulation: () => void;
  refresh: () => void;
  clearError: () => void;
}

const SimulationContext = createContext<SimulationContextValue | undefined>(undefined);

/** Brief spinner on day change, so the loading state is a real, visible state. */
const TRANSITION_MS = 220;

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [currentDay, setCurrentDay] = useState<SimulationDay>(FIRST_DAY);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  const loadingTimer = useRef<number | null>(null);
  const playTimer = useRef<number | null>(null);

  const clearLoadingTimer = useCallback(() => {
    if (loadingTimer.current !== null) {
      window.clearTimeout(loadingTimer.current);
      loadingTimer.current = null;
    }
  }, []);

  const applyDay = useCallback(
    (nextValue: SimulationDay) => {
      setIsLoading(true);
      setCurrentDay(nextValue);
      setLastUpdated(new Date());
      clearLoadingTimer();
      loadingTimer.current = window.setTimeout(() => {
        setIsLoading(false);
        loadingTimer.current = null;
      }, TRANSITION_MS);
    },
    [clearLoadingTimer],
  );

  const nextDay = useCallback(() => {
    // Hard stop at Day 5 — advancing can never go beyond the simulation.
    if (currentDay >= LAST_DAY) return;
    applyDay((currentDay + 1) as SimulationDay);
  }, [currentDay, applyDay]);

  const previousDay = useCallback(() => {
    // Hard stop at Day 1 — previous can never go below baseline.
    if (currentDay <= FIRST_DAY) return;
    applyDay((currentDay - 1) as SimulationDay);
  }, [currentDay, applyDay]);

  const goToDay = useCallback(
    (day: number) => {
      if (!Number.isFinite(day) || day < FIRST_DAY || day > LAST_DAY) {
        setError(`Simulation day ${day} is outside the valid range (1–5).`);
        return;
      }
      applyDay(day as SimulationDay);
    },
    [applyDay],
  );

  const pauseSimulation = useCallback(() => setIsPlaying(false), []);

  const playSimulation = useCallback(() => {
    // Pressing play on the final day restarts the run from baseline.
    if (currentDay >= LAST_DAY) {
      applyDay(FIRST_DAY);
    }
    setIsPlaying(true);
  }, [currentDay, applyDay]);

  const resetSimulation = useCallback(() => {
    setIsPlaying(false);
    setError(null);
    applyDay(FIRST_DAY);
  }, [applyDay]);

  const refresh = useCallback(() => {
    setLastUpdated(new Date());
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Auto-play advances one day every ~3 seconds and stops hard at Day 5.
  useEffect(() => {
    if (!isPlaying) return undefined;
    if (currentDay >= LAST_DAY) {
      setIsPlaying(false);
      return undefined;
    }
    playTimer.current = window.setTimeout(() => {
      nextDay();
    }, AUTOPLAY_INTERVAL_MS);

    return () => {
      if (playTimer.current !== null) {
        window.clearTimeout(playTimer.current);
        playTimer.current = null;
      }
    };
  }, [isPlaying, currentDay, nextDay]);

  // Clean up the transition timer on unmount.
  useEffect(() => clearLoadingTimer, [clearLoadingTimer]);

  const value = useMemo<SimulationContextValue>(() => {
    try {
      const currentScenario = getScenario(currentDay);
      const alerts = getAlerts(currentDay);
      return {
        currentDay,
        currentScenario,
        visibleObservations: getVisibleObservations(currentDay),
        signalScore: getScoreForDay(currentDay),
        zipMetrics: getZipMetrics(currentDay),
        hospitalMetrics: getAllHospitalMetrics(currentDay),
        alerts,
        regionalAlert: getRegionalAlert(currentDay),
        newAlertCount: getNewAlertCount(currentDay),
        trendSeries: getTrendSeries(currentDay),
        lastUpdated,
        isPlaying,
        isLoading,
        error,
        isFirstDay: currentDay <= FIRST_DAY,
        isLastDay: currentDay >= LAST_DAY,
        nextDay,
        previousDay,
        goToDay,
        resetSimulation,
        playSimulation,
        pauseSimulation,
        refresh,
        clearError,
      };
    } catch (caught) {
      // Should be unreachable: currentDay is always clamped to 1..5.
      throw caught instanceof Error
        ? caught
        : new Error('Unable to derive simulation state.');
    }
  }, [
    currentDay,
    lastUpdated,
    isPlaying,
    isLoading,
    error,
    nextDay,
    previousDay,
    goToDay,
    resetSimulation,
    playSimulation,
    pauseSimulation,
    refresh,
    clearError,
  ]);

  return (
    <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>
  );
}

export function useSimulation(): SimulationContextValue {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation must be used inside a SimulationProvider.');
  }
  return context;
}
