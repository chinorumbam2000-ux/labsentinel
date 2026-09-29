/**
 * Full-stack parity: LocalDataSource versus ApiDataSource against a RUNNING
 * LabSentinel API (FastAPI + PostgreSQL, seeded).
 *
 *   npx vite-node scripts/verify-api-parity.ts [--base http://127.0.0.1:8000]
 *   npx vite-node scripts/verify-api-parity.ts --record
 *
 * Compares facilities, every simulated day (stage, tests, positives,
 * positivity, affected facilities and areas, persistence, composite score,
 * severity, Data Confidence), per-day summaries and current signals, single
 * observations, and a set of Laboratory Data queries. Exits non-zero on any
 * difference.
 *
 * --record also saves every API response it received, so the unit tests can
 * replay them without a backend (src/data-access/__tests__/fixtures).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApiDataSource } from '../src/data-access/apiDataSource';
import { DEFAULT_API_BASE_URL } from '../src/data-access/config';
import { createLocalDataSource } from '../src/data-access/localDataSource';
import { compareDataSources } from '../src/data-access/parity';

const RECORDING = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/data-access/__tests__/fixtures/api-recording.json',
);

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const baseUrl = (baseIndex >= 0 ? args[baseIndex + 1] : DEFAULT_API_BASE_URL).replace(/\/+$/, '');
const record = args.includes('--record');

const recorded: Record<string, unknown> = {};
const recordingFetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, init);
  if (record && response.ok) {
    const body = await response.clone().json();
    recorded[input.slice(baseUrl.length)] = body;
  }
  return response;
};

const main = async () => {
  console.log(`Comparing LocalDataSource with ApiDataSource at ${baseUrl}`);
  const problems = await compareDataSources(
    createLocalDataSource(),
    createApiDataSource(baseUrl, recordingFetch),
  );

  if (record) {
    const sorted = Object.fromEntries(Object.entries(recorded).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(RECORDING, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
    console.log(`Recorded ${Object.keys(sorted).length} API responses to ${RECORDING}`);
  }

  if (problems.length > 0) {
    console.error(`FAIL: ${problems.length} difference(s):`);
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }
  console.log(
    'PASS: facilities, Days 1-5 (history, summaries, current signals), single observations ' +
      'and every Laboratory Data query are identical in both modes.',
  );
};

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
