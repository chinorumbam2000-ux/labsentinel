/**
 * The single source of truth for the whole prototype.
 *
 * Exactly one `currentDay` exists. Every page reads it from here, so advancing
 * the day updates the dashboard, map, tables, alerts, hospital views and all
 * three vendor sidecars in the same render.
 *
 * Two clocks are kept deliberately separate:
 *   - the SIMULATION calendar (Nov 3-7, 2025), which stamps observations and
 *     alerts, and
 *   - the real SESSION clock, which only ever says when this browser tab last
 *     recalculated.
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
  AcknowledgementRecord,
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
  simulationTimestamp,
} from '../data/simulation';
import { getVisibleObservations } from '../data/observations';
import {
  getAllHospitalMetrics,
  getCumulativeTotals,
  getObservationCounts,
  getScoreForDay,
  getZipMetrics,
} from '../lib/selectors';
import {
  getAlerts,
  getNewTodayCount,
  getRegionalAlert,
  getUnacknowledgedCount,
} from '../lib/alerts';
import { getTrendSeries, type TrendPoint } from '../lib/analytics';
import {
  clearSession,
  loadSession,
  saveSession,
  type PersistedSession,
} from '../lib/sessionState';

export interface SimulationContextValue {
  currentDay: SimulationDay;
  currentScenario: SimulationScenario;
  /** Simulation-calendar date for the current day (not the session clock). */
  simulationDate: string;
  visibleObservations: LabObservation[];
  observationCounts: { day: number; cumulative: number };
  cumulativeTotals: ReturnType<typeof getCumulativeTotals>;
  signalScore: SignalScoreResult;
  zipMetrics: ZipMetrics[];
  hospitalMetrics: HospitalMetrics[];
  alerts: OutbreakAlert[];
  regionalAlert: OutbreakAlert | undefined;
  /** Alerts awaiting acknowledgement — what the notification badge counts. */
  unacknowledgedCount: number;
  /** Alerts first detected on the current simulation day. */
  newTodayCount: number;
  acknowledgements: Record<string, AcknowledgementRecord>;
  trendSeries: TrendPoint[];
  /** Real wall-clock time of the last recalculation in this browser tab. */
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
  acknowledgeAlert: (alertId: string) => void;
  refresh: () => void;
  clearError: () => void;
}

const SimulationContext = createContext<SimulationContextValue | undefined>(undefined);

/** Brief spinner on day change, so the loading state is a real, visible state. */
const TRANSITION_MS = 220;

/** Acknowledgements are stamped at the end of the acknowledging day. */
const ACK_CLOCK = '17:00';

export function SimulationProvider({ children }: { children: ReactNode }) {
  // Restored synchronously so the first paint is already the right day.
  const restored = useRef<PersistedSession>(loadSession());

  const [currentDay, setCurrentDay] = useState<SimulationDay>(restored.current.day);
  const [acknowledgements, setAcknowledgements] = useState<
    Record<string, AcknowledgementRecord>
  >(restored.current.acknowledgements);
  // Autoplay is never restored: a refresh always comes back paused.
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  const loadingTimer = useRef<number | null>(null);
  const playTimer = useRef<number | null>(null);

  // Persist whenever either piece of session state changes.
  useEffect(() => {
    saveSession({ day: currentDay, acknowledgements });
  }, [currentDay, acknowledgements]);

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
        setError(`Simulation day ${day} is outside the valid range (1-5).`);
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

  /** Acknowledgement only ever happens here, from an explicit user action. */
  const acknowledgeAlert = useCallback(
    (alertId: string) => {
      setAcknowledgements((current) => {
        if (current[alertId]) return current;
        return {
          ...current,
          [alertId]: {
            day: currentDay,
            simulationTime: simulationTimestamp(currentDay, ACK_CLOCK),
            realTime: new Date().toISOString(),
          },
        };
      });
    },
    [currentDay],
  );

  const resetSimulation = useCallback(() => {
    setIsPlaying(false);
    setError(null);
    setAcknowledgements({});
    clearSession();
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
    const currentScenario = getScenario(currentDay);
    return {
      currentDay,
      currentScenario,
      simulationDate: currentScenario.simulationDate,
      visibleObservations: getVisibleObservations(currentDay),
      observationCounts: getObservationCounts(currentDay),
      cumulativeTotals: getCumulativeTotals(currentDay),
      signalScore: getScoreForDay(currentDay),
      zipMetrics: getZipMetrics(currentDay),
      hospitalMetrics: getAllHospitalMetrics(currentDay),
      alerts: getAlerts(currentDay, acknowledgements),
      regionalAlert: getRegionalAlert(currentDay, acknowledgements),
      unacknowledgedCount: getUnacknowledgedCount(currentDay, acknowledgements),
      newTodayCount: getNewTodayCount(currentDay),
      acknowledgements,
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
      acknowledgeAlert,
      refresh,
      clearError,
    };
  }, [
    currentDay,
    acknowledgements,
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
    acknowledgeAlert,
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
