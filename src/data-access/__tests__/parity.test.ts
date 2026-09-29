/**
 * LocalDataSource versus ApiDataSource, replaying real responses recorded
 * from the running FastAPI + PostgreSQL backend (scripts/verify-api-parity.ts
 * --record). The same comparison runs live with that script.
 */
import { describe, expect, it } from 'vitest';
import { createApiDataSource } from '../apiDataSource';
import { createLocalDataSource } from '../localDataSource';
import { canonicalJson } from '../canonical';
import { compareDataSources, PARITY_OBSERVATION_QUERIES } from '../parity';
import { BASE_URL, replayFetch } from './helpers';

const api = () => createApiDataSource(BASE_URL, replayFetch().fetchImpl);

describe('local and API data sources produce identical frontend values', () => {
  it('match on facilities, Days 1-5, single observations and every Laboratory Data query', async () => {
    expect(await compareDataSources(createLocalDataSource(), api())).toEqual([]);
  });

  it('match field by field on each day', async () => {
    const local = createLocalDataSource();
    const remote = api();
    for (const day of [1, 2, 3, 4, 5] as const) {
      const [a, b] = [await local.getDemoSummary(day), await remote.getDemoSummary(day)];
      const pick = (d: typeof a) => ({
        day: d.scenario.day,
        stage: d.scenario.stage,
        tests: d.scenario.totalTests,
        positives: d.scenario.totalPositives,
        positivity: d.scenario.positivityRate,
        facilities: d.scenario.affectedHospitals,
        geographies: d.scenario.affectedZipCodes,
        persistence: d.scenario.persistenceDays,
        score: d.compositeScore,
        severity: d.severity,
        confidence: d.dataConfidenceScore,
        confidenceLevel: d.dataConfidenceLevel,
      });
      expect(pick(b)).toEqual(pick(a));
    }
  });

  it('covers every filter, sort key and both sort directions', () => {
    const queries = PARITY_OBSERVATION_QUERIES.map((item) => item.query);
    expect(new Set(queries.map((q) => q.sortKey))).toEqual(
      new Set(['effectiveDateTime', 'hospitalName', 'vendor', 'patientId', 'result', 'testName']),
    );
    expect(new Set(queries.map((q) => q.sortDirection))).toEqual(new Set(['asc', 'desc']));
    expect(queries.some((q) => q.scope === 'today')).toBe(true);
    expect(queries.some((q) => q.hospitalId !== 'all')).toBe(true);
    expect(queries.some((q) => q.vendor !== 'all')).toBe(true);
    expect(queries.some((q) => q.result !== 'all')).toBe(true);
    expect(queries.some((q) => q.testName !== 'all')).toBe(true);
    expect(queries.some((q) => q.day !== 'all')).toBe(true);
    expect(queries.some((q) => q.search.includes(' '))).toBe(true);
  });

  it('would notice a one-unit drift in a persisted score', async () => {
    const replay = replayFetch();
    const drifted = createApiDataSource(BASE_URL, async (url, init) => {
      const response = await replay.fetchImpl(url, init);
      if (!url.endsWith('/api/demo/summary?day=4')) return response;
      const body = await response.json();
      return new Response(JSON.stringify({ ...body, composite_score: 75 }), { status: 200 });
    });
    const local = createLocalDataSource();
    expect(canonicalJson(await drifted.getDemoSummary(4))).not.toBe(
      canonicalJson(await local.getDemoSummary(4)),
    );
  });
});
