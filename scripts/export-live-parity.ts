/**
 * Writes the Live Surveillance parity fixture (browser engine results) that
 * the backend parity test checks its own engine against.
 *
 *   npx vite-node scripts/export-live-parity.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildParityFixture } from '../src/lib/live/parity';

const target = resolve('backend/tests/fixtures/live_parity.json');
const fixture = buildParityFixture();
writeFileSync(target, `${JSON.stringify(fixture)}\n`, 'utf-8');
console.log(`Wrote ${fixture.results.length} results and ${Object.keys(fixture.signals).length} profiles to ${target}`);
