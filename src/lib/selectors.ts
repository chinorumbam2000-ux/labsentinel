/**
 * Pure day-driven derivations. Every page reads its numbers from here so that
 * no two screens can disagree about the same simulated day.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  Hospital,
  HospitalId,
  HospitalMetrics,
  LabObservation,
  SimulationDay,
  ZipMetrics,
} from '../types';
import { HOSPITALS, HOSPITAL_BY_ID, HOSPITAL_VOLUME_SHARE } from '../data/hospitals';
import { getVisibleObservations } from '../data/observations';
import { SCENARIOS, getScenario } from '../data/simulation';
import { ZIP_AREAS } from '../data/zipAreas';
import { getSeverity, scoreScenario } from './signalScore';

const HOSPITAL_ORDER: HospitalId[] = ['HOSP-A', 'HOSP-B', 'HOSP-C'];

/**
 * Relative positivity intensity per site, chosen by how concentrated the
 * signal is on a given day. Deterministic — no randomness anywhere.
 */
const intensityProfile = (affectedCount: number): Record<HospitalId, number> => {
  if (affectedCount === 1) return { 'HOSP-A': 1.6, 'HOSP-B': 0.7, 'HOSP-C': 0.6 };
  if (affectedCount === 2) return { 'HOSP-A': 1.25, 'HOSP-B': 1.1, 'HOSP-C': 0.55 };
  return { 'HOSP-A': 1.02, 'HOSP-B': 1.0, 'HOSP-C': 0.97 };
};

/**
 * Split the regional test total across the three sites using fixed shares.
 * The last site absorbs the rounding remainder so the parts always sum to the
 * regional total shown on the dashboard.
 */
export const splitTestsByHospital = (totalTests: number): Record<HospitalId, number> => {
  const result = {} as Record<HospitalId, number>;
  let assigned = 0;
  HOSPITAL_ORDER.forEach((id, index) => {
    if (index === HOSPITAL_ORDER.length - 1) {
      result[id] = totalTests - assigned;
      return;
    }
    const value = Math.round(totalTests * HOSPITAL_VOLUME_SHARE[id]);
    result[id] = value;
    assigned += value;
  });
  return result;
};

/**
 * Distribute the regional positive count across sites by weighted share, using
 * largest-remainder allocation so the parts sum exactly to the regional total.
 */
export const splitPositivesByHospital = (day: number): Record<HospitalId, number> => {
  const scenario = getScenario(day);
  const tests = splitTestsByHospital(scenario.totalTests);
  const totalPositives = Math.round((scenario.totalTests * scenario.positivityRate) / 100);
  const intensity = intensityProfile(scenario.affectedHospitals.length);

  const weights = HOSPITAL_ORDER.map((id) => intensity[id] * tests[id]);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);

  const exact = weights.map((weight) =>
    weightSum === 0 ? 0 : (weight / weightSum) * totalPositives,
  );
  const allocation = exact.map(Math.floor);
  let remaining = totalPositives - allocation.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  let cursor = 0;
  while (remaining > 0 && byRemainder.length > 0) {
    allocation[byRemainder[cursor % byRemainder.length].index] += 1;
    remaining -= 1;
    cursor += 1;
  }

  const result = {} as Record<HospitalId, number>;
  HOSPITAL_ORDER.forEach((id, index) => {
    result[id] = Math.min(allocation[index], tests[id]);
  });
  return result;
};

/** Composite score for a given simulation day. Always calculated, never stored. */
export const getScoreForDay = (day: number) => scoreScenario(getScenario(day));

