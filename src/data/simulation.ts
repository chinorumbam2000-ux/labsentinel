/**
 * Five-day simulation narrative and calendar.
 *
 * Only the stage name and description are authored here. Every number —
 * totals, positivity, affected facilities, affected areas, persistence — is
 * derived from the authoritative dataset in `dataset.ts`.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type { SimulationDay, SimulationScenario } from '../types';
import { HOSPITAL_BY_ID } from './hospitals';
import {
  SIMULATION_DAYS,
  getAffectedHospitals,
  getPersistenceDays,
  getRegionalCounts,
} from './dataset';

export {
  BASELINE_TEST_VOLUME,
  BASELINE_POSITIVITY_RATE,
  AFFECTED_MARGIN_POINTS,
} from './dataset';

export const FIRST_DAY: SimulationDay = 1;
export const LAST_DAY: SimulationDay = 5;

/** Auto-play cadence, in milliseconds. */
export const AUTOPLAY_INTERVAL_MS = 3000;

/**
 * The simulation calendar. Observations and alerts are stamped with these
 * dates. They are deliberately distinct from the real session clock, which is
 * shown separately as "session updated" so the two are never confused.
 */
export const SIMULATION_START_DATE = '2025-11-03';

/** Simulation date for a given day, as an ISO date string (no timezone drift). */
export const simulationDateFor = (day: number): string => {
  const [year, month, date] = SIMULATION_START_DATE.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, date));
  base.setUTCDate(base.getUTCDate() + (day - 1));
  return base.toISOString().slice(0, 10);
};

/** Simulation timestamp: a simulation date plus an HH:mm clock time. */
export const simulationTimestamp = (day: number, clock: string): string =>
  `${simulationDateFor(day)}T${clock}:00`;

const NARRATIVE: Record<SimulationDay, { stage: string; description: string }> = {
  1: {
    stage: 'Baseline',
    description:
      'Regional respiratory testing is at expected seasonal volume. Positivity sits at the historical baseline and no participating facility is contributing an elevated signal.',
  },
  2: {
    stage: 'Early Local Increase',
    description:
      'A single participating facility reports a modest rise in respiratory testing volume alongside positivity well above baseline. The signal is isolated to one surveillance area.',
  },
  3: {
    stage: 'Rising Positivity',
    description:
      'Positivity climbs further above baseline while volume continues to increase. A second facility in a neighbouring surveillance area crosses the detection margin, indicating the signal is no longer isolated.',
  },
  4: {
    stage: 'Multi-Site Cluster',
    description:
      'All three participating facilities are now above the detection margin across three distinct surveillance areas. Correlated multi-site activity raises the composite signal into the high range.',
  },
  5: {
    stage: 'Regional Early-Warning Signal',
    description:
      'Elevated volume and positivity have persisted for four consecutive days across the full participating network. LabSentinel raises a regional early-warning signal for epidemiological review.',
  },
};

/** Scenarios are built once from the dataset — they store no independent numbers. */
export const SCENARIOS: SimulationScenario[] = SIMULATION_DAYS.map((day) => {
  const regional = getRegionalCounts(day);
  const affectedHospitals = getAffectedHospitals(day);
  return {
    day,
    stage: NARRATIVE[day].stage,
    description: NARRATIVE[day].description,
    simulationDate: simulationDateFor(day),
    totalTests: regional.tests,
    totalPositives: regional.positives,
    positivityRate: regional.positivityRate,
    affectedHospitals,
    affectedZipCodes: affectedHospitals.map((id) => HOSPITAL_BY_ID[id].zipCode),
    persistenceDays: getPersistenceDays(day),
  };
});

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

/** True only for a finite integer inside the simulation range. */
export const isValidDay = (value: unknown): value is SimulationDay =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= FIRST_DAY &&
  value <= LAST_DAY;
