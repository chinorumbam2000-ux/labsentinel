/**
 * Presentation of DYNAMIC surveillance signals (API capstone mode).
 *
 * Pure functions: a dynamic signal from the API in, text out. Every number
 * shown comes from the backend's calculation; nothing is recalculated here.
 */
import type {
  CalculationStatus,
  DynamicComponent,
  DynamicFacility,
  DynamicSignal,
  FacilityStatus,
} from '../data-access/dynamicSurveillance';
import type { PrivacyResult } from '../types';
import { SUPPRESSED_VALUE, applyGeographicPrivacy } from './geographicPrivacy';

export const DYNAMIC_LABEL = 'Dynamic calculation from persisted laboratory observations.';
export const DYNAMIC_DISCLAIMER =
  'The Dynamic Surveillance Engine is a capstone prototype model and is not epidemiologically validated for production public-health decision-making.';
export const INSUFFICIENT_BASELINE_TEXT =
  'Insufficient historical data to calculate a dynamic surveillance baseline.';
export const NO_DATA_TEXT =
  'No eligible laboratory observations were received for this date. Absence of data is not evidence of normal activity.';
export const MODE_SEPARATION_TEXT =
  'Separate from Classroom Demo Mode: the Dashboard, Outbreak Map, Signals and Simulation pages, and the simulation day and score in the header, continue to show the frozen five-day classroom simulation.';

export const STATUS_LABEL: Record<CalculationStatus, string> = {
  CALCULATED: 'Calculated',
  INSUFFICIENT_BASELINE: 'Insufficient baseline',
  NO_DATA: 'No data',
};

export const FACILITY_STATUS_LABEL: Record<FacilityStatus, string> = {
  ABNORMAL: 'Abnormal',
  NORMAL: 'Normal',
  BELOW_MINIMUM: 'Too few tests to assess',
  INSUFFICIENT_BASELINE: 'No baseline yet',
  NOT_REPORTING: 'Not reporting',
};

export const signed = (value: number, digits = 1, suffix = ''): string =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}${suffix}`;

export const percent = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined ? '—' : `${value.toFixed(digits)}%`;

/** "Tue, Jan 20, 2026" for an ISO date, without shifting it through a time zone. */
export const formatSurveillanceDate = (iso: string): string => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const statusMessage = (signal: DynamicSignal): string | null => {
  if (signal.calculation_status === 'INSUFFICIENT_BASELINE') return INSUFFICIENT_BASELINE_TEXT;
  if (signal.calculation_status === 'NO_DATA') return NO_DATA_TEXT;
  return null;
};

const component = (signal: DynamicSignal, key: DynamicComponent['key']): DynamicComponent | undefined =>
  signal.calculation.components?.find((item) => item.key === key);

const num = (value: number | null | undefined): number => value ?? 0;

/** The evidence line for one component, e.g. "54 tests · baseline 48.0 a day · +12.5%". */
export const componentEvidence = (item: DynamicComponent): string => {
  const raw = item.raw;
  switch (item.key) {
    case 'volume':
      return `${num(raw.current_tests)} tests · baseline ${num(raw.baseline_mean_tests).toFixed(1)} a day · ${signed(num(raw.change_percent), 1, '%')}`;
    case 'positivity':
      return `${percent(raw.current_rate)} · baseline ${percent(raw.baseline_rate)} · ${signed(num(raw.change_points))} points`;
    case 'facilities':
      return `${num(raw.affected)} of ${num(raw.participating)} participating facilities abnormal`;
    case 'geography':
      return `${num(raw.affected)} of ${num(raw.participating)} surveillance areas affected`;
    case 'persistence':
      return `${num(raw.days)} consecutive abnormal ${num(raw.days) === 1 ? 'day' : 'days'} (full score at ${num(raw.max_days)})`;
    default:
      return '';
  }
};

export interface ExplanationSection {
  key: 'what' | 'where' | 'facilities' | 'persistence' | 'why';
  heading: string;
  body: string;
}

/** What changed, where, which facilities, how long, why — for a CALCULATED signal. */
export const explainDynamicSignal = (signal: DynamicSignal): ExplanationSection[] => {
  const calc = signal.calculation;
  const volume = component(signal, 'volume');
  const positivity = component(signal, 'positivity');
  const affected = calc.facilities.filter((f) => f.status === 'ABNORMAL');
  const areas = calc.geography.affected;
  const largest = [...(calc.components ?? [])].sort((a, b) => b.weighted - a.weighted)[0];
  const days = signal.persistence_days;

  return [
    {
      key: 'what',
      heading: 'What changed?',
      body:
        volume && positivity
          ? `Testing moved from a baseline of ${num(volume.raw.baseline_mean_tests).toFixed(1)} tests a day to ${
              signal.test_volume
            } (${signed(num(volume.raw.change_percent), 1, '%')}), and positivity from ${percent(
              positivity.raw.baseline_rate,
            )} to ${percent(positivity.raw.current_rate)} (${signed(num(positivity.raw.change_points))} percentage points): ${
              signal.positive_count
            } positive results from ${signal.test_volume} tests.`
          : 'No calculation is available.',
    },
    {
      key: 'where',
      heading: 'Where is it happening?',
      body:
        areas.length === 0
          ? `No surveillance area is abnormal (${calc.geography.participating.length} participating).`
          : `${areas.length} of ${calc.geography.participating.length} surveillance areas: ${areas
              .map((area) => (area.subregion ? `${area.code} (${area.subregion})` : area.code))
              .join(', ')}.`,
    },
    {
      key: 'facilities',
      heading: 'Which facilities contributed?',
      body:
        affected.length === 0
          ? `No participating facility met the abnormal-activity rule (${calc.facilities.length} participating).`
          : `${affected.length} of ${calc.facilities.length} participating facilities: ${affected
              .map((f) => `${f.name} — ${f.reasons.join('; ')}`)
              .join('. ')}.`,
    },
    {
      key: 'persistence',
      heading: 'How long has it persisted?',
      body:
        days === 0
          ? 'No abnormal facility today, so persistence is 0.'
          : `${days} consecutive ${days === 1 ? 'day' : 'days'} with at least one abnormal facility, from the persisted dynamic signal history.`,
    },
    {
      key: 'why',
      heading: 'Why did the score reach this severity?',
      body:
        signal.composite_score === null || !calc.composite
          ? 'No score was produced.'
          : `The five weighted components sum to ${calc.composite.unrounded.toFixed(1)}, rounded to ${
              signal.composite_score
            } of 100: the ${signal.severity} band.${
              largest && largest.weighted > 0 ? ` ${largest.label} is the largest single contributor.` : ''
            }`,
    },
  ];
};

/**
 * The existing adaptive privacy rule applied to a facility's positive count:
 * under 5 is suppressed and reported at the region (subregion) instead.
 * Test totals are not sensitive and are shown as they are.
 */
export const facilityPositivePrivacy = (
  facility: DynamicFacility,
  regionalPositives: number,
): PrivacyResult =>
  applyGeographicPrivacy({
    count: facility.positive,
    level: 'Facility',
    measure: 'positive results',
    areaLabel: facility.name,
    rollup: { level: 'County', count: regionalPositives, label: facility.subregion ?? 'the region' },
  });

/** A facility's positivity follows its positive count's privacy decision. */
export const facilityPositivityDisplay = (facility: DynamicFacility, regionalPositives: number): string =>
  facilityPositivePrivacy(facility, regionalPositives).suppressed
    ? SUPPRESSED_VALUE
    : percent(facility.positivity_rate);
