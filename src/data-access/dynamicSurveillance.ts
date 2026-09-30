/**
 * API CAPSTONE MODE ONLY: client for the dynamic surveillance endpoints
 * (/api/surveillance/dynamic). Dynamic signals are calculated by the backend's
 * dynamic surveillance engine from persisted laboratory observations; they are
 * never the frozen five-day classroom demonstration.
 *
 * Local mode (and the GitHub Pages build) never constructs this client, so it
 * never sends a request.
 */
import { ApiError, createApiClient, type FetchLike } from './apiClient';

export type CalculationStatus = 'CALCULATED' | 'INSUFFICIENT_BASELINE' | 'NO_DATA';
export type ComponentKey = 'volume' | 'positivity' | 'facilities' | 'geography' | 'persistence';
export type FacilityStatus = 'ABNORMAL' | 'NORMAL' | 'BELOW_MINIMUM' | 'INSUFFICIENT_BASELINE' | 'NOT_REPORTING';

export interface DynamicSignalSummary {
  id: number;
  mode: 'dynamic';
  syndrome: string;
  signal_date: string;
  calculation_status: CalculationStatus;
  test_volume: number;
  positive_count: number;
  positivity_rate: number;
  baseline_volume: number | null;
  baseline_positivity_rate: number | null;
  affected_facilities: number;
  participating_facilities: number;
  affected_geographies: string[];
  participating_geographies: number;
  persistence_days: number;
  composite_score: number | null;
  severity: 'Low' | 'Watch' | 'Moderate' | 'High' | 'Critical' | null;
  data_confidence_score: number | null;
  data_confidence_level: 'Very High' | 'High' | 'Moderate' | 'Low' | null;
  status: string;
  calculated_at: string | null;
}

export interface DynamicComponent {
  key: ComponentKey;
  label: string;
  weight: number;
  max_points: number;
  raw: Record<string, number | null>;
  normalized: number;
  weighted: number;
  points: number;
}

export interface DynamicFacility {
  facility_code: string;
  name: string;
  vendor: string;
  area: string;
  subregion: string | null;
  tests: number;
  positive: number;
  negative: number;
  positivity_rate: number | null;
  baseline_mean_tests: number | null;
  baseline_positivity_rate: number | null;
  baseline_observed_days: number;
  volume_change_percent: number | null;
  positivity_change_points: number | null;
  status: FacilityStatus;
  reasons: string[];
}

export interface DynamicArea {
  code: string;
  level: string;
  subregion: string | null;
  region: string;
  country_code: string;
}

export interface DynamicConfidence {
  score: number;
  level: 'Very High' | 'High' | 'Moderate' | 'Low';
  facilities_reporting: number;
  facilities_total: number;
  explanation: string;
  components: { key: string; label: string; weight: number; max_points: number; score: number; points: number; evidence: string }[];
}

export interface DynamicCalculation {
  engine_version: string;
  config: Record<string, number | string>;
  method: Record<string, string>;
  current: { tests: number; positive: number; negative: number; indeterminate: number; positivity_rate: number | null };
  baseline: {
    window_start: string;
    window_end: string;
    window_days: number;
    observed_days: number;
    min_days: number;
    mean_tests: number | null;
    positivity_rate: number | null;
    status: 'SUFFICIENT' | 'INSUFFICIENT_BASELINE';
  };
  changes?: { volume_change_percent: number; positivity_change_points: number };
  components?: DynamicComponent[];
  composite?: { unrounded: number; score: number; severity: string };
  facilities: DynamicFacility[];
  geography: { level: string; participating: DynamicArea[]; affected: DynamicArea[] };
  persistence: { days: number; rule: string; previous_signal?: string; previous_abnormal?: boolean };
  data_confidence: DynamicConfidence | null;
  message?: string;
}

export interface DynamicSignal extends DynamicSignalSummary {
  volume_component_score: number | null;
  positivity_component_score: number | null;
  facility_component_score: number | null;
  geography_component_score: number | null;
  persistence_component_score: number | null;
  message: string | null;
  calculation: DynamicCalculation;
}

