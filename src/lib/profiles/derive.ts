/**
 * Per-profile surveillance figures for the replay calendar.
 *
 * One pass routes every observation to EVERY profile its test belongs to
 * (many-to-many), so a single Influenza A result updates both Influenza A and
 * Respiratory Viral Activity. Each profile then gets its own daily counts and
 * its own Composite Outbreak Signal Score from the unchanged scoring function
 * (signalScore.ts) — scores are never merged across profiles.
 *
 * The replay rules apply to every profile exactly as they apply to the
 * narrated scenario: Day 1 is the baseline day, a facility is affected at
 * +3 percentage points over the baseline, persistence counts consecutive days
 * above baseline. For Respiratory Viral Activity this reproduces the frozen
 * scenario exactly (0 / 24 / 50 / 74 / 87); a test pins it.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  HospitalId,
  HospitalMetrics,
  LabObservation,
  Severity,
  SignalScoreResult,
  SimulationDay,
  SimulationScenario,
  ZipMetrics,
} from '../../types';
import { OBSERVATIONS } from '../../data/observations';
import { PORTFOLIO_OBSERVATIONS } from '../../data/portfolio';
import { HOSPITALS, HOSPITAL_BY_ID } from '../../data/hospitals';
import { HOSPITAL_IDS, SIMULATION_DAYS, type SiteDayCounts } from '../../data/dataset';
import { SCENARIOS, simulationDateFor } from '../../data/simulation';
import { ZIP_AREAS } from '../../data/zipAreas';
import { calculateSignalScore, getSeverity } from '../signalScore';
import { buildTrendSeries, type TrendPoint } from '../analytics';
import {
  PROFILES,
  PROFILE_BY_ID,
  RVS_PROFILE_ID,
  profilesForTest,
  settingsFor,
  type ProfileId,
} from './registry';

export type ProfileStatus =
  | 'ACTIVE_SIGNAL'
  | 'WITHIN_EXPECTED_RANGE'
  | 'INSUFFICIENT_BASELINE'
  | 'NO_DATA'
  | 'INACTIVE';

export const STATUS_LABEL: Record<ProfileStatus, string> = {
  ACTIVE_SIGNAL: 'Active signal',
  WITHIN_EXPECTED_RANGE: 'Within expected range',
  INSUFFICIENT_BASELINE: 'Insufficient baseline',
  NO_DATA: 'No data',
  INACTIVE: 'Inactive',
};

/** Floating-point guard, as in dataset.ts. */
const EPSILON = 1e-9;

/** Every observation the prototype holds: the replay feed, then the portfolio fixtures. */
export const ALL_OBSERVATIONS: LabObservation[] = [...OBSERVATIONS, ...PORTFOLIO_OBSERVATIONS];

/**
 * The routing step: each observation is added to every profile its test code
 * belongs to. An unmapped code reaches no profile. A live feed would call
 * this per arriving observation.
 */
export const routeObservations = (
  observations: LabObservation[],
): Record<ProfileId, LabObservation[]> => {
  const routed = Object.fromEntries(PROFILES.map((p) => [p.id, [] as LabObservation[]])) as Record<
    ProfileId,
    LabObservation[]
  >;
  observations.forEach((observation) => {
    profilesForTest(observation.loincCode).forEach((id) => routed[id].push(observation));
  });
  return routed;
};

export const OBSERVATIONS_BY_PROFILE = routeObservations(ALL_OBSERVATIONS);

type SiteCounts = Record<HospitalId, SiteDayCounts>;

const countSites = (observations: LabObservation[]): Record<SimulationDay, SiteCounts> => {
  const counts = Object.fromEntries(
    SIMULATION_DAYS.map((day) => [
      day,
      Object.fromEntries(HOSPITAL_IDS.map((id) => [id, { tests: 0, positives: 0 }])),
    ]),
  ) as Record<SimulationDay, SiteCounts>;
  observations.forEach((o) => {
    const cell = counts[o.day][o.hospitalId];
    cell.tests += 1;
    if (o.result === 'Positive') cell.positives += 1;
  });
  return counts;
};

