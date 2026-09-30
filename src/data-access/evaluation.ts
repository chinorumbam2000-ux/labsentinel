/**
 * API CAPSTONE MODE ONLY: client for the development-only, read-only capstone
 * evaluation results (/api/evaluation), produced by
 * `python -m app.evaluation.run`. Local mode never constructs this client.
 */
import { ApiError, createApiClient, type FetchLike } from './apiClient';

export type Detector = 'composite' | 'ewma' | 'cusum';

export interface Proportion {
  numerator: number;
  denominator: number;
  value: number | null;
  ci95: [number, number] | null;
}

export interface Distribution {
  n: number;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  counts: Record<string, number>;
}

export interface Confusion {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  sensitivity: Proportion;
  specificity: Proportion;
  precision: Proportion;
  npv: Proportion;
  false_positive_rate: Proportion;
  false_negative_rate: Proportion;
}

export interface DetectorMetrics {
  realizations: number;
  realization_level: Confusion;
  day_level: Confusion;
  detection_delay_days: Distribution;
  retrospective_delay_days: Distribution;
  burden: {
    alert_days: number;
    alert_episodes: number;
    monitored_days: number;
    normal_days: number;
    false_alert_days: number;
    false_alert_episodes: number;
    false_alert_days_per_100_normal_days: number | null;
    realizations_with_false_alert: number;
  };
  stability: {
    normal_day_transitions: number;
    transitions_per_100_normal_days: number | null;
    false_episode_length: Distribution;
    percent_normal_days_in_alert: number | null;
  };
}

export interface GroundTruth {
  scenario_id: string;
  outbreak_present: boolean;
  true_outbreak_start: string | null;
  true_outbreak_end: string | null;
  true_affected_facilities: string[];
  true_affected_geographies: string[];
  description: string;
}

export interface TimelineDay {
  date: string;
  truth: 'normal' | 'outbreak';
  volume: number;
  positivity: number | null;
  composite_score: number | null;
  composite_severity: 'Low' | 'Watch' | 'Moderate' | 'High' | 'Critical' | null;
  data_confidence: number | null;
  affected_facilities: number;
  ewma_overall: string | null;
  ewma_volume: string | null;
  ewma_positivity: string | null;
  cusum_overall: string | null;
  cusum_volume: string | null;
  cusum_positivity: string | null;
  cusum_volume_value: number | null;
  cusum_positivity_value: number | null;
}

export interface LeadLag {
  both_detected: number;
  same_day: number;
  days_b_minus_a: Distribution;
  note: string;
  [key: string]: number | Distribution | string;
}

export interface ScenarioSummary {
  id: string;
  number: number;
  name: string;
  purpose: string;
  description: string;
  group: 'primary' | 'coverage';
  conditions: string[];
  as_of: boolean;
  compare_with: string | null;
  ground_truth: GroundTruth;
  realizations: number;
  mean_observations: number;
  detectors: Record<Detector, DetectorMetrics>;
  lead_lag: Record<string, LeadLag> | null;
  secondary: Record<string, { detected: Proportion; delay_days: Distribution }>;
  data_confidence: {
    normal_days: { n: number; mean: number | null; min: number | null };
    outbreak_days: { n: number; mean: number | null; min: number | null };
    outbreak_composite_score_mean: number | null;
    outbreak_composite_score_max: number | null;
  };
  representative?: {
    repetition: number;
    as_of_detection: Record<string, string | null>;
    detections: Record<Detector, string | null>;
    timeline: TimelineDay[];
  };
}

export interface ConditionRow {
  scenario: string;
  conditions: string[];
  composite: { detected: Proportion; median_delay: number | null; false_alert_days_per_100_normal_days: number | null };
  ewma: { detected: Proportion; median_delay: number | null; false_alert_days_per_100_normal_days: number | null };
  cusum: { detected: Proportion; median_delay: number | null; false_alert_days_per_100_normal_days: number | null };
  data_confidence_normal_mean: number | null;
  data_confidence_outbreak_mean: number | null;
  data_confidence_outbreak_min: number | null;
  outbreak_composite_score_mean: number | null;
}

export interface SensitivityRow {
  detected: Proportion;
  delay_days: Distribution;
  false_alert_realizations: Proportion;
  false_alert_days_per_100_normal_days: number | null;
  default: boolean;
  lambda?: number;
  k?: number;
  h?: number;
  cutoff?: string;
}

export interface EvaluationSummary {
  label: string;
  disclaimer: string;
  reproduce: string;
  seed: number;
  repetitions: number;
  calendar: { start: string; reference_days: number; monitoring_start: string; monitoring_days: number; onset: string; end: string };
  definitions: {
    detection: Record<Detector, string>;
    secondary_events: Record<string, string>;
    units: { realization_level: string; day_level: string };
    confidence_interval: string;
    parameters: string;
    roc_auc: string;
  };
  scenarios: ScenarioSummary[];
  overall: { scope: string; detectors: Record<Detector, DetectorMetrics> | null };
  robustness: ConditionRow[];
  coverage: ConditionRow[];
  sensitivity: {
    note: string;
    ewma_lambda: { pooled: SensitivityRow[] };
    cusum_k_h: { pooled: SensitivityRow[] };
    composite_cutoffs: { pooled: SensitivityRow[]; note: string };
  };
  cdc_who_attributes: { attribute: string; status: string; how: string }[];
  threats_to_validity: string[];
}

const invalid = (what: string): never => {
  throw new ApiError('invalid-response', `Unexpected response from ${what}.`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type EvaluationAvailability = { status: 'ready'; summary: EvaluationSummary } | { status: 'not-run' | 'disabled'; message: string };

export const createEvaluationClient = (baseUrl: string, fetchImpl?: FetchLike) => {
  const client = createApiClient(baseUrl, fetchImpl);

  return {
    /** 'not-run' / 'disabled' when the API answers 404 (no results yet, or not in development). */
    async summary(signal?: AbortSignal): Promise<EvaluationAvailability> {
      try {
        const value = await client.getJson('/api/evaluation/summary', undefined, signal);
        if (!isObject(value) || typeof value.disclaimer !== 'string' || !Array.isArray(value.scenarios)) {
          return invalid('/api/evaluation/summary');
        }
        return { status: 'ready', summary: value as unknown as EvaluationSummary };
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return {
            status: 'not-run',
            message:
              'No evaluation results are available. Run python -m app.evaluation.run --all --repetitions 100 in backend/ (development only).',
          };
        }
        throw error;
      }
    },

    async scenario(id: string, signal?: AbortSignal): Promise<ScenarioSummary> {
      const value = await client.getJson(`/api/evaluation/scenarios/${encodeURIComponent(id)}`, undefined, signal);
      if (!isObject(value) || value.id !== id || !isObject(value.representative)) return invalid('/api/evaluation/scenarios/{id}');
      return value as unknown as ScenarioSummary;
    },
  };
};

export type EvaluationClient = ReturnType<typeof createEvaluationClient>;
