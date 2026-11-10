/**
 * What a profile's figures look like once the small-count rule is applied.
 *
 * One function decides, for a profile and replay day, which positive counts
 * and positivity rates may be displayed. The screens, the reports and Roella
 * all use it, so none of them can show — or let a reader work out — a count
 * the others withhold. The rule itself (threshold 5, roll-up) lives unchanged
 * in geographicPrivacy.ts.
 *
 * Respiratory Viral Activity's regional counts are never below the threshold
 * (a test pins it), so its regional figures display exactly as before; its
 * facility-level counts are now held to the same rule as its area counts.
 */
import type { DayOverDayComparison, HospitalId, PrivacyResult, ScoreComponent } from '../../types';
import type { TrendPoint } from '../analytics';
import { PROFILE_BY_ID, type ProfileId } from './registry';
import { getProfileDay, type ProfileStatus } from './derive';
import {
  MINIMUM_DISPLAY_COUNT,
  SUPPRESSED_VALUE,
  componentEvidence,
  facilityCumulativePositivePrivacy,
  facilityPositivePrivacy,
  rateDisplay,
  regionalPositivePrivacy,
} from './privacy';

export interface LowVolumeNote {
  title: string;
  text: string;
}

export interface ProfileDisplay {
  /** The day's regional positive count, as it may be displayed. */
  regional: PrivacyResult;
  /** The baseline day's regional positive count, as it may be displayed. */
  baseline: PrivacyResult;
  positives: string;
  positivity: string;
  baselinePositivity: string;
  /** Positivity rates hidden in the score's evidence (day or baseline count withheld). */
  ratesWithheld: boolean;
  /** Series for charts: positivity is null on a day whose count is withheld. */
  trendSeries: TrendPoint[];
  dayOverDay: DayOverDayComparison | null;
  facility: (hospitalId: HospitalId) => PrivacyResult;
  facilityOn: (hospitalId: HospitalId, day: number) => PrivacyResult;
  facilityPositivity: (hospitalId: HospitalId, rate: number) => string;
  facilityCumulative: (hospitalId: HospitalId) => PrivacyResult;
  /** A score component's evidence as it may be shown. */
  evidence: (component: Pick<ScoreComponent, 'key' | 'evidence'>) => string;
  lowVolume: LowVolumeNote | null;
}

const maskComparison = (
  comparison: DayOverDayComparison | null,
  withheld: boolean,
): DayOverDayComparison | null => {
  if (!comparison || !withheld) return comparison;
  return {
    ...comparison,
    metrics: comparison.metrics.map((m) =>
      m.label === 'Positive results' || m.label === 'Positivity'
        ? { ...m, previous: SUPPRESSED_VALUE, current: SUPPRESSED_VALUE, delta: 'Withheld (fewer than 5)' }
        : m,
    ),
  };
};

/**
 * The low-volume caution. It reuses the existing display threshold as a
 * plain indicator — no new statistical threshold: when a profile's baseline
 * day has fewer positive results than the app is allowed to display, one or
 * two results either way move its positivity, and so its score, sharply.
 */
export const lowVolumeNote = (id: ProfileId, status: ProfileStatus): LowVolumeNote | null => {
  if (status !== 'ACTIVE_SIGNAL' && status !== 'WITHIN_EXPECTED_RANGE') return null;
  const baseline = getProfileDay(id, 1).baseline;
  if (baseline.positives >= MINIMUM_DISPLAY_COUNT) return null;
  const name = PROFILE_BY_ID[id].displayName;
  return {
    title: 'Small numbers',
    text: `${name}'s Day ${baseline.day} baseline has ${baseline.tests} tests and fewer than ${MINIMUM_DISPLAY_COUNT} positive results, so a change of one or two results moves its positivity — and its score — sharply from day to day. Read its score as illustrative.`,
  };
};

export const buildProfileDisplay = (
  id: ProfileId,
  day: number,
  trendSeries: TrendPoint[],
  dayOverDay: DayOverDayComparison | null,
  status: ProfileStatus,
): ProfileDisplay => {
  const current = getProfileDay(id, day);
  const regional = regionalPositivePrivacy(id, day);
  const baseline = regionalPositivePrivacy(id, current.baseline.day);
  const withheldDays = new Set([1, 2, 3, 4, 5].filter((d) => regionalPositivePrivacy(id, d).suppressed));
  const previousWithheld = day > 1 && withheldDays.has(day - 1);
  return {
    regional,
    baseline,
    positives: regional.displayValue,
    positivity: rateDisplay(regional, current.scenario.positivityRate),
    baselinePositivity: rateDisplay(baseline, current.baseline.positivityRate),
    ratesWithheld: regional.suppressed || baseline.suppressed,
    trendSeries: trendSeries.map((point) =>
      withheldDays.has(point.day) ? { ...point, positivity: null as unknown as number } : point,
    ),
    dayOverDay: maskComparison(dayOverDay, regional.suppressed || previousWithheld),
    facility: (h) => facilityPositivePrivacy(id, day, h),
    facilityOn: (h, d) => facilityPositivePrivacy(id, d, h),
    facilityPositivity: (h, rate) => rateDisplay(facilityPositivePrivacy(id, day, h), rate),
    facilityCumulative: (h) => facilityCumulativePositivePrivacy(id, day, h),
    evidence: (component) => componentEvidence(component, regional.suppressed || baseline.suppressed),
    lowVolume: lowVolumeNote(id, status),
  };
};
