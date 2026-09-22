/**
 * Adaptive geographic privacy.
 *
 * Small counts tied to a small area are the classic re-identification risk in
 * public-health surveillance: "2 positives in one ZIP code" can point at a
 * person in a way "34 positives across a county" cannot. So below a threshold
 * the exact number is withheld and the signal is reported at a broader level
 * instead.
 *
 * THIS IS AN ILLUSTRATIVE PROTOTYPE PRIVACY RULE. It is a teaching device, not
 * an official HIPAA threshold, not a de-identification determination, and not
 * a substitute for a disclosure-review process. A real deployment would need a
 * documented statistical or expert-determination method.
 *
 * DEMO ENVIRONMENT — Synthetic data only. Even the suppressed values here
 * describe fabricated records, and no patient location of any kind exists in
 * this prototype — the finest geography is a synthetic surveillance area.
 */
import type { GeographicLevel, HospitalId, PrivacyResult } from '../types';
import { HOSPITAL_BY_ID } from '../data/hospitals';
import { getRegionalCounts, getSiteCounts } from '../data/dataset';
import { ZIP_AREA_BY_CODE } from '../data/zipAreas';
import {
  ACTIVE_HIERARCHY,
  getAncestorAtLevel,
  getBroaderLevel,
  getLevelLabels,
} from '../data/geography';

/** Configurable prototype threshold. Counts below this are not shown. */
export const MINIMUM_DISPLAY_COUNT = 5;

/** The value shown in place of a suppressed count. */
export const SUPPRESSED_VALUE = `<${MINIMUM_DISPLAY_COUNT}`;

export const PRIVACY_TOOLTIP =
  'Small counts are suppressed or geographically aggregated to reduce re-identification risk.';

export const PRIVACY_DISCLAIMER =
  'Illustrative prototype privacy rule — not an official HIPAA legal threshold or a de-identification determination.';

/**
 * The roll-up chain, derived from the active geographic configuration rather
 * than hard-coded. Under the U.S. prototype this resolves to
 * Facility → ZIP → County → State → Country; a district/province deployment
 * would produce its own chain from the same code.
 */
export const GEOGRAPHIC_HIERARCHY: GeographicLevel[] = getLevelLabels();

/** The next broader level by display label, or null at the top. */
export const broaderLevel = (level: GeographicLevel): GeographicLevel | null => {
  const definition = ACTIVE_HIERARCHY.levels.find((item) => item.label === level);
  if (!definition) return null;
  const broader = getBroaderLevel(definition.id);
  return broader ? broader.label : null;
};

export interface PrivacyInput {
  count: number;
  level: GeographicLevel;
  /** What is being counted, e.g. "positive results". Used in explanations. */
  measure?: string;
  /** Label for the area itself, e.g. "01545". */
  areaLabel?: string;
  /**
   * The broader area to report at when the count is too small. Supplying this
   * is what turns suppression into a useful roll-up rather than a dead end.
   */
  rollup?: {
    level: GeographicLevel;
    count: number;
    label: string;
  };
  /** Set false for values that are never sensitive (e.g. total tests run). */
  sensitive?: boolean;
}

/**
 * Decides whether a geographic count may be displayed, and what to show
 * instead when it may not.
 */
