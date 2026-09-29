/**
 * Exports the React prototype's synthetic dataset for the backend seed.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 *
 * Nothing here computes a value of its own. Every field is read from the
 * frontend modules the running prototype uses (src/data, src/lib), so the
 * backend seed cannot drift from what the dashboard shows. Scores are taken
 * from the prototype's own scorer; they are not recalculated.
 *
 *   npx vite-node scripts/export-demo-dataset.ts            write the fixture
 *   npx vite-node scripts/export-demo-dataset.ts --check    fail if it is stale
 *   npx vite-node scripts/export-demo-dataset.ts --stdout   print, write nothing
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AFFECTED_MARGIN_POINTS,
  BASELINE_POSITIVITY_RATE,
  BASELINE_TEST_VOLUME,
} from '../src/data/dataset';
import { ACTIVE_HIERARCHY } from '../src/data/geography';
import { HOSPITALS } from '../src/data/hospitals';
import { OBSERVATIONS } from '../src/data/observations';
import { SCENARIOS, SIMULATION_START_DATE } from '../src/data/simulation';
import { LAB_TESTS, SYNDROME } from '../src/data/tests';
import { getDataConfidence } from '../src/lib/dataConfidence';
import { scoreScenario } from '../src/lib/signalScore';

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../backend/app/seed/data/labsentinel_demo_dataset.json',
);

const dataset = {
  description:
    'LabSentinel synthetic capstone demonstration data, exported from the React prototype (src/data, src/lib). Synthetic only; no real patients, facilities or laboratory results.',
  generator: 'scripts/export-demo-dataset.ts',
  syndrome: SYNDROME,
  simulationStartDate: SIMULATION_START_DATE,
  countryCode: ACTIVE_HIERARCHY.countryCode,
  baseline: {
    testVolume: BASELINE_TEST_VOLUME,
    positivityRate: BASELINE_POSITIVITY_RATE,
    affectedMarginPoints: AFFECTED_MARGIN_POINTS,
  },
  facilities: HOSPITALS.map((hospital) => ({
    code: hospital.id,
    name: hospital.name,
    vendor: hospital.vendor,
    environmentLabel: hospital.environmentLabel,
    city: hospital.city,
    county: hospital.county,
    state: hospital.state,
    zipCode: hospital.zipCode,
  })),
  labTests: LAB_TESTS.map((test) => ({
    name: test.name,
    shortName: test.shortName,
    loincCode: test.loincCode,
    specimen: test.specimen,
  })),
  days: SCENARIOS.map((scenario) => {
    const score = scoreScenario(scenario);
    const confidence = getDataConfidence(scenario.day);
    return {
      day: scenario.day,
      stage: scenario.stage,
      description: scenario.description,
      simulationDate: scenario.simulationDate,
      totalTests: scenario.totalTests,
      totalPositives: scenario.totalPositives,
      // Unrounded, exactly as the prototype holds it.
      positivityRate: scenario.positivityRate,
      affectedFacilityCodes: scenario.affectedHospitals,
      affectedGeographies: scenario.affectedZipCodes,
      persistenceDays: scenario.persistenceDays,
      compositeScore: score.composite,
      severity: score.severity,
      dataConfidenceScore: confidence.score,
      dataConfidenceLevel: confidence.level,
    };
  }),
  observations: OBSERVATIONS.map((observation) => ({
    id: observation.id,
    day: observation.day,
    facilityCode: observation.hospitalId,
    patientReference: observation.patientId,
    syndrome: observation.syndrome,
    testName: observation.testName,
    loincCode: observation.loincCode,
    result: observation.result,
    // Simulation wall-clock time; the prototype carries no zone offset.
    effectiveDateTime: observation.effectiveDateTime,
    zipCode: observation.zipCode,
    status: observation.status,
  })),
};

const serialized = `${JSON.stringify(dataset, null, 2)}\n`;
const mode = process.argv[2];

if (mode === '--stdout') {
  process.stdout.write(serialized);
} else if (mode === '--check') {
  let current = '';
  try {
    current = readFileSync(FIXTURE, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    // Missing fixture is reported as stale below.
  }
  if (current !== serialized) {
    console.error(
      'Backend seed fixture is out of date with the frontend dataset.\n' +
        'Regenerate it with: npx vite-node scripts/export-demo-dataset.ts',
    );
    process.exit(1);
  }
  console.log(
    `Backend seed fixture matches the frontend dataset ` +
      `(${dataset.facilities.length} facilities, ${dataset.observations.length} observations, ` +
      `${dataset.days.length} days).`,
  );
} else {
  writeFileSync(FIXTURE, serialized, 'utf8');
  console.log(`Wrote ${FIXTURE}`);
}
