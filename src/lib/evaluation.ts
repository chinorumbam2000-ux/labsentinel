/**
 * Presentation of the capstone evaluation results. Pure formatting: every
 * number comes from the backend's evaluation artifacts.
 */
import type { Detector, Distribution, Proportion, ScenarioSummary, TimelineDay } from '../data-access/evaluation';

export const EVALUATION_DISCLAIMER =
  'These evaluations use synthetic scenarios and demonstrate technical behavior only. They do not establish clinical or epidemiological validation.';
export const EVALUATION_LABEL = 'Experimental capstone evaluation using synthetic scenarios.';
export const NO_WINNER =
  'No method is declared best. Earlier detection that comes with more false alerts is a tradeoff, not a win.';

export const DETECTORS: Detector[] = ['composite', 'ewma', 'cusum'];
export const DETECTOR_NAME: Record<Detector, string> = { composite: 'Composite', ewma: 'EWMA', cusum: 'CUSUM' };

/** "710/900 = 78.9% (95% CI 76.1–81.4)". */
export const proportionText = (p: Proportion | null | undefined): string => {
  if (!p || p.value === null) return '—';
  const base = `${p.numerator}/${p.denominator} = ${(100 * p.value).toFixed(1)}%`;
  return p.ci95 ? `${base} (95% CI ${(100 * p.ci95[0]).toFixed(1)}–${(100 * p.ci95[1]).toFixed(1)})` : base;
};

export const countText = (p: Proportion | null | undefined): string =>
  !p || p.value === null ? '—' : `${p.numerator}/${p.denominator}`;

export const delayText = (d: Distribution | null | undefined): string => {
  if (!d || d.n === 0) return '—';
  return `median ${d.median} d (IQR ${d.p25}–${d.p75}, range ${d.min}–${d.max}, n=${d.n})`;
};

export const value = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(digits);

/** Whether a detector is in alert on a timeline day (the fixed detection definitions). */
export const alertOn = (day: TimelineDay, detector: Detector): boolean =>
  detector === 'composite'
    ? day.composite_severity === 'High' || day.composite_severity === 'Critical'
    : detector === 'ewma'
      ? day.ewma_overall === 'STATISTICAL_ALERT'
      : day.cusum_overall === 'STATISTICAL_ALERT';

/** A short state label for a timeline cell. */
export const cellState = (day: TimelineDay, detector: Detector): string => {
  if (detector === 'composite') return day.composite_severity ?? 'Not scored';
  const state = detector === 'ewma' ? day.ewma_overall : day.cusum_overall;
  return state === 'STATISTICAL_ALERT' ? 'Alert' : state === 'WATCH' ? 'Watch' : state === 'NORMAL' ? 'Normal' : 'No result';
};

export const shortDate = (iso: string): string => {
  const [, month, day] = iso.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${day}`;
};

/** One-line result of a detector on a scenario. */
export const scenarioResult = (scenario: ScenarioSummary, detector: Detector): string => {
  const m = scenario.detectors[detector];
  if (scenario.ground_truth.outbreak_present) {
    const s = m.realization_level.sensitivity;
    return `${countText(s)} detected · median delay ${value(m.detection_delay_days.median, 1)} d`;
  }
  const f = m.realization_level.false_positive_rate;
  return `${countText(f)} runs with a false alert`;
};
