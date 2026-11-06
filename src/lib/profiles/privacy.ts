/**
 * Small-count suppression for every surveillance profile.
 *
 * The rule itself is unchanged and lives in geographicPrivacy.ts
 * (applyGeographicPrivacy: an area count below the display threshold is
 * withheld and rolled up to the broader level). That module's day-based
 * helpers read the narrated scenario's counts; these apply the SAME rule to
 * a profile's own counts, so a pathogen with three positives in one area is
 * suppressed exactly as the syndrome would be. For the narrated profile the
 * original helpers are used as they are.
 */
import type { HospitalId, PrivacyResult, SimulationDay } from '../../types';
import { HOSPITAL_BY_ID } from '../../data/hospitals';
import { HOSPITAL_IDS } from '../../data/dataset';
import { ZIP_AREA_BY_CODE } from '../../data/zipAreas';
import { ACTIVE_HIERARCHY, getAncestorAtLevel, getBroaderLevel } from '../../data/geography';
import {
  MINIMUM_DISPLAY_COUNT,
  SUPPRESSED_VALUE,
  applyGeographicPrivacy,
  getAreaPositivePrivacy,
  getAreaPositivityDisplay,
  getDisclosureSummary,
  getSuppressedAreaCount,
} from '../geographicPrivacy';
import { PROFILE_BY_ID, RVS_PROFILE_ID, type ProfileId } from './registry';
import { PROFILE_SITE_DAY_COUNTS } from './derive';

/** Everything a view needs to show area counts safely for one profile and day. */
export interface AreaPrivacy {
  positive: (hospitalId: HospitalId) => PrivacyResult;
  positivity: (hospitalId: HospitalId) => { value: string; suppressed: boolean };
  suppressedCount: number;
  summary: string;
}

/**
 * Per-day, per-facility counts for one profile. Every function below reads
 * the replay's counts unless it is given another table (Live Surveillance
 * passes its own): the rule is the same whatever the counts come from.
 */
export type CountTable = Record<number, Record<HospitalId, { tests: number; positives: number }>>;

const NONE = { tests: 0, positives: 0 };

const site = (id: ProfileId, day: number, h: HospitalId, table?: CountTable) =>
  table ? (table[day]?.[h] ?? NONE) : PROFILE_SITE_DAY_COUNTS[id][day as SimulationDay][h];

const regionalPositives = (id: ProfileId, day: number, table?: CountTable) =>
  HOSPITAL_IDS.reduce((sum, h) => sum + site(id, day, h, table).positives, 0);

export const profileAreaPositivePrivacy = (id: ProfileId, day: number, hospitalId: HospitalId, table?: CountTable): PrivacyResult => {
  const hospital = HOSPITAL_BY_ID[hospitalId];
  const area = ZIP_AREA_BY_CODE[hospital.zipCode];
  const areaLevel = ACTIVE_HIERARCHY.levels.find((level) => level.rank === 1);
  const broader = areaLevel ? getBroaderLevel(areaLevel.id) : null;
  const parentUnit = broader ? getAncestorAtLevel(hospital.zipCode, broader.id) : undefined;
  return applyGeographicPrivacy({
    count: site(id, day, hospitalId, table).positives,
    level: areaLevel?.label ?? 'ZIP',
    measure: 'positive results',
    areaLabel: hospital.zipCode,
    rollup: broader
      ? {
          level: broader.label,
          count: regionalPositives(id, day, table),
          label: parentUnit?.name ?? area?.county ?? 'Worcester County',
        }
      : undefined,
  });
};

export const profileAreaPositivityDisplay = (
  id: ProfileId,
  day: number,
  hospitalId: HospitalId,
  table?: CountTable,
): { value: string; suppressed: boolean } => {
  if (profileAreaPositivePrivacy(id, day, hospitalId, table).suppressed) return { value: SUPPRESSED_VALUE, suppressed: true };
  const counts = site(id, day, hospitalId, table);
  const rate = counts.tests === 0 ? 0 : (counts.positives / counts.tests) * 100;
  return { value: `${rate.toFixed(1)}%`, suppressed: false };
};

export const profileSuppressedAreaCount = (id: ProfileId, day: number, table?: CountTable): number =>
  HOSPITAL_IDS.filter((h) => profileAreaPositivePrivacy(id, day, h, table).suppressed).length;

