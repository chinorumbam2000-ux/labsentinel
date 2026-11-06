/**
 * The dynamic surveillance engine, in the browser, for Live Surveillance.
 *
 * The same rules as the backend engine (backend/app/surveillance/engine.py,
 * baseline.py, aggregator.py), so the same observations give the same
 * signal in both — a parity test runs the backend on the browser's fixture:
 *
 *  - Baseline: rolling mean of the 7 days before the date (the date itself
 *    and later days never used); days without data left out; at least 5
 *    observed days, else INSUFFICIENT_BASELINE. Volume = mean tests per
 *    observed day; positivity = pooled positives / (positives + negatives).
 *  - NO_DATA when the date has no eligible result.
 *  - A facility is ABNORMAL with its own sufficient baseline, at least 10
 *    tests, and volume >= +25 % or positivity >= +5 points over that baseline.
 *  - Participating facilities: those reporting the profile on the date or in
 *    its baseline window. Areas: their postal codes.
 *  - Persistence: 0 when no facility is abnormal; else the previous day's
 *    persistence + 1 when that day was calculated and abnormal, else 1.
 *  - Score: the five components and the Composite Outbreak Signal Score from
 *    the app's one scoring function (signalScore.ts), unchanged. The backend
 *    scorer is a port of it; with all three facilities (and so all three
 *    areas) participating — always true in this simulation, and checked —
 *    its facility and area shares equal the function's fixed denominators.
 *
 * Settings come from each profile's registry configuration (illustrative
 * defaults, inherited, not validated).
 */
import type { HospitalId, SignalScoreResult } from '../../types';
import { HOSPITAL_BY_ID } from '../../data/hospitals';
import { calculateSignalScore } from '../signalScore';
import { settingsFor, type ProfileId } from '../profiles/registry';

export interface DayCounts {
  tests: number;
  positive: number;
  negative: number;
}

export const EMPTY: DayCounts = { tests: 0, positive: 0, negative: 0 };

/** facility -> day index -> counts, for one profile. */
export type FacilityDaily = Record<HospitalId, Record<number, DayCounts>>;

const FACILITIES: HospitalId[] = ['HOSP-A', 'HOSP-B', 'HOSP-C'];

const determinate = (c: DayCounts) => c.positive + c.negative;
const positivityOf = (c: DayCounts): number | null => (determinate(c) === 0 ? null : (c.positive / determinate(c)) * 100);

export interface LiveBaseline {
  observedDays: number;
  meanTests: number | null;
  positivity: number | null;
  sufficient: boolean;
}

export const baselineFor = (daily: Record<number, DayCounts>, target: number, id: ProfileId): LiveBaseline => {
  const { baselineWindowDays, minimumBaselineDays } = settingsFor(id).engine;
  const observed: DayCounts[] = [];
  for (let d = target - baselineWindowDays; d <= target - 1; d += 1) {
    const c = daily[d];
    if (c && c.tests > 0) observed.push(c);
  }
  const tests = observed.reduce((s, c) => s + c.tests, 0);
  const positives = observed.reduce((s, c) => s + c.positive, 0);
  const det = observed.reduce((s, c) => s + determinate(c), 0);
  const sufficient = observed.length >= minimumBaselineDays && det > 0;
  return {
    observedDays: observed.length,
    meanTests: sufficient ? tests / observed.length : null,
    positivity: sufficient ? (positives / det) * 100 : null,
    sufficient,
  };
};

export type FacilityStatus = 'NOT_REPORTING' | 'INSUFFICIENT_BASELINE' | 'BELOW_MINIMUM' | 'NORMAL' | 'ABNORMAL';

export interface FacilityAssessment {
  hospitalId: HospitalId;
  counts: DayCounts;
  baseline: LiveBaseline;
  status: FacilityStatus;
  /** Why it is ABNORMAL (or below the minimum), in words. */
  reasons: string[];
  volumeChange: number | null;
  positivityChange: number | null;
}

