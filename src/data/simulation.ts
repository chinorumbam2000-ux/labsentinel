/**
 * Five-day aggregate simulation. These aggregates drive every headline metric
 * in the prototype and are the inputs to the composite outbreak signal score.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type { SimulationDay, SimulationScenario } from '../types';

export const BASELINE_TEST_VOLUME = 100;
export const BASELINE_POSITIVITY_RATE = 8.0;

export const FIRST_DAY: SimulationDay = 1;
export const LAST_DAY: SimulationDay = 5;

/** Auto-play cadence, in milliseconds. */
export const AUTOPLAY_INTERVAL_MS = 3000;

export const SCENARIOS: SimulationScenario[] = [
  {
    day: 1,
    stage: 'Baseline',
    description:
      'Regional respiratory testing is at expected seasonal volume. Positivity sits at the historical baseline and no participating facility is contributing an elevated signal.',
    totalTests: 100,
    positivityRate: 8.0,
    affectedHospitals: [],
    affectedZipCodes: [],
    persistenceDays: 0,
  },
  {
    day: 2,
    stage: 'Early Local Increase',
    description:
      'A single participating facility reports a modest rise in respiratory testing volume alongside the first positive result of the surveillance period. The signal is isolated to one surveillance area.',
    totalTests: 124,
    positivityRate: 9.5,
    affectedHospitals: ['HOSP-A'],
    affectedZipCodes: ['01604'],
    persistenceDays: 1,
  },
  {
    day: 3,
    stage: 'Rising Positivity',
    description:
      'Positivity climbs well above baseline while volume continues to increase. A second facility in a neighbouring surveillance area begins contributing positives, indicating the signal is no longer isolated.',
    totalTests: 141,
    positivityRate: 13.2,
    affectedHospitals: ['HOSP-A', 'HOSP-B'],
    affectedZipCodes: ['01604', '01605'],
    persistenceDays: 2,
  },
  {
    day: 4,
    stage: 'Multi-Site Cluster',
    description:
      'All three participating facilities are now reporting positives across three distinct surveillance areas. Correlated multi-site activity raises the composite signal into the high range.',
    totalTests: 158,
    positivityRate: 16.4,
    affectedHospitals: ['HOSP-A', 'HOSP-B', 'HOSP-C'],
    affectedZipCodes: ['01604', '01605', '01545'],
    persistenceDays: 3,
  },
  {
    day: 5,
    stage: 'Regional Early-Warning Signal',
    description:
      'Elevated volume and positivity have persisted for four consecutive days across the full participating network. LabSentinel raises a regional early-warning signal for epidemiological review.',
    totalTests: 176,
    positivityRate: 19.1,
    affectedHospitals: ['HOSP-A', 'HOSP-B', 'HOSP-C'],
    affectedZipCodes: ['01604', '01605', '01545'],
    persistenceDays: 4,
  },
];

export const getScenario = (day: number): SimulationScenario => {
  const scenario = SCENARIOS.find((item) => item.day === day);
  if (!scenario) {
    throw new Error(`No simulation scenario defined for day ${day}`);
  }
  return scenario;
};

/** Clamp any value into the valid 1..5 simulation range. */
export const clampDay = (day: number): SimulationDay => {
  const bounded = Math.min(Math.max(Math.round(day), FIRST_DAY), LAST_DAY);
  return bounded as SimulationDay;
};
