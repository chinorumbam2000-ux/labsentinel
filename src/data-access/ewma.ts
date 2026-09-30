/**
 * API CAPSTONE MODE ONLY: client for the experimental EWMA statistical
 * detector (/api/statistics/ewma). EWMA runs beside the Composite Outbreak
 * Signal Score on the backend and is never combined with it.
 *
 * Local mode never constructs this client, so it never sends a request.
 */
import { ApiError, createApiClient, type FetchLike } from './apiClient';

export type EwmaMetric = 'volume' | 'positivity';
export type EwmaState = 'NORMAL' | 'WATCH' | 'STATISTICAL_ALERT';
export type EwmaStatus = 'CALCULATED' | 'REFERENCE_PERIOD' | 'INSUFFICIENT_BASELINE' | 'INSUFFICIENT_VARIANCE' | 'NO_DATA';
export type Agreement = 'BOTH_METHODS_SIGNAL' | 'COMPOSITE_ONLY' | 'EWMA_ONLY' | 'NEITHER' | 'NOT_AVAILABLE';

export interface EwmaPoint {
  id: number;
  method: 'EWMA';
  metric: EwmaMetric;
  signal_date: string;
  calculation_status: EwmaStatus;
  observed_value: number | null;
  baseline_mean: number | null;
  baseline_stddev: number | null;
  previous_ewma: number | null;
  ewma_value: number | null;
  upper_control_limit: number | null;
  warning_limit: number | null;
  distance_to_ucl: number | null;
  alert_state: EwmaState | null;
  lambda_value: number;
  k_value: number;
  update: number;
  reference_first: string;
  reference_last: string;
  reference_days: number;
  explanation: string;
  calculated_at: string;
}

export interface EwmaDay {
  syndrome: string;
  signal_date: string;
  volume: EwmaPoint | null;
  positivity: EwmaPoint | null;
  overall_state: EwmaState | null;
  overall_basis: EwmaMetric[];
  composite: {
    signal_id: number;
    calculation_status: string;
    composite_score: number | null;
    severity: 'Low' | 'Watch' | 'Moderate' | 'High' | 'Critical' | null;
  } | null;
  composite_signals: boolean | null;
  ewma_signals: boolean | null;
  agreement: Agreement;
  agreement_text: string;
}

export interface EwmaReference {
  first: string;
  last: string;
  days: number;
  mean: number | null;
  stddev: number | null;
  status: string;
}

export type DetectionLevel = 'watch' | 'alert';
export type CompositeBand = 'Watch' | 'Moderate' | 'High' | 'Critical';

export interface EwmaDetection {
  evaluation_from: string;
  evaluation_to: string;
  composite_first: Record<CompositeBand, string | null>;
  ewma_first: Record<EwmaMetric | 'overall', Record<DetectionLevel, string | null>>;
  lead_days: Record<string, Record<CompositeBand, number | null>>;
  lead_note: string;
}

export interface EwmaSummary {
  mode: 'dynamic';
  method: 'EWMA';
  label: string;
  disclaimer: string;
  detector_note: string;
  syndrome: string;
  config: { lambda: number; k: number; warning_fraction: number; reference_days: number; min_reference_days: number };
  formula: Record<string, string>;
  references: Partial<Record<EwmaMetric, EwmaReference>>;
  first_date: string | null;
  last_date: string | null;
  monitoring_from: string | null;
  latest_date: string | null;
  result_count: number;
  detection: EwmaDetection | null;
  agreement_rule: string;
  recalculation_available: boolean;
}

export interface EwmaRecalculation {
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  state_changes: string[];
  message: string;
}

const BASE_PATH = '/api/statistics/ewma';

const invalid = (what: string): never => {
  throw new ApiError('invalid-response', `Unexpected response from ${what}.`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPoint = (value: unknown): value is EwmaPoint =>
  isObject(value) &&
  value.method === 'EWMA' &&
  (value.metric === 'volume' || value.metric === 'positivity') &&
  typeof value.signal_date === 'string' &&
  typeof value.calculation_status === 'string' &&
  (value.ewma_value === null || typeof value.ewma_value === 'number');

export const createEwmaClient = (baseUrl: string, fetchImpl?: FetchLike) => {
  const client = createApiClient(baseUrl, fetchImpl);

  return {
    async summary(signal?: AbortSignal): Promise<EwmaSummary> {
      const value = await client.getJson(BASE_PATH, undefined, signal);
      if (!isObject(value) || value.method !== 'EWMA' || typeof value.result_count !== 'number') return invalid(BASE_PATH);
      return value as unknown as EwmaSummary;
    },

    async history(signal?: AbortSignal): Promise<EwmaPoint[]> {
      const value = await client.getJson(`${BASE_PATH}/history`, undefined, signal);
      if (!Array.isArray(value) || !value.every(isPoint)) return invalid(`${BASE_PATH}/history`);
      return value;
    },

    /** Both metrics for a date (default the latest monitored); null when none was calculated. */
    async day(date: string | null, signal?: AbortSignal): Promise<EwmaDay | null> {
      try {
        const value = await client.getJson(`${BASE_PATH}/current`, date ? { date } : undefined, signal);
        if (!isObject(value) || typeof value.agreement !== 'string') return invalid(`${BASE_PATH}/current`);
        for (const metric of ['volume', 'positivity'] as const) {
          if (value[metric] !== null && !isPoint(value[metric])) return invalid(`${BASE_PATH}/current`);
        }
        return value as unknown as EwmaDay;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },

    /** DEVELOPMENT ONLY. 'unavailable' when the backend is not in development (404). */
    async recalculate(signal?: AbortSignal): Promise<EwmaRecalculation | 'unavailable'> {
      const reply = await client.postText(`${BASE_PATH}/recalculate`, '{}', 'application/json', signal);
      if (reply.status === 404) return 'unavailable';
      const body = reply.body;
      if (reply.status !== 200 || !isObject(body) || typeof body.message !== 'string') {
        throw new ApiError('http', `EWMA recalculation was not accepted (HTTP ${reply.status}).`, reply.status);
      }
      return body as unknown as EwmaRecalculation;
    },
  };
};

export type EwmaClient = ReturnType<typeof createEwmaClient>;
