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

const site = (id: ProfileId, day: number, h: HospitalId) => PROFILE_SITE_DAY_COUNTS[id][day as SimulationDay][h];

const regionalPositives = (id: ProfileId, day: number) =>
  HOSPITAL_IDS.reduce((sum, h) => sum + site(id, day, h).positives, 0);

export const profileAreaPositivePrivacy = (id: ProfileId, day: number, hospitalId: HospitalId): PrivacyResult => {
  const hospital = HOSPITAL_BY_ID[hospitalId];
  const area = ZIP_AREA_BY_CODE[hospital.zipCode];
  const areaLevel = ACTIVE_HIERARCHY.levels.find((level) => level.rank === 1);
  const broader = areaLevel ? getBroaderLevel(areaLevel.id) : null;
  const parentUnit = broader ? getAncestorAtLevel(hospital.zipCode, broader.id) : undefined;
  return applyGeographicPrivacy({
    count: site(id, day, hospitalId).positives,
    level: areaLevel?.label ?? 'ZIP',
    measure: 'positive results',
    areaLabel: hospital.zipCode,
    rollup: broader
      ? {
          level: broader.label,
          count: regionalPositives(id, day),
          label: parentUnit?.name ?? area?.county ?? 'Worcester County',
        }
      : undefined,
  });
};

export const profileAreaPositivityDisplay = (
  id: ProfileId,
  day: number,
  hospitalId: HospitalId,
): { value: string; suppressed: boolean } => {
  if (profileAreaPositivePrivacy(id, day, hospitalId).suppressed) return { value: SUPPRESSED_VALUE, suppressed: true };
  const counts = site(id, day, hospitalId);
  const rate = counts.tests === 0 ? 0 : (counts.positives / counts.tests) * 100;
  return { value: `${rate.toFixed(1)}%`, suppressed: false };
};

export const profileSuppressedAreaCount = (id: ProfileId, day: number): number =>
  HOSPITAL_IDS.filter((h) => profileAreaPositivePrivacy(id, day, h).suppressed).length;

export const profileDisclosureSummary = (id: ProfileId, day: number): string => {
  const suppressed = profileSuppressedAreaCount(id, day);
  const positives = regionalPositives(id, day);
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

export const areaPrivacyFor = (id: ProfileId, day: number): AreaPrivacy =>
  id === RVS_PROFILE_ID
    ? {
        positive: (h) => getAreaPositivePrivacy(day, h),
        positivity: (h) => getAreaPositivityDisplay(day, h),
        suppressedCount: getSuppressedAreaCount(day),
        summary: getDisclosureSummary(day),
      }
    : {
        positive: (h) => profileAreaPositivePrivacy(id, day, h),
        positivity: (h) => profileAreaPositivityDisplay(id, day, h),
        suppressedCount: profileSuppressedAreaCount(id, day),
        summary: profileDisclosureSummary(id, day),
      };