export interface DynamicSummary {
  mode: 'dynamic';
  syndrome: string;
  disclaimer: string;
  method: {
    engine_version: string;
    config: Record<string, number | string>;
    description: Record<string, string>;
    weights: Record<ComponentKey, number>;
  };
  signal_count: number;
  first_date: string | null;
  last_date: string | null;
  latest: DynamicSignal | null;
  recalculation_available: boolean;
}

export interface RecalculateResult {
  syndrome: string;
  date_from: string | null;
  date_to: string | null;
  created: number;
  updated: number;
  unchanged: number;
  days: {
    signal_date: string;
    outcome: 'created' | 'updated' | 'unchanged';
    signal_id: number;
    calculation_status: CalculationStatus;
    composite_score: number | null;
    severity: string | null;
    previous_severity: string | null;
  }[];
  skipped: string[];
  message: string;
}

const invalid = (what: string): never => {
  throw new ApiError('invalid-response', `Unexpected response from ${what}.`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const STATUSES: CalculationStatus[] = ['CALCULATED', 'INSUFFICIENT_BASELINE', 'NO_DATA'];

const isSummary = (value: unknown): value is DynamicSignalSummary =>
  isObject(value) &&
  value.mode === 'dynamic' &&
  typeof value.id === 'number' &&
  typeof value.signal_date === 'string' &&
  STATUSES.includes(value.calculation_status as CalculationStatus) &&
  typeof value.test_volume === 'number' &&
  (value.composite_score === null || typeof value.composite_score === 'number');

const parseSignal = (value: unknown, where: string): DynamicSignal => {
  if (!isSummary(value) || !isObject((value as unknown as Record<string, unknown>).calculation)) return invalid(where);
  const calculation = (value as unknown as { calculation: Record<string, unknown> }).calculation;
  if (!isObject(calculation.baseline) || !Array.isArray(calculation.facilities)) return invalid(where);
  return value as DynamicSignal;
};

export const DYNAMIC_PATH = '/api/surveillance/dynamic';

export const createDynamicSurveillanceClient = (baseUrl: string, fetchImpl?: FetchLike) => {
  const client = createApiClient(baseUrl, fetchImpl);

  return {
    async summary(signal?: AbortSignal): Promise<DynamicSummary> {
      const value = await client.getJson(`${DYNAMIC_PATH}/summary`, undefined, signal);
      if (!isObject(value) || value.mode !== 'dynamic' || typeof value.signal_count !== 'number') {
        return invalid(`${DYNAMIC_PATH}/summary`);
      }
      if (value.latest !== null) parseSignal(value.latest, `${DYNAMIC_PATH}/summary`);
      return value as unknown as DynamicSummary;
    },

    async signals(signal?: AbortSignal): Promise<DynamicSignalSummary[]> {
      const value = await client.getJson(`${DYNAMIC_PATH}/signals`, undefined, signal);
      if (!Array.isArray(value) || !value.every(isSummary)) return invalid(`${DYNAMIC_PATH}/signals`);
      return value;
    },

    /** The signal for a date, or the latest when no date is given. Null when none exists. */
    async signalFor(date: string | null, signal?: AbortSignal): Promise<DynamicSignal | null> {
      try {
        const value = await client.getJson(
          `${DYNAMIC_PATH}/signals/current`,
          date ? { date } : undefined,
          signal,
        );
        return parseSignal(value, `${DYNAMIC_PATH}/signals/current`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },

    /**
     * DEVELOPMENT ONLY: run the engine over every date with observations.
     * 'unavailable' when the backend is not in development (404).
     */
    async recalculate(signal?: AbortSignal): Promise<RecalculateResult | 'unavailable'> {
      const reply = await client.postText(`${DYNAMIC_PATH}/recalculate`, '{}', 'application/json', signal);
      if (reply.status === 404) return 'unavailable';
      const body = reply.body;
      if (reply.status !== 200 || !isObject(body) || !Array.isArray(body.days) || typeof body.message !== 'string') {
        const detail = isObject(body) && typeof body.detail === 'string' ? ` ${body.detail}` : '';
        throw new ApiError('http', `Recalculation was not accepted (HTTP ${reply.status}).${detail}`, reply.status);
      }
      return body as unknown as RecalculateResult;
    },
  };
};

export type DynamicSurveillanceClient = ReturnType<typeof createDynamicSurveillanceClient>;
