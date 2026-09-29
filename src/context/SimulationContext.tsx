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
  Hospital,
  DataConfidenceResult,
  DayOverDayComparison,
  FacilityFeedHealth,
  HospitalMetrics,
  InvestigationAction,
  InvestigationRecord,
  ReportAction,
  ReportRecord,
  LabObservation,
  OutbreakAlert,
  SignalScoreResult,
  SimulationDay,
  SimulationScenario,
  SurveillanceDay,
  ZipMetrics,
} from '../types';
import {
  AUTOPLAY_INTERVAL_MS,
  FIRST_DAY,
  LAST_DAY,
  simulationTimestamp,
} from '../data/simulation';
import { HOSPITALS } from '../data/hospitals';
import { getVisibleObservations } from '../data/observations';
import {
  getAllHospitalMetrics,
  getObservationCounts,
  getZipMetrics,
} from '../lib/selectors';
import {
  getAlerts,
  getNewTodayCount,
  getRegionalAlert,
  getUnacknowledgedCount,
} from '../lib/alerts';
import { buildTrendSeries, type TrendPoint } from '../lib/analytics';
import { getAllFeedHealth } from '../data/feedHealth';
import { compareDays } from '../lib/dayOverDay';
import {
  DataIntegrityError,
  cumulativeTotalsFrom,
  dataConfidenceFor,
  findDay,
  signalScoreFor,
} from '../lib/surveillanceDays';
import { useSurveillanceData } from '../data-access/hooks';
import { useDataSourceContext } from '../data-access/DataSourceProvider';
import DataUnavailable from '../components/common/DataUnavailable';
import {
  applyInvestigationAction,
  createInvestigation,
  DEFAULT_INVESTIGATOR,
} from '../lib/investigationWorkflow';
import { applyReportAction, createReport } from '../lib/reporting';
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
  cumulativeTotals: ReturnType<typeof cumulativeTotalsFrom>;
  /** Participating facilities, from the active data source. */
  facilities: Hospital[];
  /** Every simulated day from the active data source, Day 1 first. */
  surveillanceDays: SurveillanceDay[];
  /** A day's score, with composite and severity exactly as the source supplied. */
  scoreForDay: (day: number) => SignalScoreResult;
  /** 'local' (synthetic demo data in the browser) or 'api' (FastAPI + PostgreSQL). */
  dataSourceMode: 'local' | 'api';
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
  /** Data trust, kept entirely separate from the outbreak signal score. */
  dataConfidence: DataConfidenceResult;
  feedHealth: FacilityFeedHealth[];
  dayOverDay: DayOverDayComparison;
  /** Human review state per alert. Browser-only; never transmitted. */
  investigations: Record<string, InvestigationRecord>;
  /** Simulated public-health reports. Browser-only; never transmitted. */
  reports: ReportRecord[];
  /** Returns the record for an alert, creating a NEW one on first access. */
  getInvestigation: (alertId: string) => InvestigationRecord | undefined;
  /** Applies an analyst action. Returns an error string when refused. */
  runInvestigationAction: (
    alertId: string,
    action: InvestigationAction,
    note?: string,
  ) => string | null;
  prepareReport: (alertId: string, analystNotes?: string) => string | null;
  runReportAction: (
    reportId: string,
    action: ReportAction,
    notes?: string,
  ) => string | null;
  updateReportNotes: (reportId: string, notes: string) => void;
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
  const [investigations, setInvestigations] = useState<
    Record<string, InvestigationRecord>
  >(restored.current.investigations);
  const [reports, setReports] = useState<ReportRecord[]>(restored.current.reports);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  // Autoplay is never restored: a refresh always comes back paused.
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  const loadingTimer = useRef<number | null>(null);
  const playTimer = useRef<number | null>(null);

  const { source } = useDataSourceContext();
  const data = useSurveillanceData(currentDay);

  /**
   * Everything the UI derives from the active data source's days. A
   * data-integrity failure is captured here so it can be shown to the user;
   * it is never replaced with other data.
   */
  const derived = useMemo(() => {
    if (data.status !== 'ready') return null;
    try {
      const { current, days, facilities } = data;
      // Per-facility and per-area daily views are still built from the
      // prototype's own site counts (they are not persisted yet), so they are
      // only valid while the source's facilities are the prototype's.
      const expected = HOSPITALS.map((h) => `${h.id} ${h.zipCode}`).join(', ');
      const received = facilities.map((h) => `${h.id} ${h.zipCode}`).join(', ');
      if (received !== expected) {
        throw new DataIntegrityError(
          `The facilities received (${received}) are not the prototype's (${expected}).`,
        );
      }
      const previous = currentDay > FIRST_DAY ? findDay(days, currentDay - 1) : null;
      return {
        ok: true as const,
        facilities,
        days,
        currentScenario: current.scenario,
        cumulativeTotals: cumulativeTotalsFrom(days, currentDay),
        signalScore: signalScoreFor(current),
        dataConfidence: dataConfidenceFor(current),
        trendSeries: buildTrendSeries(days, currentDay),
        dayOverDay: compareDays(
          currentDay,
          previous && { scenario: previous.scenario, composite: previous.compositeScore },
          { scenario: current.scenario, composite: current.compositeScore },
        ),
      };
    } catch (caught) {
      if (caught instanceof DataIntegrityError) {
        return { ok: false as const, message: `Surveillance data is inconsistent. ${caught.message}` };
      }
      throw caught;
    }
  }, [data, currentDay]);

  // Persist whenever either piece of session state changes.
  useEffect(() => {
    saveSession({ day: currentDay, acknowledgements, investigations, reports });
  }, [currentDay, acknowledgements, investigations, reports]);

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

  /**
   * Ensures a record exists for an alert. Creating it lazily means an alert
   * that has never been looked at carries no review state at all.
   */
  const ensureInvestigation = useCallback(
    (alertId: string): InvestigationRecord | undefined => {
      const existing = investigations[alertId];
      if (existing) return existing;

      const detection = getAlerts(currentDay, acknowledgements).find(
        (alert) => alert.id === alertId,
      );
      if (!detection) return undefined;
      return createInvestigation(alertId, detection.detectedDay, detection.detectedAt);
    },
    [investigations, currentDay, acknowledgements],
  );

  const getInvestigation = useCallback(
    (alertId: string) => ensureInvestigation(alertId),
    [ensureInvestigation],
  );

  const runInvestigationAction = useCallback(
    (alertId: string, action: InvestigationAction, note?: string): string | null => {
      const record = ensureInvestigation(alertId);
      if (!record) return 'That signal is not available on the current simulation day.';

      const result = applyInvestigationAction({
        record,
        action,
        day: currentDay,
        note,
        investigator: DEFAULT_INVESTIGATOR,
      });

      if (!result.ok) {
        setWorkflowError(result.error);
        return result.error;
      }

      setInvestigations((current) => ({ ...current, [alertId]: result.record }));
      setWorkflowError(null);

      // Acknowledging in the review workflow is the same act as acknowledging
      // the alert, so the notification count stays consistent with the review.
      if (action === 'acknowledge') {
        acknowledgeAlert(alertId);
      }
      return null;
    },
    [ensureInvestigation, currentDay, acknowledgeAlert],
  );

  const prepareReport = useCallback(
    (alertId: string, analystNotes?: string): string | null => {
      const alert = getAlerts(currentDay, acknowledgements).find(
        (item) => item.id === alertId,
      );
      if (!alert) return 'That signal is not available on the current simulation day.';

      const investigation = investigations[alertId];
      if (!investigation) {
        return 'Start a review before preparing a public-health report.';
      }

      if (!derived?.ok) return 'Surveillance data is not available right now.';
      const report = createReport({
        alert,
        investigation,
        scenario: derived.currentScenario,
        score: derived.signalScore,
        confidence: derived.dataConfidence,
        analystNotes,
      });

      setReports((current) => [report, ...current]);
      setWorkflowError(null);
      return null;
    },
    [currentDay, acknowledgements, investigations, derived],
  );

  const runReportAction = useCallback(
    (reportId: string, action: ReportAction, notes?: string): string | null => {
      const existing = reports.find((report) => report.id === reportId);
      if (!existing) return 'That report no longer exists in this session.';

      const result = applyReportAction(existing, action, { notes });
      if (!result.ok) {
        setWorkflowError(result.error);
        return result.error;
      }

      setReports((current) =>
        current.map((report) => (report.id === reportId ? result.report : report)),
      );
      setWorkflowError(null);
      return null;
    },
    [reports],
  );

  const updateReportNotes = useCallback((reportId: string, notes: string) => {
    setReports((current) =>
      current.map((report) =>
        report.id === reportId
          ? { ...report, analystNotes: notes, updatedAt: new Date().toISOString() }
          : report,
      ),
    );
  }, []);

  const resetSimulation = useCallback(() => {
    setIsPlaying(false);
    setError(null);
    setAcknowledgements({});
    setInvestigations({});
    setReports([]);
    setWorkflowError(null);
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

  const value = useMemo<SimulationContextValue | null>(() => {
    if (!derived?.ok) return null;
    const { currentScenario, days } = derived;
    return {
      currentDay,
      currentScenario,
      simulationDate: currentScenario.simulationDate,
      visibleObservations: getVisibleObservations(currentDay),
      observationCounts: getObservationCounts(currentDay),
      cumulativeTotals: derived.cumulativeTotals,
      facilities: derived.facilities,
      surveillanceDays: days,
      scoreForDay: (day: number) => signalScoreFor(findDay(days, day)),
      dataSourceMode: source.mode,
      signalScore: derived.signalScore,
      zipMetrics: getZipMetrics(currentDay),
      hospitalMetrics: getAllHospitalMetrics(currentDay),
      alerts: getAlerts(currentDay, acknowledgements),
      regionalAlert: getRegionalAlert(currentDay, acknowledgements),
      unacknowledgedCount: getUnacknowledgedCount(currentDay, acknowledgements),
      newTodayCount: getNewTodayCount(currentDay),
      acknowledgements,
      trendSeries: derived.trendSeries,
      dataConfidence: derived.dataConfidence,
      // Feed health is still a frontend-local simulation (not persisted).
      feedHealth: getAllFeedHealth(currentDay),
      dayOverDay: derived.dayOverDay,
      investigations,
      reports,
      getInvestigation,
      runInvestigationAction,
      prepareReport,
      runReportAction,
      updateReportNotes,
      lastUpdated,
      isPlaying,
      // Includes waiting for the API's summary of a newly selected day.
      isLoading: isLoading || (data.status === 'ready' && data.dayLoading),
      error: error ?? workflowError,
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
    derived,
    data,
    source,
    currentDay,
    acknowledgements,
    investigations,
    reports,
    getInvestigation,
    runInvestigationAction,
    prepareReport,
    runReportAction,
    updateReportNotes,
    workflowError,
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

  if (value === null) {
    // No other data is ever substituted: the user sees exactly why there is none.
    const message =
      data.status === 'error'
        ? data.message
        : derived && !derived.ok
          ? derived.message
          : null;
    return <DataUnavailable mode={source.mode} label={source.label} message={message} onRetry={data.retry} />;
  }

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
