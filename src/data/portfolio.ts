/**
 * Synthetic portfolio results for profiles the five-day replay does not cover.
 *
 * DEMO ENVIRONMENT — Synthetic data only. Labelled as such wherever shown.
 *
 * The narrated replay (dataset.ts, observations.ts) contains respiratory
 * tests only, and it is frozen. These fixtures add two demonstration-coded
 * stool tests on the same calendar, at the same three fictional facilities:
 *
 *   DEMO-GIP  gastrointestinal pathogen panel   -> Gastrointestinal Syndrome
 *   DEMO-VCH  Vibrio cholerae nucleic acid       -> Cholera AND Gastrointestinal Syndrome
 *
 * The codes are demonstration codes, not LOINC, and are not accepted by the
 * FHIR ingestion path. The counts are authored, integer and fixed: no random
 * values, no dependence on the clock. They are shaped to show three states
 * honestly, not to suggest anything about real cholera or gastroenteritis:
 *   - steady panel volume and positivity (Gastrointestinal Syndrome stays
 *     within its expected range);
 *   - no Vibrio cholerae tests on Days 1-2 (Cholera has no data), then a few
 *     tests from Day 3, all negative, with no baseline (insufficient baseline).
 */
import type { HospitalId, LabObservation, ObservationResult, SimulationDay } from '../types';
import { HOSPITAL_BY_ID } from './hospitals';
import { HOSPITAL_IDS, SIMULATION_DAYS, type SiteDayCounts } from './dataset';
import { simulationDateFor } from './simulation';

export type PortfolioTestCode = 'DEMO-GIP' | 'DEMO-VCH';

const site = (tests: number, positives: number): SiteDayCounts => ({ tests, positives });
const NONE = site(0, 0);

export const PORTFOLIO_SITE_DAY_COUNTS: Record<
  PortfolioTestCode,
  Record<SimulationDay, Record<HospitalId, SiteDayCounts>>
> = {
  'DEMO-GIP': {
    1: { 'HOSP-A': site(22, 2), 'HOSP-B': site(18, 1), 'HOSP-C': site(14, 1) },
    2: { 'HOSP-A': site(21, 1), 'HOSP-B': site(19, 1), 'HOSP-C': site(14, 1) },
    3: { 'HOSP-A': site(23, 2), 'HOSP-B': site(18, 1), 'HOSP-C': site(13, 1) },
    4: { 'HOSP-A': site(22, 1), 'HOSP-B': site(19, 1), 'HOSP-C': site(15, 1) },
    5: { 'HOSP-A': site(21, 2), 'HOSP-B': site(18, 1), 'HOSP-C': site(14, 1) },
  },
  'DEMO-VCH': {
    1: { 'HOSP-A': NONE, 'HOSP-B': NONE, 'HOSP-C': NONE },
    2: { 'HOSP-A': NONE, 'HOSP-B': NONE, 'HOSP-C': NONE },
    3: { 'HOSP-A': site(2, 0), 'HOSP-B': site(1, 0), 'HOSP-C': NONE },
    4: { 'HOSP-A': site(1, 0), 'HOSP-B': site(1, 0), 'HOSP-C': site(1, 0) },
    5: { 'HOSP-A': site(2, 0), 'HOSP-B': NONE, 'HOSP-C': site(1, 0) },
  },
};

const TEST_NAMES: Record<PortfolioTestCode, string> = {
  'DEMO-GIP': 'Gastrointestinal pathogen panel (synthetic)',
  'DEMO-VCH': 'Vibrio cholerae nucleic acid (synthetic)',
};

/** lab_observation.syndrome is single-valued; profiles come from the membership instead. */
const PRIMARY_SYNDROME = 'Gastrointestinal Syndrome';

const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** Same evenly-spread placement as the replay generator: exact and stable. */
const isPositiveAt = (index: number, positives: number, total: number): boolean =>
  total > 0 &&
  positives > 0 &&
  Math.floor(((index + 1) * positives) / total) > Math.floor((index * positives) / total);

/** 07:00 to 19:00, spread evenly — distinct from the respiratory feed's clock. */
const clockAt = (index: number, total: number): string => {
  const minutes = 7 * 60 + (total <= 1 ? 0 : Math.round((index * 12 * 60) / (total - 1)));
  return `${pad(Math.floor(minutes / 60), 2)}:${pad(minutes % 60, 2)}`;
};

const buildPortfolioObservations = (): LabObservation[] => {
  const out: LabObservation[] = [];
  let sequence = 0;
  SIMULATION_DAYS.forEach((day) => {
    const drafts: Array<{ hospitalId: HospitalId; code: PortfolioTestCode; result: ObservationResult }> = [];
    (Object.keys(PORTFOLIO_SITE_DAY_COUNTS) as PortfolioTestCode[]).forEach((code) => {
      HOSPITAL_IDS.forEach((hospitalId) => {
        const counts = PORTFOLIO_SITE_DAY_COUNTS[code][day][hospitalId];
        for (let i = 0; i < counts.tests; i += 1) {
          drafts.push({
            hospitalId,
            code,
            result: isPositiveAt(i, counts.positives, counts.tests) ? 'Positive' : 'Negative',
          });
        }
      });
    });
    const date = simulationDateFor(day);
    drafts.forEach((draft, index) => {
      sequence += 1;
      const hospital = HOSPITAL_BY_ID[draft.hospitalId];
      out.push({
        resourceType: 'Observation',
        id: `OBS-P${pad(sequence, 4)}`,
        status: 'final',
        day,
        hospitalId: hospital.id,
        hospitalName: hospital.name,
        vendor: hospital.vendor,
        syndrome: PRIMARY_SYNDROME,
        testName: TEST_NAMES[draft.code],
        loincCode: draft.code,
        result: draft.result,
        effectiveDateTime: `${date}T${clockAt(index, drafts.length)}:00`,
        zipCode: hospital.zipCode,
        county: hospital.county,
        state: hospital.state,
        patientId: `SYN-Q${pad(sequence, 4)}`,
        fhirStatus: 'Received',
        normalized: true,
      });
    });
  });
  return out;
};

/** Deterministic synthetic stool-test results (280 records across the five days). */
export const PORTFOLIO_OBSERVATIONS: LabObservation[] = buildPortfolioObservations();