/** Per-profile, per-day, per-facility counts — built once from the routed observations. */
export const PROFILE_SITE_DAY_COUNTS = Object.fromEntries(
  PROFILES.map((p) => [p.id, countSites(OBSERVATIONS_BY_PROFILE[p.id])]),
) as Record<ProfileId, Record<SimulationDay, SiteCounts>>;

const positivity = (c: SiteDayCounts) => (c.tests === 0 ? 0 : (c.positives / c.tests) * 100);

const regional = (id: ProfileId, day: SimulationDay): SiteDayCounts =>
  HOSPITAL_IDS.reduce(
    (acc, h) => ({
      tests: acc.tests + PROFILE_SITE_DAY_COUNTS[id][day][h].tests,
      positives: acc.positives + PROFILE_SITE_DAY_COUNTS[id][day][h].positives,
    }),
    { tests: 0, positives: 0 },
  );

export interface ProfileBaseline {
  day: number;
  tests: number;
  positives: number;
  positivityRate: number;
  /** At least the minimum number of tests on the baseline day. */
  sufficient: boolean;
}

export interface ProfileDay {
  profileId: ProfileId;
  day: SimulationDay;
  /** Same shape as the narrated scenario's day, so the same views can show it. */
  scenario: SimulationScenario;
  baseline: ProfileBaseline;
  /** Null when there is no data or no usable baseline — never a guessed score. */
  score: SignalScoreResult | null;
  status: ProfileStatus;
  /** Why the profile has this status, in plain words. */
  statusReason: string;
}

export const baselineFor = (id: ProfileId): ProfileBaseline => {
  const { replay } = settingsFor(id);
  const day = replay.baselineDay as SimulationDay;
  const counts = regional(id, day);
  return {
    day,
    tests: counts.tests,
    positives: counts.positives,
    positivityRate: positivity(counts),
    sufficient: counts.tests >= replay.minimumBaselineTests,
  };
};

const affectedHospitalsOn = (id: ProfileId, day: SimulationDay, baseline: ProfileBaseline): HospitalId[] => {
  const settings = settingsFor(id);
  return HOSPITAL_IDS.filter((h) => {
    const site = PROFILE_SITE_DAY_COUNTS[id][day][h];
    // Too few tests to judge a facility (the engine's inherited minimum).
    if (site.tests < settings.engine.facilityMinimumTests) return false;
    return positivity(site) - baseline.positivityRate >= settings.replay.affectedMarginPoints - EPSILON;
  });
};

const persistenceOn = (id: ProfileId, day: SimulationDay, baseline: ProfileBaseline): number => {
  let count = 0;
  for (let d = day; d >= 1; d -= 1) {
    const counts = regional(id, d as SimulationDay);
    if (counts.tests === 0 || !(positivity(counts) > baseline.positivityRate + EPSILON)) break;
    count += 1;
  }
  return count;
};

const statusText = (
  id: ProfileId,
  status: ProfileStatus,
  day: SimulationDay,
  baseline: ProfileBaseline,
  score: SignalScoreResult | null,
): string => {
  const name = PROFILE_BY_ID[id].displayName;
  switch (status) {
    case 'INACTIVE':
      return `${name} is not being monitored.`;
    case 'NO_DATA':
      return `No ${name} results were received on Day ${day}. No data is not the same as normal activity.`;
    case 'INSUFFICIENT_BASELINE':
      return `${name} has ${baseline.tests} ${baseline.tests === 1 ? 'test' : 'tests'} on its Day ${baseline.day} baseline, below the minimum of ${settingsFor(id).replay.minimumBaselineTests}. No score is calculated until a baseline exists.`;
    case 'WITHIN_EXPECTED_RANGE':
      return `${name} scores ${score?.composite ?? 0} (Low) against its own Day ${baseline.day} baseline.`;
    case 'ACTIVE_SIGNAL':
    default:
      return `${name} scores ${score?.composite} (${score?.severity}) against its own Day ${baseline.day} baseline.`;
  }
};

