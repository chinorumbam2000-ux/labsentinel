/**
 * Pure day-driven derivations. Every page reads its numbers from here, and
 * every number here comes from the authoritative dataset, so no two screens
 * can disagree about the same simulated day.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  Hospital,
  HospitalId,
  HospitalMetrics,
  SimulationDay,
  ZipMetrics,
} from '../types';
import { HOSPITALS, HOSPITAL_BY_ID } from '../data/hospitals';
import {
  getObservationsForDay,
  getObservationsForSiteDay,
  getVisibleObservations,
} from '../data/observations';
import { SCENARIOS, getScenario } from '../data/simulation';
import {
  SIMULATION_DAYS,
  getCumulativeRegionalCounts,
  getCumulativeSiteCounts,
  getFirstSignalDay as datasetFirstSignalDay,
  getSiteCounts,
  positivityOf,
} from '../data/dataset';
import { ZIP_AREAS } from '../data/zipAreas';
import { getSeverity, scoreScenario } from './signalScore';

/** Cumulative regional counts from Day 1 through the given day. */
export const getCumulativeTotals = (day: number) => getCumulativeRegionalCounts(day);

/** Composite score for a given simulation day. Always calculated, never stored. */
export const getScoreForDay = (day: number) => scoreScenario(getScenario(day));

/**
 * The first day on or before `throughDay` on which a facility signalled.
 * Returns null while the facility has not yet signalled, so a future
 * first-signal day is never revealed.
 */
export const getFirstSignalDay = (
  hospitalId: HospitalId,
  throughDay: number,
): SimulationDay | null => datasetFirstSignalDay(hospitalId, throughDay);

/** Metrics for every surveillance area on the given day. */
export const getZipMetrics = (day: number): ZipMetrics[] => {
  const scenario = getScenario(day);
  const regional = getScoreForDay(day);
  const previousDay = day > 1 ? day - 1 : null;

  return ZIP_AREAS.map((area) => {
    const hospital = HOSPITAL_BY_ID[area.hospitalId];
    const counts = getSiteCounts(day, area.hospitalId);
    const positivityRate = positivityOf(counts);
    const isAffected = scenario.affectedZipCodes.includes(area.zipCode);

    let trend: ZipMetrics['trend'] = 'Baseline';
    if (previousDay) {
      const previousRate = positivityOf(getSiteCounts(previousDay, area.hospitalId));
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

    const cumulative = getCumulativeSiteCounts(day, area.hospitalId);

    return {
      zipCode: area.zipCode,
      city: area.city,
      state: area.state,
      hospitalId: area.hospitalId,
      hospitalName: hospital.name,
      totalTests: counts.tests,
      positiveTests: counts.positives,
      positivityRate,
      cumulativeTests: cumulative.tests,
      cumulativePositives: cumulative.positives,
      trend,
      severity: getSeverity(score),
      score,
      isAffected,
    };
  });
};

/** Everything a single hospital tab needs for the given day. */
export const getHospitalMetrics = (hospital: Hospital, day: number): HospitalMetrics => {
  const scenario = getScenario(day);
  const counts = getSiteCounts(day, hospital.id);
  const cumulative = getCumulativeSiteCounts(day, hospital.id);
  const zipMetrics = getZipMetrics(day).find((item) => item.hospitalId === hospital.id);
  const daysSoFar = SIMULATION_DAYS.filter((item) => item <= day);

  return {
    hospital,
    totalTests: counts.tests,
    positiveTests: counts.positives,
    positivityRate: positivityOf(counts),
    cumulativeTests: cumulative.tests,
    cumulativePositives: cumulative.positives,
    cumulativePositivityRate: positivityOf(cumulative),
    firstSignalDay: getFirstSignalDay(hospital.id, day),
    isAffected: scenario.affectedHospitals.includes(hospital.id),
    severity: zipMetrics ? zipMetrics.severity : 'Low',
    dayObservations: getObservationsForSiteDay(day, hospital.id).sort((a, b) =>
      b.effectiveDateTime.localeCompare(a.effectiveDateTime),
    ),
    observations: getVisibleObservations(day)
      .filter((observation) => observation.hospitalId === hospital.id)
      .sort((a, b) => b.effectiveDateTime.localeCompare(a.effectiveDateTime)),
    volumeSeries: daysSoFar.map((item) => ({
      day: item,
      tests: getSiteCounts(item, hospital.id).tests,
    })),
    positivitySeries: daysSoFar.map((item) => ({
      day: item,
      positivity: Number(positivityOf(getSiteCounts(item, hospital.id)).toFixed(1)),
    })),
  };
};

export const getAllHospitalMetrics = (day: number): HospitalMetrics[] =>
  HOSPITALS.map((hospital) => getHospitalMetrics(hospital, day));

/** Observation counts for the current day and cumulatively, for labelling. */
export const getObservationCounts = (day: number) => ({
  day: getObservationsForDay(day).length,
  cumulative: getVisibleObservations(day).length,
});

export { SCENARIOS };