/** Metrics for every surveillance area on the given day. */
export const getZipMetrics = (day: number): ZipMetrics[] => {
  const scenario = getScenario(day);
  const regional = getScoreForDay(day);
  const tests = splitTestsByHospital(scenario.totalTests);
  const positives = splitPositivesByHospital(day);

  const previousDay = day > 1 ? day - 1 : null;
  const previousTests = previousDay
    ? splitTestsByHospital(getScenario(previousDay).totalTests)
    : null;
  const previousPositives = previousDay ? splitPositivesByHospital(previousDay) : null;

  return ZIP_AREAS.map((area) => {
    const hospital = HOSPITAL_BY_ID[area.hospitalId];
    const areaTests = tests[area.hospitalId];
    const areaPositives = positives[area.hospitalId];
    const positivityRate = areaTests === 0 ? 0 : (areaPositives / areaTests) * 100;
    const isAffected = scenario.affectedZipCodes.includes(area.zipCode);

    let trend: ZipMetrics['trend'] = 'Baseline';
    if (previousTests && previousPositives) {
      const previousRate =
        previousTests[area.hospitalId] === 0
          ? 0
          : (previousPositives[area.hospitalId] / previousTests[area.hospitalId]) * 100;
      const delta = positivityRate - previousRate;
      if (delta > 0.5) trend = 'Increasing';
      else if (delta < -0.5) trend = 'Decreasing';
      else trend = 'Stable';
    }

    const rawScore =
      !isAffected || scenario.positivityRate === 0
        ? 0
        : Math.round((regional.composite * positivityRate) / scenario.positivityRate);
    const score = Math.min(Math.max(rawScore, 0), 100);

    return {
      zipCode: area.zipCode,
      city: area.city,
      state: area.state,
      hospitalId: area.hospitalId,
      hospitalName: hospital.name,
      totalTests: areaTests,
      positiveTests: areaPositives,
      positivityRate,
      trend,
      severity: getSeverity(score),
      score,
      isAffected,
    };
  });
};

export const getZipMetricsByCode = (
  day: number,
  zipCode: string,
): ZipMetrics | undefined =>
  getZipMetrics(day).find((metrics) => metrics.zipCode === zipCode);

/** The first simulation day on which a facility contributed to the signal. */
export const getFirstSignalDay = (hospitalId: HospitalId): SimulationDay | null => {
  const scenario = SCENARIOS.find((item) => item.affectedHospitals.includes(hospitalId));
  return scenario ? scenario.day : null;
};

/** Everything a single hospital tab needs for the given day. */
export const getHospitalMetrics = (hospital: Hospital, day: number): HospitalMetrics => {
  const scenario = getScenario(day);
  const totalTests = splitTestsByHospital(scenario.totalTests)[hospital.id];
  const positiveTests = splitPositivesByHospital(day)[hospital.id];
  const zipMetrics = getZipMetrics(day).find((item) => item.hospitalId === hospital.id);
  const daysSoFar = SCENARIOS.filter((item) => item.day <= day);

  return {
    hospital,
    totalTests,
    positiveTests,
    positivityRate: totalTests === 0 ? 0 : (positiveTests / totalTests) * 100,
    firstSignalDay: getFirstSignalDay(hospital.id),
    isAffected: scenario.affectedHospitals.includes(hospital.id),
    severity: zipMetrics ? zipMetrics.severity : 'Low',
    observations: getVisibleObservations(day)
      .filter((observation) => observation.hospitalId === hospital.id)
      .sort((a, b) => b.effectiveDateTime.localeCompare(a.effectiveDateTime)),
    volumeSeries: daysSoFar.map((item) => ({
      day: item.day,
      tests: splitTestsByHospital(item.totalTests)[hospital.id],
    })),
    positivitySeries: daysSoFar.map((item) => {
      const dayTests = splitTestsByHospital(item.totalTests)[hospital.id];
      const dayPositives = splitPositivesByHospital(item.day)[hospital.id];
      return {
        day: item.day,
        positivity:
          dayTests === 0 ? 0 : Number(((dayPositives / dayTests) * 100).toFixed(1)),
      };
    }),
  };
};

export const getAllHospitalMetrics = (day: number): HospitalMetrics[] =>
  HOSPITALS.map((hospital) => getHospitalMetrics(hospital, day));

/** Observations visible on the given day, newest first. */
export const getObservationFeed = (day: number): LabObservation[] =>
  [...getVisibleObservations(day)].sort((a, b) =>
    b.effectiveDateTime.localeCompare(a.effectiveDateTime),
  );