export const statusFor = (
  active: boolean,
  hasData: boolean,
  baselineSufficient: boolean,
  severity: Severity | null,
): ProfileStatus => {
  if (!active) return 'INACTIVE';
  if (!hasData) return 'NO_DATA';
  if (!baselineSufficient) return 'INSUFFICIENT_BASELINE';
  // The existing severity bands, unchanged: Low is the expected range.
  return severity === 'Low' ? 'WITHIN_EXPECTED_RANGE' : 'ACTIVE_SIGNAL';
};

const describe = (id: ProfileId, status: ProfileStatus, counts: SiteDayCounts, affected: number): string => {
  const name = PROFILE_BY_ID[id].displayName;
  if (status === 'NO_DATA') return `No ${name} results were received on this day.`;
  const base = `${counts.tests} ${name} ${counts.tests === 1 ? 'result' : 'results'}, ${counts.positives} positive`;
  if (status === 'INSUFFICIENT_BASELINE') return `${base}. There is no usable baseline yet, so no score is calculated.`;
  return `${base}; ${affected} of 3 facilities above the detection margin.`;
};

const buildProfileDay = (id: ProfileId, day: SimulationDay): ProfileDay => {
  const profile = PROFILE_BY_ID[id];
  const baseline = baselineFor(id);
  const counts = regional(id, day);
  const affectedHospitals = affectedHospitalsOn(id, day, baseline);
  const persistenceDays = persistenceOn(id, day, baseline);
  const hasData = counts.tests > 0;
  const scoreable = profile.active && hasData && baseline.sufficient;
  const score = scoreable
    ? calculateSignalScore({
        totalTests: counts.tests,
        positivityRate: positivity(counts),
        affectedFacilities: affectedHospitals.length,
        affectedZipCodes: affectedHospitals.map((h) => HOSPITAL_BY_ID[h].zipCode),
        persistenceDays,
        baselineTestVolume: baseline.tests,
        baselinePositivityRate: baseline.positivityRate,
      })
    : null;
  const status = statusFor(profile.active, hasData, baseline.sufficient, score?.severity ?? null);
  const narrated = id === RVS_PROFILE_ID ? SCENARIOS.find((s) => s.day === day) : undefined;

  return {
    profileId: id,
    day,
    scenario: {
      day,
      stage: narrated?.stage ?? STATUS_LABEL[status],
      description: narrated?.description ?? describe(id, status, counts, affectedHospitals.length),
      simulationDate: simulationDateFor(day),
      totalTests: counts.tests,
      totalPositives: counts.positives,
      positivityRate: positivity(counts),
      affectedHospitals,
      affectedZipCodes: affectedHospitals.map((h) => HOSPITAL_BY_ID[h].zipCode),
      persistenceDays,
    },
    baseline,
    score,
    status,
    statusReason: statusText(id, status, day, baseline, score),
  };
};

/** Every profile's five days, computed once. */
export const PROFILE_DAYS = Object.fromEntries(
  PROFILES.map((p) => [p.id, SIMULATION_DAYS.map((day) => buildProfileDay(p.id, day))]),
) as Record<ProfileId, ProfileDay[]>;

export const getProfileDay = (id: ProfileId, day: number): ProfileDay => {
  const found = PROFILE_DAYS[id].find((d) => d.day === day);
  if (!found) throw new Error(`Replay day ${day} is outside the valid range (1-5).`);
  return found;
};

/** Observations for a profile, Day 1 through the given day. */
export const profileObservationsThrough = (id: ProfileId, day: number): LabObservation[] =>
  OBSERVATIONS_BY_PROFILE[id].filter((o) => o.day <= day);

/** The trend series for a profile; an unscored day plots a score of 0 and is flagged. */
export const profileTrendSeries = (id: ProfileId, day: number): TrendPoint[] =>
  buildTrendSeries(
    PROFILE_DAYS[id].map((d) => ({ scenario: d.scenario, compositeScore: d.score?.composite ?? 0 })),
    day,
  );

