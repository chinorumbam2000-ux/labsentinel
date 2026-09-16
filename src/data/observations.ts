/**
 * The 25 deterministic synthetic FHIR-style Observation records.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 * Patient identifiers SYN-P001 .. SYN-P025 are placeholder strings. They are
 * not derived from, and cannot be linked to, any real person. No PHI exists
 * anywhere in this prototype.
 */
import type { LabObservation, HospitalId, ObservationResult, SimulationDay } from '../types';
import { HOSPITAL_BY_ID } from './hospitals';
import { SYNDROME, TEST_BY_SHORT_NAME } from './tests';

/** Day 1 of the simulation. Fixed so timestamps never change between runs. */
export const SIMULATION_START_DATE = '2025-11-03';

/**
 * Five fixed collection times per simulated day. Each day contains exactly
 * five observations, so slot N always maps to the same clock time.
 */
const DAILY_TIME_SLOTS = ['08:12', '09:47', '11:23', '13:36', '15:58'] as const;

interface ObservationSeed {
  day: SimulationDay;
  hospitalId: HospitalId;
  test: 'Influenza A' | 'SARS-CoV-2' | 'RSV';
  result: ObservationResult;
}

/** Distribution specified by the blueprint, in order OBS-001 .. OBS-025. */
const OBSERVATION_SEEDS: ObservationSeed[] = [
  // Day 1 — Baseline
  { day: 1, hospitalId: 'HOSP-A', test: 'SARS-CoV-2', result: 'Negative' },
  { day: 1, hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Negative' },
  { day: 1, hospitalId: 'HOSP-B', test: 'SARS-CoV-2', result: 'Negative' },
  { day: 1, hospitalId: 'HOSP-B', test: 'RSV', result: 'Negative' },
  { day: 1, hospitalId: 'HOSP-C', test: 'Influenza A', result: 'Negative' },
  // Day 2 — Early Local Increase
  { day: 2, hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Positive' },
  { day: 2, hospitalId: 'HOSP-A', test: 'SARS-CoV-2', result: 'Negative' },
  { day: 2, hospitalId: 'HOSP-B', test: 'Influenza A', result: 'Negative' },
  { day: 2, hospitalId: 'HOSP-B', test: 'RSV', result: 'Negative' },
  { day: 2, hospitalId: 'HOSP-C', test: 'SARS-CoV-2', result: 'Negative' },
  // Day 3 — Rising Positivity
  { day: 3, hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Positive' },
  { day: 3, hospitalId: 'HOSP-B', test: 'SARS-CoV-2', result: 'Positive' },
  { day: 3, hospitalId: 'HOSP-A', test: 'RSV', result: 'Negative' },
  { day: 3, hospitalId: 'HOSP-B', test: 'Influenza A', result: 'Negative' },
  { day: 3, hospitalId: 'HOSP-C', test: 'RSV', result: 'Negative' },
  // Day 4 — Multi-Site Cluster
  { day: 4, hospitalId: 'HOSP-A', test: 'SARS-CoV-2', result: 'Positive' },
  { day: 4, hospitalId: 'HOSP-B', test: 'Influenza A', result: 'Positive' },
  { day: 4, hospitalId: 'HOSP-C', test: 'RSV', result: 'Positive' },
  { day: 4, hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Negative' },
  { day: 4, hospitalId: 'HOSP-B', test: 'SARS-CoV-2', result: 'Negative' },
  // Day 5 — Regional Early-Warning Signal
  { day: 5, hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Positive' },
  { day: 5, hospitalId: 'HOSP-B', test: 'SARS-CoV-2', result: 'Positive' },
  { day: 5, hospitalId: 'HOSP-C', test: 'RSV', result: 'Positive' },
  { day: 5, hospitalId: 'HOSP-A', test: 'SARS-CoV-2', result: 'Positive' },
  { day: 5, hospitalId: 'HOSP-C', test: 'Influenza A', result: 'Negative' },
];

const pad3 = (value: number): string => String(value).padStart(3, '0');

/** Day N date, derived from the fixed start date without any timezone drift. */
export const dayToDateString = (day: number): string => {
  const [year, month, date] = SIMULATION_START_DATE.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, date));
  base.setUTCDate(base.getUTCDate() + (day - 1));
  return base.toISOString().slice(0, 10);
};

const buildObservation = (seed: ObservationSeed, index: number): LabObservation => {
  const hospital = HOSPITAL_BY_ID[seed.hospitalId];
  const test = TEST_BY_SHORT_NAME[seed.test];
  const slot = DAILY_TIME_SLOTS[index % DAILY_TIME_SLOTS.length];

  return {
    resourceType: 'Observation',
    id: `OBS-${pad3(index + 1)}`,
    status: 'final',
    day: seed.day,
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    vendor: hospital.vendor,
    syndrome: SYNDROME,
    testName: test.name,
    loincCode: test.loincCode,
    result: seed.result,
    effectiveDateTime: `${dayToDateString(seed.day)}T${slot}:00`,
    zipCode: hospital.zipCode,
    county: hospital.county,
    state: hospital.state,
    patientId: `SYN-P${pad3(index + 1)}`,
    fhirStatus: 'Received',
    normalized: true,
  };
};

export const OBSERVATIONS: LabObservation[] = OBSERVATION_SEEDS.map(buildObservation);

/** Every observation recorded on or before the given simulation day. */
export const getVisibleObservations = (day: number): LabObservation[] =>
  OBSERVATIONS.filter((observation) => observation.day <= day);

/** Observations recorded on exactly the given simulation day. */
export const getObservationsForDay = (day: number): LabObservation[] =>
  OBSERVATIONS.filter((observation) => observation.day === day);