export const assessFacility = (
  hospitalId: HospitalId,
  counts: DayCounts,
  baseline: LiveBaseline,
  id: ProfileId,
): FacilityAssessment => {
  const config = settingsFor(id).engine;
  let volumeChange: number | null = null;
  let positivityChange: number | null = null;
  if (baseline.sufficient && counts.tests > 0) {
    volumeChange = ((counts.tests - baseline.meanTests!) / baseline.meanTests!) * 100;
    const current = positivityOf(counts);
    if (current !== null) positivityChange = current - baseline.positivity!;
  }
  const reasons: string[] = [];
  let status: FacilityStatus;
  if (counts.tests === 0) status = 'NOT_REPORTING';
  else if (!baseline.sufficient) status = 'INSUFFICIENT_BASELINE';
  else if (counts.tests < config.facilityMinimumTests) {
    status = 'BELOW_MINIMUM';
    reasons.push(`${counts.tests} tests, below the minimum of ${config.facilityMinimumTests}`);
  } else {
    if (volumeChange !== null && volumeChange >= config.volumeIncreasePercent) {
      reasons.push(`volume ${volumeChange >= 0 ? '+' : ''}${volumeChange.toFixed(1)}% (threshold +${config.volumeIncreasePercent}%)`);
    }
    if (positivityChange !== null && positivityChange >= config.positivityIncreasePoints) {
      reasons.push(`positivity +${positivityChange.toFixed(1)} points (threshold +${config.positivityIncreasePoints})`);
    }
    status = reasons.length ? 'ABNORMAL' : 'NORMAL';
  }
  return { hospitalId, counts, baseline, status, reasons, volumeChange, positivityChange };
};

export type CalculationStatus = 'CALCULATED' | 'NO_DATA' | 'INSUFFICIENT_BASELINE';

export interface LiveSignal {
  profileId: ProfileId;
  day: number;
  status: CalculationStatus;
  current: DayCounts;
  positivityRate: number;
  baseline: LiveBaseline;
  facilities: FacilityAssessment[];
  affected: HospitalId[];
  affectedAreas: string[];
  participatingAreas: string[];
  persistenceDays: number;
  /** Null unless CALCULATED. */
  score: SignalScoreResult | null;
}

const sumFacilities = (daily: FacilityDaily, day: number): DayCounts =>
  FACILITIES.reduce(
    (acc, h) => {
      const c = daily[h]?.[day] ?? EMPTY;
      return { tests: acc.tests + c.tests, positive: acc.positive + c.positive, negative: acc.negative + c.negative };
    },
    { ...EMPTY },
  );

/** Calculates one profile's signal for one day — the backend's engine.calculate. */
export const calculateDay = (
  id: ProfileId,
  target: number,
  daily: FacilityDaily,
  previous: LiveSignal | null,
): LiveSignal => {
  const window = settingsFor(id).engine.baselineWindowDays;
  const regional: Record<number, DayCounts> = {};
  for (let d = target - window; d <= target; d += 1) regional[d] = sumFacilities(daily, d);
  const current = regional[target];
  const baseline = baselineFor(regional, target, id);

  // Facilities that reported this profile on the date or in its window.
  const relevant = FACILITIES.filter((h) => {
    for (let d = target - window; d <= target; d += 1) if ((daily[h]?.[d]?.tests ?? 0) > 0) return true;
    return false;
  });
  const facilities = relevant.map((h) =>
    assessFacility(h, daily[h]?.[target] ?? EMPTY, baselineFor(daily[h] ?? {}, target, id), id),
  );
  const participatingAreas = [...new Set(relevant.map((h) => HOSPITAL_BY_ID[h].zipCode))].sort();

  const base = {
    profileId: id,
    day: target,
    current,
    positivityRate: positivityOf(current) ?? 0,
    baseline,
    facilities,
    participatingAreas,
  };
  if (current.tests === 0 || !baseline.sufficient) {
    return {
      ...base,
      status: current.tests === 0 ? 'NO_DATA' : 'INSUFFICIENT_BASELINE',
      affected: [],
      affectedAreas: [],
      persistenceDays: 0,
      score: null,
    };
  }

  const affected = facilities.filter((f) => f.status === 'ABNORMAL').map((f) => f.hospitalId);
  const affectedAreas = [...new Set(affected.map((h) => HOSPITAL_BY_ID[h].zipCode))].sort();
  const previousDays =
    previous && previous.day === target - 1 && previous.status === 'CALCULATED' && previous.affected.length > 0
      ? previous.persistenceDays
      : 0;
  const persistenceDays = affected.length ? previousDays + 1 : 0;

  // The app's one scoring function. Its fixed denominators (3 facilities,
  // 3 areas) are the backend's measured ones only when all three take part.
  if (facilities.length !== 3 || participatingAreas.length !== 3) {
    throw new Error(`Live engine invariant: ${facilities.length} facilities / ${participatingAreas.length} areas participating, expected 3 / 3.`);
  }
  const score = calculateSignalScore({
    totalTests: current.tests,
    positivityRate: base.positivityRate,
    affectedFacilities: affected.length,
    affectedZipCodes: affectedAreas,
    persistenceDays,
    baselineTestVolume: baseline.meanTests!,
    baselinePositivityRate: baseline.positivity!,
  });
  return { ...base, status: 'CALCULATED', affected, affectedAreas, persistenceDays, score };
};
