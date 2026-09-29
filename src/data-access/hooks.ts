/**
 * React hooks over the data source.
 *
 * A source with synchronous access (local mode) is read synchronously, so the
 * standalone prototype renders exactly as it always has, with no loading step.
 * An asynchronous source (API mode) is fetched, cancelled when superseded, and
 * reported as loading or failed — never substituted with other data.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Hospital,
  ObservationPage,
  ObservationQuery,
  SimulationDay,
  SurveillanceDay,
} from '../types';
import { DataIntegrityError, findDay } from '../lib/surveillanceDays';
import { ApiError, isAbortError } from './apiClient';
import { canonicalJson } from './canonical';
import { useDataSource } from './DataSourceProvider';

export const API_UNAVAILABLE_MESSAGE = 'LabSentinel API is currently unavailable.';

/** A user-facing explanation of why API data could not be shown. */
export const describeDataError = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.kind === 'invalid-response') return `The LabSentinel API returned unexpected data. ${error.message}`;
    return `${API_UNAVAILABLE_MESSAGE} ${error.message}`;
  }
  if (error instanceof DataIntegrityError) return `The LabSentinel API returned inconsistent data. ${error.message}`;
  return `${API_UNAVAILABLE_MESSAGE} ${error instanceof Error ? error.message : String(error)}`;
};

export type SurveillanceData =
  | { status: 'loading'; retry: () => void }
  | { status: 'error'; message: string; retry: () => void }
  | {
      status: 'ready';
      facilities: Hospital[];
      /** Every simulated day. */
      days: SurveillanceDay[];
      /** The current day: the per-day summary once it has arrived. */
      current: SurveillanceDay;
      /** True while the current day's summary is being fetched. */
      dayLoading: boolean;
      retry: () => void;
    };

const sameDay = (a: SurveillanceDay, b: SurveillanceDay): boolean =>
  canonicalJson(a) === canonicalJson(b);

export function useSurveillanceData(currentDay: SimulationDay): SurveillanceData {
  const source = useDataSource();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // Local mode: synchronous, always ready.
  const syncData = useMemo(() => {
    if (!source.sync) return null;
    return {
      facilities: source.sync.facilities(),
      days: source.sync.signals(),
      current: source.sync.demoSummary(currentDay),
    };
  }, [source, currentDay]);

  // API mode: facilities and the whole signal history once (and on retry)...
  const [base, setBase] = useState<
    { facilities: Hospital[]; days: SurveillanceDay[] } | { error: unknown } | null
  >(null);
  useEffect(() => {
    if (source.sync) return undefined;
    const controller = new AbortController();
    setBase(null);
    Promise.all([source.getFacilities(controller.signal), source.getSignals(controller.signal)])
      .then(([facilities, days]) => {
        if (!controller.signal.aborted) setBase({ facilities, days });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setBase({ error });
      });
    return () => controller.abort();
  }, [source, attempt]);

  // ...then the current day's summary each time the simulated day changes.
  const [summary, setSummary] = useState<
    { day: SimulationDay; value: SurveillanceDay } | { day: SimulationDay; error: unknown } | null
  >(null);
  useEffect(() => {
    if (source.sync) return undefined;
    const controller = new AbortController();
    source
      .getDemoSummary(currentDay, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSummary({ day: currentDay, value });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setSummary({ day: currentDay, error });
      });
    return () => controller.abort();
  }, [source, currentDay, attempt]);

  if (syncData) return { status: 'ready', ...syncData, dayLoading: false, retry };

  if (base === null) return { status: 'loading', retry };
  if ('error' in base) return { status: 'error', message: describeDataError(base.error), retry };
  if (summary && summary.day === currentDay && 'error' in summary) {
    return { status: 'error', message: describeDataError(summary.error), retry };
  }

  let historyDay: SurveillanceDay;
  try {
    historyDay = findDay(base.days, currentDay);
  } catch (error) {
    return { status: 'error', message: describeDataError(error), retry };
  }

  const fresh = summary && summary.day === currentDay && 'value' in summary ? summary.value : null;
  if (fresh && !sameDay(fresh, historyDay)) {
    return {
      status: 'error',
      message: describeDataError(
        new DataIntegrityError(
          `Day ${currentDay}: /api/demo/summary and /api/signals disagree.`,
        ),
      ),
      retry,
    };
  }

  return {
    status: 'ready',
    facilities: base.facilities,
    days: base.days,
    // Both are persisted API data for this day; until the per-day summary
    // arrives the history's copy of the same day is shown, never another day's.
    current: fresh ?? historyDay,
    dayLoading: fresh === null,
    retry,
  };
}

export type ObservationPageState =
  | { status: 'ready'; page: ObservationPage; refreshing: boolean }
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void };

export function useObservationPage(query: ObservationQuery): ObservationPageState {
  const source = useDataSource();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const key = JSON.stringify(query);

  const syncPage = useMemo(
    () => (source.sync ? source.sync.observations(JSON.parse(key) as ObservationQuery) : null),
    [source, key],
  );

  const [state, setState] = useState<
    { key: string; page: ObservationPage } | { key: string; error: unknown } | null
  >(null);
  useEffect(() => {
    if (source.sync) return undefined;
    const controller = new AbortController();
    source
      .getObservations(JSON.parse(key) as ObservationQuery, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setState({ key, page });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setState({ key, error });
      });
    return () => controller.abort();
  }, [source, key, attempt]);

  if (syncPage) return { status: 'ready', page: syncPage, refreshing: false };
  if (state === null) return { status: 'loading' };
  if ('error' in state) {
    // A failure for an older query is no longer relevant once superseded.
    if (state.key === key) return { status: 'error', message: describeDataError(state.error), retry };
    return { status: 'loading' };
  }
  // Keep showing the previous page while the next one loads: no layout jump.
  return { status: 'ready', page: state.page, refreshing: state.key !== key };
}

/** Returns `value` once it has stopped changing for `delayMs` (0 = immediately). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) {
      setSettled(value);
      return undefined;
    }
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : settled;
}
