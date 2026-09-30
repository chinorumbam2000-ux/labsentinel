/**
 * Presentation of the EXPERIMENTAL EWMA statistical detector. Pure functions:
 * every number shown comes from the backend; nothing is recalculated here.
 */
import type { Agreement, CompositeBand, EwmaMetric, EwmaPoint, EwmaState, EwmaStatus } from '../data-access/ewma';

export const EWMA_LABEL = 'Experimental Statistical Surveillance';
export const EWMA_NOTE = 'Prototype statistical detector — not clinically or epidemiologically validated.';
export const EWMA_DISCLAIMER =
  'EWMA is an experimental statistical surveillance method in this capstone and has not been validated for production epidemiological decision-making.';
export const NOT_AN_OUTBREAK = 'A statistical alert is not a confirmed outbreak.';

export const STATE_LABEL: Record<EwmaState, string> = {
  NORMAL: 'Normal',
  WATCH: 'Watch',
  STATISTICAL_ALERT: 'Statistical Alert',
};

/** The overall state reads "No statistical alert" rather than "Normal". */
export const OVERALL_LABEL: Record<EwmaState, string> = {
  NORMAL: 'No statistical alert',
  WATCH: 'Watch',
  STATISTICAL_ALERT: 'Statistical Alert',
};

export const STATUS_TEXT: Record<Exclude<EwmaStatus, 'CALCULATED'>, string> = {
  REFERENCE_PERIOD: 'Reference period',
  INSUFFICIENT_BASELINE: 'Insufficient baseline',
  INSUFFICIENT_VARIANCE: 'Insufficient variance',
  NO_DATA: 'No data',
};

export const AGREEMENT_LABEL: Record<Agreement, string> = {
  BOTH_METHODS_SIGNAL: 'Both methods signal',
  COMPOSITE_ONLY: 'Composite only',
  EWMA_ONLY: 'EWMA only',
  NEITHER: 'Neither',
  NOT_AVAILABLE: 'Not available',
};

export const METRIC_TITLE: Record<EwmaMetric, string> = {
  volume: 'Test Volume EWMA',
  positivity: 'Positivity EWMA',
};

export const STATE_STYLE: Record<EwmaState, string> = {
  NORMAL: 'bg-canvas text-ink ring-hairline',
  WATCH: 'bg-severity-watch/15 text-[#854D0E] ring-severity-watch/50',
  STATISTICAL_ALERT: 'bg-severity-critical/10 text-[#991B1B] ring-severity-critical/40',
};

export const STATE_ICON: Record<EwmaState, string> = {
  NORMAL: '●',
  WATCH: '◆',
  STATISTICAL_ALERT: '▲',
};

/** "54.0 tests" or "11.1%". */
export const metricValue = (metric: EwmaMetric, value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined) return '—';
  return metric === 'positivity' ? `${value.toFixed(digits)}%` : `${value.toFixed(digits)} tests`;
};

export const pointState = (point: EwmaPoint | null): string => {
  if (!point) return 'Not calculated';
  if (point.alert_state) return STATE_LABEL[point.alert_state];
  return STATUS_TEXT[point.calculation_status as Exclude<EwmaStatus, 'CALCULATED'>] ?? point.calculation_status;
};

/** Whether the EWMA crossed its upper control limit, in words. */
export const crossedText = (point: EwmaPoint): string => {
  if (point.distance_to_ucl === null || point.ewma_value === null) return '—';
  const gap = metricValue(point.metric, Math.abs(point.distance_to_ucl), 2);
  return point.distance_to_ucl < 0 ? `Yes — ${gap} above the limit` : `No — ${gap} below the limit`;
};

export const formatLead = (days: number | null): string => {
  if (days === null) return '—';
  if (days === 0) return 'same day';
  return days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} earlier` : `${-days} ${days === -1 ? 'day' : 'days'} later`;
};

export const COMPOSITE_BANDS: CompositeBand[] = ['Watch', 'Moderate', 'High', 'Critical'];
