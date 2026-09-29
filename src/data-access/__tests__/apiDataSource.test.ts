import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from '../apiClient';
import { createApiDataSource } from '../apiDataSource';
import type { ObservationQuery } from '../../types';
import { BASE_URL, json, recorded, replayFetch } from './helpers';

const query = (overrides: Partial<ObservationQuery> = {}): ObservationQuery => ({
  currentDay: 5,
  scope: 'cumulative',
  search: '',
  vendor: 'all',
  hospitalId: 'all',
  result: 'all',
  testName: 'all',
  day: 'all',
  sortKey: 'effectiveDateTime',
  sortDirection: 'desc',
  page: 1,
  pageSize: 10,
  ...overrides,
});

const sourceWith = (overrides: Parameters<typeof replayFetch>[0] = {}) => {
  const replay = replayFetch(overrides);
  return { source: createApiDataSource(BASE_URL, replay.fetchImpl), calls: replay.calls };
};

const expectApiError = async (promise: Promise<unknown>, kind: ApiError['kind']) => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).kind).toBe(kind);
  return error as ApiError;
};

describe('ApiDataSource (API capstone mode, mocked HTTP)', () => {
  it('maps facilities from /api/facilities into frontend domain objects', async () => {
    const { source, calls } = sourceWith();
    const facilities = await source.getFacilities();
    expect(calls).toEqual(['/api/facilities']);
    expect(facilities[0]).toEqual({
      id: 'HOSP-A',
      name: 'Worcester Central Medical Center',
      vendor: 'Epic',
      zipCode: '01604',
      city: 'Worcester',
      county: 'Worcester County',
      state: 'MA',
      environmentLabel: 'Simulated Epic Environment',
    });
    // Loaded once and reused.
    await source.getFacilities();
    expect(calls).toEqual(['/api/facilities']);
  });

  it('asks the server for one filtered, sorted page of observations', async () => {
    const { source, calls } = sourceWith();
    const page = await source.getObservations(query({ hospitalId: 'HOSP-B' }));
    expect(page.rows).toHaveLength(10);
    expect(new Set(page.rows.map((row) => row.hospitalId))).toEqual(new Set(['HOSP-B']));
    expect(page.rows[0].effectiveDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect([page.total, page.dayCount, page.cumulativeCount]).toEqual([238, 176, 699]);
    expect(calls).toContain(
      '/api/observations?through_day=5&facility_id=2&sort=effective_datetime&order=desc&limit=10&offset=0',
    );
    // Never the whole dataset.
    expect(calls.every((call) => !call.includes('limit=699'))).toBe(true);
  });

  it('returns signals and demo summaries with the persisted values', async () => {
    const { source } = sourceWith();
    const days = await source.getSignals();
    expect(days.map((d) => [d.scenario.stage, d.compositeScore, d.severity])).toEqual([
      ['Baseline', 0, 'Low'],
      ['Early Local Increase', 24, 'Watch'],
      ['Rising Positivity', 50, 'Moderate'],
      ['Multi-Site Cluster', 74, 'High'],
      ['Regional Early-Warning Signal', 87, 'Critical'],
    ]);
    const day5 = await source.getDemoSummary(5);
    expect(day5.scenario.affectedHospitals).toEqual(['HOSP-A', 'HOSP-B', 'HOSP-C']);
    expect(day5.dataConfidenceScore).toBe(97);
    expect((await source.getCurrentSignal(1)).compositeScore).toBe(0);
  });

  it('reports an unreachable API as a network error', async () => {
    const source = createApiDataSource(BASE_URL, async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await expectApiError(source.getFacilities(), 'network');
    expect(error.message).toContain(BASE_URL);
  });

  it('reports HTTP failures with their status', async () => {
    const { source } = sourceWith({ '/api/facilities': () => json({ detail: 'boom' }, 500) });
    const error = await expectApiError(source.getFacilities(), 'http');
    expect(error.status).toBe(500);
  });

  it('forgets a failed facilities load so a retry starts clean', async () => {
    let fail = true;
    const { source } = sourceWith({
      '/api/facilities': () => (fail ? json({}, 503) : json(recorded('/api/facilities'))),
    });
    await expectApiError(source.getFacilities(), 'http');
    fail = false;
    expect(await source.getFacilities()).toHaveLength(3);
  });

  it('does not let one cancelled caller cancel the shared facilities load', async () => {
    // React StrictMode mounts, cancels and remounts effects: the remount must
    // still receive facilities even though the first mount's signal aborted.
    const replay = replayFetch();
    const source = createApiDataSource(BASE_URL, async (url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return replay.fetchImpl(url, init);
    });
    const first = new AbortController();
    const firstCall = source.getFacilities(first.signal).catch(() => 'cancelled');
    first.abort();
    expect(await source.getFacilities(new AbortController().signal)).toHaveLength(3);
    await firstCall;
  });

  it('rejects a response without the documented shape', async () => {
    const facilities = recorded<Array<Record<string, unknown>>>('/api/facilities');
    delete facilities[0].vendor;
    const { source } = sourceWith({ '/api/facilities': () => json(facilities) });
    await expectApiError(source.getFacilities(), 'invalid-response');
  });

  it('rejects a body that is not JSON', async () => {
    const { source } = sourceWith({
      '/api/facilities': () => new Response('<html>proxy error</html>', { status: 200 }),
    });
    await expectApiError(source.getFacilities(), 'invalid-response');
  });

  it('rejects a positivity that does not match its own counts', async () => {
    const summary = recorded<Record<string, unknown>>('/api/demo/summary?day=5');
    summary.positivity_rate = 25;
    const { source } = sourceWith({ '/api/demo/summary?day=5': () => json(summary) });
    await expectApiError(source.getDemoSummary(5), 'invalid-response');
  });

  it('rejects an affected-facility count that does not match the affected areas', async () => {
    const summary = recorded<Record<string, unknown>>('/api/demo/summary?day=2');
    summary.affected_facilities = 2;
    const { source } = sourceWith({ '/api/demo/summary?day=2': () => json(summary) });
    await expectApiError(source.getDemoSummary(2), 'invalid-response');
  });

  it('rejects an unknown severity', async () => {
    const summary = recorded<Record<string, unknown>>('/api/demo/summary?day=1');
    summary.severity = 'Severe';
    const { source } = sourceWith({ '/api/demo/summary?day=1': () => json(summary) });
    await expectApiError(source.getDemoSummary(1), 'invalid-response');
  });

  it('checks health: connected, database down, and unreachable', async () => {
    const up = sourceWith({
      '/api/health': () => json({ status: 'healthy' }),
      '/api/health/database': () => json({ status: 'healthy', database: 'connected' }),
    });
    expect(await up.source.checkHealth()).toMatchObject({ api: 'connected', database: 'connected' });

    const dbDown = sourceWith({
      '/api/health': () => json({ status: 'healthy' }),
      '/api/health/database': () => json({ status: 'unhealthy', database: 'unavailable' }, 503),
    });
    expect(await dbDown.source.checkHealth()).toMatchObject({ api: 'connected', database: 'unavailable' });

    const down = createApiDataSource(BASE_URL, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await down.checkHealth()).toMatchObject({ api: 'unavailable', database: 'unknown' });
  });
});

describe('API client', () => {
  it('builds URLs, skipping empty parameters', async () => {
    const seen: string[] = [];
    const client = createApiClient('http://h', async (url) => {
      seen.push(url);
      return json({});
    });
    await client.getJson('/api/x', { a: 1, b: undefined, c: '', d: 'two words' });
    expect(seen).toEqual(['http://h/api/x?a=1&d=two+words']);
  });

  it('times out a request that never answers', async () => {
    const client = createApiClient(
      'http://h',
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
      20,
    );
    await expectApiError(client.getJson('/api/slow'), 'timeout');
  });

  it('lets a caller cancel without reporting an API failure', async () => {
    const client = createApiClient('http://h', (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    );
    const controller = new AbortController();
    const pending = client.getJson('/api/x', undefined, controller.signal);
    controller.abort();
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });
});