/** Surveillance-area metrics for a profile — the same rules as selectors.getZipMetrics. */
export const profileZipMetrics = (id: ProfileId, day: number): ZipMetrics[] => {
  const current = getProfileDay(id, day);
  const composite = current.score?.composite ?? 0;
  const counts = PROFILE_SITE_DAY_COUNTS[id];
  return ZIP_AREAS.map((area) => {
    const site = counts[day as SimulationDay][area.hospitalId];
    const rate = positivity(site);
    const isAffected = current.scenario.affectedZipCodes.includes(area.zipCode);
    let trend: ZipMetrics['trend'] = 'Baseline';
    if (day > 1) {
      const delta = rate - positivity(counts[(day - 1) as SimulationDay][area.hospitalId]);
      trend = delta > 0.5 ? 'Increasing' : delta < -0.5 ? 'Decreasing' : 'Stable';
    }
    const raw =
      !isAffected || current.scenario.positivityRate === 0
        ? 0
        : Math.round((composite * rate) / current.scenario.positivityRate);
    const score = Math.min(Math.max(raw, 0), 100);
    const cumulative = SIMULATION_DAYS.filter((d) => d <= day).reduce(
      (acc, d) => ({ tests: acc.tests + counts[d][area.hospitalId].tests, positives: acc.positives + counts[d][area.hospitalId].positives }),
      { tests: 0, positives: 0 },
    );
    return {
      zipCode: area.zipCode,
      city: area.city,
      state: area.state,
      hospitalId: area.hospitalId,
      hospitalName: HOSPITAL_BY_ID[area.hospitalId].name,
      totalTests: site.tests,
      positiveTests: site.positives,
      positivityRate: rate,
      cumulativeTests: cumulative.tests,
      cumulativePositives: cumulative.positives,
      trend,
      severity: getSeverity(score),
      score,
      isAffected,
    };
  });
};

/** Facility metrics for a profile — the same rules as selectors.getHospitalMetrics. */
export const profileHospitalMetrics = (id: ProfileId, day: number): HospitalMetrics[] => {
  const current = getProfileDay(id, day);
  const counts = PROFILE_SITE_DAY_COUNTS[id];
  const zips = profileZipMetrics(id, day);
  const baseline = current.baseline;
  const days = SIMULATION_DAYS.filter((d) => d <= day);
  const visible = profileObservationsThrough(id, day);
  const byTimeDesc = (a: LabObservation, b: LabObservation) => b.effectiveDateTime.localeCompare(a.effectiveDateTime);
  return HOSPITALS.map((hospital) => {
    const site = counts[day as SimulationDay][hospital.id];
    const cumulative = days.reduce(
      (acc, d) => ({ tests: acc.tests + counts[d][hospital.id].tests, positives: acc.positives + counts[d][hospital.id].positives }),
      { tests: 0, positives: 0 },
    );
    const firstSignalDay =
      days.find((d) => affectedHospitalsOn(id, d, baseline).includes(hospital.id)) ?? null;
    return {
      hospital,
      totalTests: site.tests,
      positiveTests: site.positives,
      positivityRate: positivity(site),
      cumulativeTests: cumulative.tests,
      cumulativePositives: cumulative.positives,
      cumulativePositivityRate: positivity(cumulative),
      firstSignalDay,
      isAffected: current.scenario.affectedHospitals.includes(hospital.id),
      severity: zips.find((z) => z.hospitalId === hospital.id)?.severity ?? 'Low',
      dayObservations: visible.filter((o) => o.day === day && o.hospitalId === hospital.id).sort(byTimeDesc),
      observations: visible.filter((o) => o.hospitalId === hospital.id).sort(byTimeDesc),
      volumeSeries: days.map((d) => ({ day: d, tests: counts[d][hospital.id].tests })),
      positivitySeries: days.map((d) => ({ day: d, positivity: Number(positivity(counts[d][hospital.id]).toFixed(1)) })),
    };
  });
};
