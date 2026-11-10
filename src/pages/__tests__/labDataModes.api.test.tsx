// @vitest-environment jsdom
/**
 * Laboratory Data in the full-stack (API) build: Scenario Replay reads the
 * replay API; Live Surveillance shows the in-browser live feed and never asks
 * the replay API about a live day (which it would reject with 422, as the real
 * backend's Day 1–5 validation does here).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { MODE_STORAGE_KEY } from '../../context/LiveSurveillanceContext';
import { chooseScenarioReplayForTest, signInForTest } from './signedIn';
import recording from '../../data-access/__tests__/fixtures/api-recording.json';

vi.mock('../../data-access/config', async (original) => ({
  ...(await original<typeof import('../../data-access/config')>()),
  BUILD_CONFIG: { ok: true, config: { mode: 'api', apiBaseUrl: 'http://api.test' } },
}));
vi.mock('../../components/map/OutbreakMap', () => ({
  default: () => <div data-testid="outbreak-map" />,
}));

const RECORDED = recording as Record<string, unknown>;
const BASE = 'http://api.test';
let calls: string[] = [];
let rejected: string[] = [];

beforeEach(() => {
  calls = [];
  rejected = [];
  vi.stubGlobal('fetch', async (input: string) => {
    const path = String(input).slice(BASE.length);
    calls.push(path);
    // The backend's validation: replay days are 1–5 (ObservationFilters, le=LAST_DAY).
    const day = [...path.matchAll(/[?&](?:day|through_day)=(\d+)/g)].map((m) => Number(m[1]));
    if (path.startsWith('/api/observations') && day.some((d) => d < 1 || d > 5)) {
      rejected.push(path);
      return new Response(JSON.stringify({ detail: [{ type: 'less_than_equal', msg: 'Input should be less than or equal to 5' }] }), { status: 422 });
    }
    if (path in RECORDED) return new Response(JSON.stringify(RECORDED[path]), { status: 200 });
    if (path === '/api/health' || path === '/api/health/database') return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
    return new Response(JSON.stringify({ detail: 'not recorded' }), { status: 404 });
  });
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.sessionStorage.clear();
  signInForTest();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
const WAIT = { timeout: 8000 };
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const observationCalls = () => calls.filter((c) => c.startsWith('/api/observations'));
const totalOf = () => {
  const title = screen.getAllByText(/ of [\d,]+ observations$/)[0].textContent ?? '';
  return Number(title.split(' of ')[0].replace(/,/g, ''));
};
const rowTests = () => {
  const table = screen.getAllByRole('table').find((t) => within(t).queryByRole('columnheader', { name: /Patient ID/ })) as HTMLElement;
  const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent ?? '');
  const testCol = heads.findIndex((h) => h.startsWith('Test'));
  const dateCol = heads.findIndex((h) => h.startsWith('Date'));
  const rows = within(table).getAllByRole('row').slice(1);
  return rows.map((row) => {
    const cells = within(row).getAllByRole('cell');
    return { test: cells[testCol]?.textContent ?? '', when: cells[dateCol]?.textContent ?? '', key: row.textContent ?? '' };
  });
};

describe('Live Surveillance Laboratory Data (API build)', () => {
  it('shows the in-browser live feed and asks the replay API nothing about a live day — no 422', { timeout: 30000 }, async () => {
    expect(window.sessionStorage.getItem(MODE_STORAGE_KEY)).toBeNull(); // Live is the default
    renderAt('/laboratory-data');
    await screen.findByRole('heading', { level: 1, name: /Laboratory Observations/ }, WAIT);
    await waitFor(() => expect(totalOf()).toBeGreaterThan(0), WAIT);
    await settle();
    expect(screen.getByTestId('lab-profile-note').textContent).toMatch(/^Live Surveillance: Respiratory Viral Activity results received from the simulated feeds/);
    // Live dates (the live feed's own calendar), not replay days.
    expect(rowTests().every((r) => /^Feb \d+/.test(r.when))).toBe(true);
    const dayFilter = screen.getByLabelText('Day') as HTMLSelectElement;
    expect([...dayFilter.options].slice(1).every((o) => /^Feb \d+$/.test(o.textContent ?? ''))).toBe(true);
    expect(observationCalls()).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('filters by profile — aggregate and each pathogen — with no row counted twice', { timeout: 40000 }, async () => {
    const totals: Record<string, number> = {};
    for (const [profile, tests] of [
      ['', ['Influenza A RNA', 'RSV RNA', 'SARS-CoV-2 RNA']],
      ['influenza-a', ['Influenza A RNA']],
      ['covid-19', ['SARS-CoV-2 RNA']],
      ['rsv', ['RSV RNA']],
    ] as const) {
      const view = renderAt(`/laboratory-data${profile ? `?profile=${profile}` : ''}`);
      await screen.findByRole('heading', { level: 1, name: /Laboratory Observations/ }, WAIT);
      await waitFor(() => expect(totalOf()).toBeGreaterThan(0), WAIT);
      const rows = rowTests();
      expect(new Set(rows.map((r) => r.test)).size, profile).toBeGreaterThan(0);
      for (const row of rows) expect(tests as readonly string[], profile).toContain(row.test);
      expect(new Set(rows.map((r) => r.key)).size, `${profile}: unique rows`).toBe(rows.length);
      totals[profile || 'aggregate'] = totalOf();
      view.unmount();
    }
    // Each observation appears once in the aggregate view, not once per profile it belongs to.
    expect(totals.aggregate).toBe(totals['influenza-a'] + totals['covid-19'] + totals.rsv);
    expect(observationCalls()).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('keeps the filters working on live records (facility, result, test)', { timeout: 20000 }, async () => {
    renderAt('/laboratory-data');
    await screen.findByRole('heading', { level: 1, name: /Laboratory Observations/ }, WAIT);
    await waitFor(() => expect(totalOf()).toBeGreaterThan(0), WAIT);
    const all = totalOf();
    fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'Positive' } });
    await waitFor(() => expect(totalOf()).toBeLessThan(all));
    fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Test'), { target: { value: 'RSV RNA' } });
    await waitFor(() => expect(rowTests().every((r) => r.test === 'RSV RNA')).toBe(true));
    fireEvent.change(screen.getByLabelText('Test'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Facility'), { target: { value: 'HOSP-B' } });
    await waitFor(() => expect(totalOf()).toBeLessThan(all));
    expect(observationCalls()).toEqual([]);
  });

  it('Cholera is not in the live feeds: nothing is fabricated and nothing is requested', async () => {
    renderAt('/laboratory-data?profile=cholera');
    await screen.findByRole('heading', { level: 1, name: /Laboratory Observations/ }, WAIT);
    expect(screen.getByTestId('lab-profile-note').textContent).toBe('Cholera is not part of the simulated live feeds.');
    await settle();
    expect(observationCalls()).toEqual([]);
  });
});

describe('Scenario Replay Laboratory Data (API build)', () => {
  it('reads the replay API, with replay Day 1–5 values only', { timeout: 20000 }, async () => {
    chooseScenarioReplayForTest();
    renderAt('/laboratory-data');
    await screen.findByRole('heading', { level: 1, name: /Laboratory Observations/ }, WAIT);
    await waitFor(() => expect(totalOf()).toBeGreaterThan(0), WAIT);
    expect(observationCalls().length).toBeGreaterThan(0);
    expect(observationCalls()).toContain('/api/observations?through_day=1&sort=effective_datetime&order=desc&limit=10&offset=0');
    for (const call of observationCalls()) {
      for (const m of call.matchAll(/[?&](?:day|through_day)=(\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(5);
    }
    expect(rejected).toEqual([]);
    const dayFilter = screen.getByLabelText('Day') as HTMLSelectElement;
    expect([...dayFilter.options].slice(1).map((o) => o.textContent)).toEqual(['Day 1']);
  });
});
