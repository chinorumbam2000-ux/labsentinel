/**
 * Deterministic synthetic FHIR-style Observation records.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 *
 * Every test counted in `dataset.ts` has a corresponding Observation record
 * here, so the laboratory table reconciles exactly with the hospital and
 * regional totals shown elsewhere (699 records across the five days). Earlier
 * versions carried only 25 sample records, which could not be reconciled
 * against daily totals in the hundreds.
 *
 * Generation is fully deterministic: no randomness, no dependence on the
 * current time, identical on every render and every reload.
 *
 * Patient identifiers SYN-P0001 .. SYN-P0699 are placeholder strings. They are
 * not derived from, and cannot be linked to, any real person. No PHI exists
 * anywhere in this prototype.
 */
import type {
  HospitalId,
  LabObservation,
  ObservationResult,
  SimulationDay,
} from '../types';
import { HOSPITAL_BY_ID } from './hospitals';
import { LAB_TESTS, SYNDROME, TEST_BY_SHORT_NAME } from './tests';
import { HOSPITAL_IDS, SIMULATION_DAYS, SITE_DAY_COUNTS } from './dataset';
import { simulationDateFor } from './simulation';

export { SIMULATION_START_DATE, simulationDateFor as dayToDateString } from './simulation';

type TestShortName = 'Influenza A' | 'SARS-CoV-2' | 'RSV';

interface SeedRecord {
  hospitalId: HospitalId;
  test: TestShortName;
  result: ObservationResult;
}

/**
 * The 25 representative records named in the blueprint. They are retained
 * verbatim as the first five records of each simulated day; the generator
 * fills the rest of each day's volume around them.
 */