export const applyGeographicPrivacy = (input: PrivacyInput): PrivacyResult => {
  const measure = input.measure ?? 'results';
  const area = input.areaLabel ? ` in ${input.areaLabel}` : '';
  const sensitive = input.sensitive ?? true;

  if (!sensitive || input.count >= MINIMUM_DISPLAY_COUNT) {
    return {
      displayAllowed: true,
      displayValue: input.count.toLocaleString('en-US'),
      suppressed: false,
      rollupLevel: input.level,
      explanation: `Count meets the prototype display threshold of ${MINIMUM_DISPLAY_COUNT}, so the exact ${measure} figure is shown at ${input.level} level.`,
      rawCount: input.count,
      rollupValue: null,
      rollupLabel: null,
    };
  }

  // Below the threshold: withhold the exact number.
  const rollup = input.rollup;
  const canRollUp = Boolean(rollup) && rollup!.count >= MINIMUM_DISPLAY_COUNT;

  const explanation = canRollUp
    ? `Fewer than ${MINIMUM_DISPLAY_COUNT} ${measure}${area}. The exact count is suppressed to reduce re-identification risk and the signal is reported at ${rollup!.level} level instead (${rollup!.label}: ${rollup!.count.toLocaleString(
        'en-US',
      )}).`
    : `Fewer than ${MINIMUM_DISPLAY_COUNT} ${measure}${area}. The exact count is suppressed to reduce re-identification risk, and no broader level currently has enough ${measure} to report either.`;

  return {
    displayAllowed: false,
    displayValue: SUPPRESSED_VALUE,
    suppressed: true,
    rollupLevel: canRollUp ? rollup!.level : input.level,
    explanation,
    rawCount: null,
    rollupValue: canRollUp ? rollup!.count.toLocaleString('en-US') : null,
    rollupLabel: canRollUp ? rollup!.label : null,
  };
};

/**
 * Privacy decision for one surveillance area's positive count on a given day,
 * with the county total as the roll-up target.
 */
export const getAreaPositivePrivacy = (
  day: number,
  hospitalId: HospitalId,
): PrivacyResult => {
  const hospital = HOSPITAL_BY_ID[hospitalId];
  const area = ZIP_AREA_BY_CODE[hospital.zipCode];
  const counts = getSiteCounts(day, hospitalId);
  const regional = getRegionalCounts(day);

  // The area level and its roll-up target both come from the configuration,
  // so a deployment using districts and provinces needs no code change here.
  const areaLevel = ACTIVE_HIERARCHY.levels.find((level) => level.rank === 1);
  const broader = areaLevel ? getBroaderLevel(areaLevel.id) : null;
  const parentUnit = broader
    ? getAncestorAtLevel(hospital.zipCode, broader.id)
    : undefined;

  return applyGeographicPrivacy({
    count: counts.positives,
    level: areaLevel?.label ?? 'ZIP',
    measure: 'positive results',
    areaLabel: hospital.zipCode,
    rollup: broader
      ? {
          level: broader.label,
          count: regional.positives,
          label: parentUnit?.name ?? area?.county ?? 'Worcester County',
        }
      : undefined,
  });
};

/** Privacy decision for an area's positivity rate, which follows its count. */
export const getAreaPositivityDisplay = (
  day: number,
  hospitalId: HospitalId,
): { value: string; suppressed: boolean } => {
  const privacy = getAreaPositivePrivacy(day, hospitalId);
  if (privacy.suppressed) {
    return { value: SUPPRESSED_VALUE, suppressed: true };
  }
  const counts = getSiteCounts(day, hospitalId);
  const rate = counts.tests === 0 ? 0 : (counts.positives / counts.tests) * 100;
  return { value: `${rate.toFixed(1)}%`, suppressed: false };
};

/** How many surveillance areas are currently suppressed on a given day. */
export const getSuppressedAreaCount = (day: number): number =>
  (['HOSP-A', 'HOSP-B', 'HOSP-C'] as HospitalId[]).filter(
    (id) => getAreaPositivePrivacy(day, id).suppressed,
  ).length;

/**
 * A single sentence describing the day's disclosure posture, suitable for a
 * dashboard note or a report.
 */
export const getDisclosureSummary = (day: number): string => {
  const suppressed = getSuppressedAreaCount(day);
  const regional = getRegionalCounts(day);

  if (suppressed === 0) {
    return `All 3 surveillance areas meet the prototype display threshold of ${MINIMUM_DISPLAY_COUNT}, so area-level counts are shown.`;
  }
  if (suppressed === 3) {
    return `All 3 surveillance areas report fewer than ${MINIMUM_DISPLAY_COUNT} positive results. Area-level counts are suppressed and the signal is reported at county level (Worcester County: ${regional.positives}).`;
  }
  return `${suppressed} of 3 surveillance areas report fewer than ${MINIMUM_DISPLAY_COUNT} positive results. Those counts are suppressed and rolled up to county level (Worcester County: ${regional.positives}).`;
};
