/**
 * Presentation of the EXPERIMENTAL CUSUM detector and the three-method
 * comparison. Pure functions; every number comes from the backend.
 */
import type { CusumPoint, CusumState, MethodComparison } from '../data-access/cusum';
import type { EwmaMetric, EwmaStatus } from '../data-access/ewma';
import { STATE_LABEL as EWMA_STATE_LABEL, metricValue } from './ewma';

export const CUSUM_DISCLAIMER =
  'CUSUM is an experimental statistical surveillance method in this capstone and has not been epidemiologically validated for production decision-making.';
export const APPROACHING_NOTE =
  '"Approaching the limit" is an informational display note (the sum is at least 75% of h). It is not a statistical alarm: the formal state stays Normal until the sum reaches h.';

export const CUSUM_STATE_LABEL: Record<CusumState, string> = {
  NORMAL: 'Normal',
  STATISTICAL_ALERT: 'Statistical Alert',
};

export const CUSUM_TITLE: Record<EwmaMetric, string> = {
  volume: 'Test Volume CUSUM',
  positivity: 'Positivity CUSUM',
};

const STATUS_TEXT: Record<Exclude<EwmaStatus, 'CALCULATED'>, string> = {
  REFERENCE_PERIOD: 'Reference period',
  INSUFFICIENT_BASELINE: 'Insufficient baseline',
  INSUFFICIENT_VARIANCE: 'Insufficient variance',
  NO_DATA: 'No data',
};

export const cusumState = (point: CusumPoint | null): string => {
  if (!point) return 'Not calculated';
  if (point.alert_state) return CUSUM_STATE_LABEL[point.alert_state];
  return STATUS_TEXT[point.calculation_status as Exclude<EwmaStatus, 'CALCULATED'>] ?? point.calculation_status;
};

/** "3.46" for sums and z-scores. */
export const sum = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined ? '—' : value.toFixed(digits);

export const signedSum = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;

export const crossedLimit = (point: CusumPoint): string => {
  if (point.distance_to_limit === null) return '—';
  return point.distance_to_limit <= 0
    ? `Yes — ${Math.abs(point.distance_to_limit).toFixed(2)} past h`
    : `No — ${point.distance_to_limit.toFixed(2)} below h`;
};

export const deviationText = (point: CusumPoint): string =>
  point.z_score === null
    ? '—'
    : `${Math.abs(point.z_score).toFixed(2)} SD ${point.z_score >= 0 ? 'above' : 'below'} the mean`;

/** State names for any method, for the comparison table. */
export const anyState = (state: string | null | undefined): string => {
  if (!state) return 'Not calculated';
  return (EWMA_STATE_LABEL as Record<string, string>)[state] ?? state;
};

export const METHOD_ROWS = [
  {
    key: 'composite',
    name: 'Composite Outbreak Signal',
    measures: 'A multi-factor, rule-based score: test volume, positivity, affected facilities, geographic spread and persistence against a 7-day baseline.',
    interpretation: 'Broad and explainable: several kinds of evidence at once. Rule thresholds can react to small-count noise.',
  },
  {
    key: 'ewma',
    name: 'EWMA',
    measures: 'A smoothed statistical shift: an exponentially weighted average of daily volume and positivity against historical control limits.',
    interpretation: 'Sensitive to a sustained shift; the smoothing damps single-day noise.',
  },
  {
    key: 'cusum',
    name: 'CUSUM',
    measures: 'Cumulative sustained deviation: daily standardized excesses above the historical mean, added up until they reach a decision limit.',
    interpretation: 'Accumulates small, persistent increases; falls back to zero when days return to normal.',
  },
] as const;

export const signalMark = (value: boolean | null): string => (value === null ? '—' : value ? '✓' : '✗');

export const methodNames = (comparison: MethodComparison): string[] =>
  (['composite', 'ewma', 'cusum'] as const)
    .filter((key) => comparison.methods[key])
    .map((key) => ({ composite: 'Composite', ewma: 'EWMA', cusum: 'CUSUM' })[key]);

export { metricValue };