const DAY_SEEDS: Record<SimulationDay, SeedRecord[]> = {
  1: [
    { hospitalId: 'HOSP-A', test: 'SARS-CoV-2', result: 'Negative' },
    { hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Negative' },
    { hospitalId: 'HOSP-B', test: 'SARS-CoV-2', result: 'Negative' },
    { hospitalId: 'HOSP-B', test: 'RSV', result: 'Negative' },
    { hospitalId: 'HOSP-C', test: 'Influenza A', result: 'Negative' },
  ],
  2: [
    { hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Positive' },
    { hospitalId: 'HOSP-A', test: 'SARS-CoV-2', result: 'Negative' },
    { hospitalId: 'HOSP-B', test: 'Influenza A', result: 'Negative' },
    { hospitalId: 'HOSP-B', test: 'RSV', result: 'Negative' },
    { hospitalId: 'HOSP-C', test: 'SARS-CoV-2', result: 'Negative' },
  ],
  3: [
    { hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Positive' },
    { hospitalId: 'HOSP-B', test: 'SARS-CoV-2', result: 'Positive' },
    { hospitalId: 'HOSP-A', test: 'RSV', result: 'Negative' },
    { hospitalId: 'HOSP-B', test: 'Influenza A', result: 'Negative' },
    { hospitalId: 'HOSP-C', test: 'RSV', result: 'Negative' },
  ],
  4: [
    { hospitalId: 'HOSP-A', test: 'SARS-CoV-2', result: 'Positive' },
    { hospitalId: 'HOSP-B', test: 'Influenza A', result: 'Positive' },
    { hospitalId: 'HOSP-C', test: 'RSV', result: 'Positive' },
    { hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Negative' },
    { hospitalId: 'HOSP-B', test: 'SARS-CoV-2', result: 'Negative' },
  ],
  5: [
    { hospitalId: 'HOSP-A', test: 'Influenza A', result: 'Positive' },
    { hospitalId: 'HOSP-B', test: 'SARS-CoV-2', result: 'Positive' },
    { hospitalId: 'HOSP-C', test: 'RSV', result: 'Positive' },
    { hospitalId: 'HOSP-A', test: 'SARS-CoV-2', result: 'Positive' },
    { hospitalId: 'HOSP-C', test: 'Influenza A', result: 'Negative' },
  ],
};

/** Collection window for every simulated day: 06:00 to 20:00. */
const DAY_START_MINUTES = 6 * 60;
const DAY_WINDOW_MINUTES = 14 * 60;

const HOSPITAL_TEST_OFFSET: Record<HospitalId, number> = {
  'HOSP-A': 0,
  'HOSP-B': 1,
  'HOSP-C': 2,
};

const pad = (value: number, width: number): string =>
  String(value).padStart(width, '0');

const clockAt = (index: number, total: number): string => {
  const offset =
    total <= 1 ? 0 : Math.round((index * DAY_WINDOW_MINUTES) / (total - 1));
  const minutes = DAY_START_MINUTES + offset;
  return `${pad(Math.floor(minutes / 60), 2)}:${pad(minutes % 60, 2)}`;
};

/**
 * Spreads `positives` positive results evenly across `total` records without
 * clustering them — the same technique as Bresenham line stepping, so the
 * count is exact and the placement is stable.
 */
const isPositiveAt = (index: number, positives: number, total: number): boolean => {
  if (total <= 0 || positives <= 0) return false;
  return (
    Math.floor(((index + 1) * positives) / total) >
    Math.floor((index * positives) / total)
  );
};

interface DraftRecord {
  hospitalId: HospitalId;
  test: TestShortName;
  result: ObservationResult;
}

/** Builds one day's full record list: seeds first, then round-robin by site. */
const buildDayDrafts = (day: SimulationDay): DraftRecord[] => {
  const seeds = DAY_SEEDS[day];
  const drafts: DraftRecord[] = seeds.map((seed) => ({ ...seed }));

  // Whatever the seeds did not already account for, per site.
  const pools = HOSPITAL_IDS.map((hospitalId) => {
    const counts = SITE_DAY_COUNTS[day][hospitalId];
    const seeded = seeds.filter((seed) => seed.hospitalId === hospitalId);
    const remainingTests = counts.tests - seeded.length;
    const remainingPositives =
      counts.positives - seeded.filter((seed) => seed.result === 'Positive').length;

    if (remainingTests < 0 || remainingPositives < 0 || remainingPositives > remainingTests) {
      throw new Error(
        `Seed records for day ${day} at ${hospitalId} cannot be reconciled with its counts.`,
      );
    }

    const offset = HOSPITAL_TEST_OFFSET[hospitalId];
    const records: DraftRecord[] = Array.from({ length: remainingTests }, (_, index) => ({
      hospitalId,
      test: LAB_TESTS[(index + offset) % LAB_TESTS.length].shortName as TestShortName,
      result: isPositiveAt(index, remainingPositives, remainingTests)
        ? 'Positive'
        : 'Negative',
    }));
    return records;
  });

  // Interleave the sites so the feed reads like a real mixed stream.
  const cursors = pools.map(() => 0);
  let remaining = pools.reduce((sum, pool) => sum + pool.length, 0);
  while (remaining > 0) {
    for (let site = 0; site < pools.length; site += 1) {
      const cursor = cursors[site];
      if (cursor < pools[site].length) {
        drafts.push(pools[site][cursor]);
        cursors[site] += 1;
        remaining -= 1;
      }
    }
  }

  return drafts;
};

const buildAllObservations = (): LabObservation[] => {
  const observations: LabObservation[] = [];
  let sequence = 0;

  SIMULATION_DAYS.forEach((day) => {
    const drafts = buildDayDrafts(day);
    const date = simulationDateFor(day);

    drafts.forEach((draft, index) => {
      sequence += 1;
      const hospital = HOSPITAL_BY_ID[draft.hospitalId];
      const test = TEST_BY_SHORT_NAME[draft.test];

      observations.push({
        resourceType: 'Observation',
        id: `OBS-${pad(sequence, 4)}`,
        status: 'final',
        day,
        hospitalId: hospital.id,
        hospitalName: hospital.name,
        vendor: hospital.vendor,
        syndrome: SYNDROME,
        testName: test.name,
        loincCode: test.loincCode,
        result: draft.result,
        effectiveDateTime: `${date}T${clockAt(index, drafts.length)}:00`,
        zipCode: hospital.zipCode,
        county: hospital.county,
        state: hospital.state,
        patientId: `SYN-P${pad(sequence, 4)}`,
        fhirStatus: 'Received',
        normalized: true,
      });
    });
  });

  return observations;
};

export const OBSERVATIONS: LabObservation[] = buildAllObservations();

/** Every observation recorded on or before the given simulation day. */
export const getVisibleObservations = (day: number): LabObservation[] =>
  OBSERVATIONS.filter((observation) => observation.day <= day);

/** Observations recorded on exactly the given simulation day. */
export const getObservationsForDay = (day: number): LabObservation[] =>
  OBSERVATIONS.filter((observation) => observation.day === day);

/** Observations for one site on one day. */
export const getObservationsForSiteDay = (
  day: number,
  hospitalId: HospitalId,
): LabObservation[] =>
  OBSERVATIONS.filter(
    (observation) => observation.day === day && observation.hospitalId === hospitalId,
  );
