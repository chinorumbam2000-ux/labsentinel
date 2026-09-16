/**
 * THE authoritative synthetic dataset.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 *
 * Everything the prototype displays — regional totals, hospital totals,
 * geographic totals, positivity, trends, affected facilities, persistence and
 * every composite score input — is derived from the integer counts below.
 * Nothing else in the codebase may define its own totals or positivity.
 *
 * Counts are integers because a test either happened or it did not, and a
 * result is either positive or negative. Positivity is therefore always a
 * derived ratio (positives / tests), never a stored percentage. Storing a
 * percentage alongside the counts is what allowed the two to drift apart.
 */
import type { HospitalId, SimulationDay } from '../types';

export interface SiteDayCounts {
  tests: number;
  positives: number;
}

export interface RegionalCounts {
  tests: number;
  positives: number;
  negatives: number;
  /** Derived: (positives / tests) * 100. Unrounded — round only for display. */
  positivityRate: number;
}

export const HOSPITAL_IDS: HospitalId[] = ['HOSP-A', 'HOSP-B', 'HOSP-C'];

export const SIMULATION_DAYS: SimulationDay[] = [1, 2, 3, 4, 5];

/** Day 1 is the baseline day, so the baselines are Day 1's own figures. */
export const BASELINE_TEST_VOLUME = 100;
export const BASELINE_POSITIVITY_RATE = 8.0;

/**
 * A facility is counted as "affected" once its own positivity sits this many
 * percentage points above the regional baseline. Derived, not authored — which
 * is why a facility's first-signal day cannot disagree with its own numbers.
 */
export const AFFECTED_MARGIN_POINTS = 3.0;

/** Floating-point guard: 8 / 100 * 100 is not exactly 8 in IEEE-754. */
const EPSILON = 1e-9;

/**
 * Per-day, per-site counts. Site volumes follow fixed shares of the regional
 * daily total (HOSP-A 41%, HOSP-B 34%, HOSP-C 25%), with the last site
 * absorbing the rounding remainder so the parts sum exactly. Positives are
 * allocated by weighted largest-remainder so they also sum exactly.
 */
export const SITE_DAY_COUNTS: Record<SimulationDay, Record<HospitalId, SiteDayCounts>> = {
  1: {
    'HOSP-A': { tests: 41, positives: 3 },
    'HOSP-B': { tests: 34, positives: 3 },
    'HOSP-C': { tests: 25, positives: 2 },
  },
  2: {
    'HOSP-A': { tests: 51, positives: 7 },
    'HOSP-B': { tests: 42, positives: 3 },
    'HOSP-C': { tests: 31, positives: 2 },
  },
  3: {
    'HOSP-A': { tests: 58, positives: 9 },
    'HOSP-B': { tests: 48, positives: 7 },
    'HOSP-C': { tests: 35, positives: 3 },
  },
  4: {
    'HOSP-A': { tests: 65, positives: 11 },
    'HOSP-B': { tests: 54, positives: 9 },
    'HOSP-C': { tests: 39, positives: 6 },
  },
  5: {
    'HOSP-A': { tests: 72, positives: 14 },
    'HOSP-B': { tests: 60, positives: 12 },
    'HOSP-C': { tests: 44, positives: 8 },
  },
};

const assertDay = (day: number): SimulationDay => {
  if (!SIMULATION_DAYS.includes(day as SimulationDay)) {
    throw new Error(`Simulation day ${day} is outside the valid range (1-5).`);
  }
  return day as SimulationDay;
};

/** Positivity as a percentage. Returns 0 when no tests were performed. */
export const positivityOf = (counts: SiteDayCounts): number =>
  counts.tests === 0 ? 0 : (counts.positives / counts.tests) * 100;

export const getSiteCounts = (day: number, hospitalId: HospitalId): SiteDayCounts =>
  SITE_DAY_COUNTS[assertDay(day)][hospitalId];

/** Regional totals for a single day, summed from the site counts. */
export const getRegionalCounts = (day: number): RegionalCounts => {
  const sites = SITE_DAY_COUNTS[assertDay(day)];
  const tests = HOSPITAL_IDS.reduce((sum, id) => sum + sites[id].tests, 0);
  const positives = HOSPITAL_IDS.reduce((sum, id) => sum + sites[id].positives, 0);
  return {
    tests,
    positives,
    negatives: tests - positives,
    positivityRate: tests === 0 ? 0 : (positives / tests) * 100,
  };
};

/** Site totals accumulated from Day 1 through the given day inclusive. */
export const getCumulativeSiteCounts = (
  day: number,
  hospitalId: HospitalId,
): SiteDayCounts => {
  const upTo = assertDay(day);
  return SIMULATION_DAYS.filter((d) => d <= upTo).reduce<SiteDayCounts>(
    (acc, d) => ({
      tests: acc.tests + SITE_DAY_COUNTS[d][hospitalId].tests,
      positives: acc.positives + SITE_DAY_COUNTS[d][hospitalId].positives,
    }),
    { tests: 0, positives: 0 },
  );
};

/** Regional totals accumulated from Day 1 through the given day inclusive. */
export const getCumulativeRegionalCounts = (day: number): RegionalCounts => {
  const upTo = assertDay(day);
  const totals = SIMULATION_DAYS.filter((d) => d <= upTo).reduce(
    (acc, d) => {
      const regional = getRegionalCounts(d);
      return { tests: acc.tests + regional.tests, positives: acc.positives + regional.positives };
    },
    { tests: 0, positives: 0 },
  );
  return {
    ...totals,
    negatives: totals.tests - totals.positives,
    positivityRate: totals.tests === 0 ? 0 : (totals.positives / totals.tests) * 100,
  };
};

/**
 * Facilities whose own positivity is at least AFFECTED_MARGIN_POINTS above
 * baseline on the given day. Derived from the counts, so a facility can never
 * be flagged as affected while its own numbers say otherwise.
 */
export const getAffectedHospitals = (day: number): HospitalId[] => {
  const sites = SITE_DAY_COUNTS[assertDay(day)];
  return HOSPITAL_IDS.filter(
    (id) =>
      positivityOf(sites[id]) - BASELINE_POSITIVITY_RATE >= AFFECTED_MARGIN_POINTS - EPSILON,
  );
};

/** Regional positivity strictly above baseline on the given day. */
export const isAboveBaseline = (day: number): boolean =>
  getRegionalCounts(day).positivityRate > BASELINE_POSITIVITY_RATE + EPSILON;

/**
 * Consecutive days ending at the given day on which regional positivity has
 * stayed above baseline.
 */
export const getPersistenceDays = (day: number): number => {
  let count = 0;
  for (let d = assertDay(day); d >= 1; d -= 1) {
    if (!isAboveBaseline(d)) break;
    count += 1;
  }
  return count;
};

/**
 * The first day on or before `throughDay` on which a facility was affected.
 * Returns null when the facility has not yet signalled — future first-signal
 * days are never revealed.
 */
export const getFirstSignalDay = (
  hospitalId: HospitalId,
  throughDay: number,
): SimulationDay | null => {
  const upTo = assertDay(throughDay);
  const match = SIMULATION_DAYS.filter((d) => d <= upTo).find((d) =>
    getAffectedHospitals(d).includes(hospitalId),
  );
  return match ?? null;
};
