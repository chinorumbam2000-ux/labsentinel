/**
 * API CAPSTONE MODE ONLY: client for the experimental CUSUM statistical
 * detector (/api/statistics/cusum) and the three-method comparison
 * (/api/statistics/comparison). The Composite Outbreak Signal Score, EWMA
 * and CUSUM are compared, never combined.
 *
 * Local mode never constructs this client, so it never sends a request.
 */
import { ApiError, createApiClient, type FetchLike } from './apiClient';
import type { EwmaMetric, EwmaReference, EwmaStatus } from './ewma';

export type CusumState = 'NORMAL' | 'STATISTICAL_ALERT';

export interface CusumPoint {
  id: number;
  method: 'CUSUM';
  metric: EwmaMetric;
  signal_date: string;
  calculation_status: EwmaStatus;
  observed_value: number | null;
  baseline_mean: number | null;
  baseline_stddev: number | null;
  z_score: number | null;
  increment: number | null;
  previous_cusum: number | null;
  cusum_value: number | null;
  k: number | null;
  h: number | null;
  distance_to_limit: number | null;
  alert_state: CusumState | null;
  /** Informational only: not a statistical alarm. */
  approaching_limit: boolean;
  update: number;
  reference_first: string;
  reference_last: string;
  reference_days: number;
  explanation: string;
  calculated_at: string;
}

export interface CusumDay {
  syndrome: string;
  signal_date: string;
  volume: CusumPoint | null;
  positivity: CusumPoint | null;
  overall_state: CusumState | null;
  overall_basis: EwmaMetric[];
}

export interface CusumDetection {
  evaluation_from: string;
  evaluation_to: string;
  composite_first: Record<'Watch' | 'Moderate' | 'High' | 'Critical', string | null>;
  ewma_first: Record<'volume' | 'positivity' | 'overall', { watch: string | null; alert: string | null }>;
  cusum_first: Record<'volume' | 'positivity' | 'overall', string | null>;
  lead_days: Record<'volume' | 'positivity' | 'overall', { composite_high: number | null; composite_critical: number | null; ewma_alert: number | null }>;
  lead_note: string;
  reference_check: Record<EwmaMetric, { days: number; alert_days: number; max_cusum: number | null }> | null;
}

export interface CusumSummary {
  mode: 'dynamic';
  method: 'CUSUM';
  label: string;
  disclaimer: string;
  syndrome: string;
  config: { k: number; h: number; approaching_fraction: number };
  formula: Record<string, string>;
  references: Partial<Record<EwmaMetric, EwmaReference>>;
  first_date: string | null;
  last_date: string | null;
  monitoring_from: string | null;
  latest_date: string | null;
  result_count: number;
  detection: CusumDetection | null;
  signal_rule: string;
  detector_set: string[];
  recalculation_available: boolean;
}

export interface MethodComparison {
  syndrome: string;
  signal_date: string;
  composite: { signal_id: number; calculation_status: string; composite_score: number | null; severity: 'Low' | 'Watch' | 'Moderate' | 'High' | 'Critical' | null } | null;
  ewma: { volume: string | null; positivity: string | null; overall: string | null };
  cusum: { volume: string | null; positivity: string | null; overall: string | null; approaching: Record<EwmaMetric, boolean> };
  methods: { composite: boolean | null; ewma: boolean | null; cusum: boolean | null };
  signalling: number;
  available: number;
  label: string;
  text: string;
  rule: string;
}

export interface CusumRecalculation {
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  state_changes: string[];
  message: string;
}

const BASE_PATH = '/api/statistics/cusum';
const COMPARISON_PATH = '/api/statistics/comparison';

const invalid = (what: string): never => {
  throw new ApiError('invalid-response', `Unexpected response from ${what}.`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPoint = (value: unknown): value is CusumPoint =>
  isObject(value) &&
  value.method === 'CUSUM' &&
  (value.metric === 'volume' || value.metric === 'positivity') &&
  typeof value.signal_date === 'string' &&
  (value.cusum_value === null || typeof value.cusum_value === 'number');

export const createCusumClient = (baseUrl: string, fetchImpl?: FetchLike) => {
  const client = createApiClient(baseUrl, fetchImpl);

  const orNull = async <T,>(read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  };

  return {
    async summary(signal?: AbortSignal): Promise<CusumSummary> {
      const value = await client.getJson(BASE_PATH, undefined, signal);
      if (!isObject(value) || value.method !== 'CUSUM' || typeof value.result_count !== 'number') return invalid(BASE_PATH);
      return value as unknown as CusumSummary;
    },

    async history(signal?: AbortSignal): Promise<CusumPoint[]> {
      const value = await client.getJson(`${BASE_PATH}/history`, undefined, signal);
      if (!Array.isArray(value) || !value.every(isPoint)) return invalid(`${BASE_PATH}/history`);
      return value;
    },

    async day(date: string, signal?: AbortSignal): Promise<CusumDay | null> {
      return orNull(async () => {
        const value = await client.getJson(`${BASE_PATH}/current`, { date }, signal);
        if (!isObject(value)) return invalid(`${BASE_PATH}/current`);
        for (const metric of ['volume', 'positivity'] as const) {
          if (value[metric] !== null && !isPoint(value[metric])) return invalid(`${BASE_PATH}/current`);
        }
        return value as unknown as CusumDay;
      });
    },

    async comparison(date: string, signal?: AbortSignal): Promise<MethodComparison | null> {
      return orNull(async () => {
        const value = await client.getJson(COMPARISON_PATH, { date }, signal);
        if (!isObject(value) || typeof value.label !== 'string' || !isObject(value.methods)) return invalid(COMPARISON_PATH);
        return value as unknown as MethodComparison;
      });
    },

    /** DEVELOPMENT ONLY. 'unavailable' when the backend is not in development (404). */
    async recalculate(signal?: AbortSignal): Promise<CusumRecalculation | 'unavailable'> {
      const reply = await client.postText(`${BASE_PATH}/recalculate`, '{}', 'application/json', signal);
      if (reply.status === 404) return 'unavailable';
      const body = reply.body;
      if (reply.status !== 200 || !isObject(body) || typeof body.message !== 'string') {
        throw new ApiError('http', `CUSUM recalculation was not accepted (HTTP ${reply.status}).`, reply.status);
      }
      return body as unknown as CusumRecalculation;
    },
  };
};

export type CusumClient = ReturnType<typeof createCusumClient>;