export const profileDisclosureSummary = (id: ProfileId, day: number, table?: CountTable): string => {
  const suppressed = profileSuppressedAreaCount(id, day, table);
  const positives = regionalPositives(id, day, table);
  const name = PROFILE_BY_ID[id].displayName;
  if (suppressed === 0) {
    return `All 3 surveillance areas meet the prototype display threshold of ${MINIMUM_DISPLAY_COUNT} for ${name}, so area-level counts are shown.`;
  }
  // A county total below the threshold is itself withheld.
  const county = positives >= MINIMUM_DISPLAY_COUNT ? String(positives) : SUPPRESSED_VALUE;
  if (suppressed === 3) {
    return `All 3 surveillance areas report fewer than ${MINIMUM_DISPLAY_COUNT} ${name} positive results. Area-level counts are suppressed and the signal is reported at county level (Worcester County: ${county}).`;
  }
  return `${suppressed} of 3 surveillance areas report fewer than ${MINIMUM_DISPLAY_COUNT} ${name} positive results. Those counts are suppressed and rolled up to county level (Worcester County: ${county}).`;
};

export const areaPrivacyFor = (id: ProfileId, day: number, table?: CountTable): AreaPrivacy =>
  id === RVS_PROFILE_ID && !table
    ? {
        positive: (h) => getAreaPositivePrivacy(day, h),
        positivity: (h) => getAreaPositivityDisplay(day, h),
        suppressedCount: getSuppressedAreaCount(day),
        summary: getDisclosureSummary(day),
      }
    : {
        positive: (h) => profileAreaPositivePrivacy(id, day, h, table),
        positivity: (h) => profileAreaPositivityDisplay(id, day, h, table),
        suppressedCount: profileSuppressedAreaCount(id, day, table),
        summary: profileDisclosureSummary(id, day, table),
      };

/* ------------------------------------------------------------------------ *
 * Facility and regional counts.
 *
 * The same rule (applyGeographicPrivacy, threshold unchanged) applied at the
 * other levels a count is shown: a facility's positives (Facility level,
 * rolled up to the county), and a profile's regional positives (County
 * level, nothing broader to roll up to within the network). A positivity
 * rate shown beside its test count would reveal the count, so a rate is
 * withheld whenever its count is.
 * ------------------------------------------------------------------------ */

const COUNTY_LABEL = 'County';

/** Positive results at one facility on one day, for a profile. */
export const facilityPositivePrivacy = (id: ProfileId, day: number, hospitalId: HospitalId, table?: CountTable): PrivacyResult => {
  const hospital = HOSPITAL_BY_ID[hospitalId];
  return applyGeographicPrivacy({
    count: site(id, day, hospitalId, table).positives,
    level: 'Facility',
    measure: 'positive results',
    areaLabel: hospital.name,
    rollup: { level: COUNTY_LABEL, count: regionalPositives(id, day, table), label: hospital.county },
  });
};

/** A facility's positives from Day 1 through the given day. */
export const facilityCumulativePositivePrivacy = (id: ProfileId, day: number, hospitalId: HospitalId, table?: CountTable): PrivacyResult => {
  let positives = 0;
  for (let d = 1; d <= day; d += 1) positives += site(id, d, hospitalId, table).positives;
  return applyGeographicPrivacy({
    count: positives,
    level: 'Facility',
    measure: 'positive results',
    areaLabel: HOSPITAL_BY_ID[hospitalId].name,
  });
};

/** A profile's positives across the whole network (the county) on one day. */
export const regionalPositivePrivacy = (id: ProfileId, day: number, table?: CountTable): PrivacyResult =>
  applyGeographicPrivacy({
    count: regionalPositives(id, day, table),
    level: COUNTY_LABEL,
    measure: `${PROFILE_BY_ID[id].displayName} positive results`,
    areaLabel: 'Worcester County',
  });

/** A rate shown only when its count may be shown. */
export const rateDisplay = (privacy: PrivacyResult, rate: number): string =>
  privacy.suppressed ? SUPPRESSED_VALUE : `${rate.toFixed(1)}%`;

/** Replay days on which a profile's regional positives are withheld. */
export const suppressedRegionalDays = (id: ProfileId): number[] =>
  [1, 2, 3, 4, 5].filter((day) => regionalPositivePrivacy(id, day).suppressed);

/**
 * A score component's evidence as it may be displayed. The positivity
 * component quotes rates that, with the test count, would reveal a withheld
 * count; its points are shown, its rates are not.
 */
export const componentEvidence = (
  component: { key: string; evidence: string },
  regionalSuppressed: boolean,
): string =>
  regionalSuppressed && component.key === 'positivity'
    ? `Rates withheld: fewer than ${MINIMUM_DISPLAY_COUNT} positive results on the day or the baseline day`
    : component.evidence;

export { SUPPRESSED_VALUE, MINIMUM_DISPLAY_COUNT };
