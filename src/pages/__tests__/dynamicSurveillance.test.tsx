// @vitest-environment jsdom
/**
 * The Dynamic Surveillance page, rendered from REAL backend responses
 * (fixtures/dynamic-api-recording.json). API mode shows the engine's signals;
 * local mode shows a notice and makes no request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DynamicSurveillancePage from '../DynamicSurveillancePage';
import { DataSourceProvider } from '../../data-access/DataSourceProvider';
import {
  DYNAMIC_DISCLAIMER,
  DYNAMIC_LABEL,
  INSUFFICIENT_BASELINE_TEXT,
} from '../../lib/dynamicSurveillance';
import { dynamicReply, type DynamicOptions } from './fakeDynamicBackend';

const BASE = 'http://api.test';
let calls: string[] = [];

const useBackend = (options: DynamicOptions & { down?: boolean } = {}) => {
  calls = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = String(input).slice(BASE.length);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    if (options.down) throw new TypeError('Failed to fetch');
    if (path === '/api/health') return new Response(JSON.stringify({ status: 'healthy' }));
    if (path === '/api/health/database') return new Response(JSON.stringify({ status: 'healthy', database: 'connected' }));
    return dynamicReply(path, method, options) ?? new Response('{}', { status: 404 });
  });
};

const renderPage = (mode: 'api' | 'local' = 'api') =>
  render(
    <DataSourceProvider configResult={{ ok: true, config: { mode, apiBaseUrl: BASE } }}>
      <MemoryRouter>
        <DynamicSurveillancePage />
      </MemoryRouter>
    </DataSourceProvider>,
  );

/** The overview metric (the first <dt> with that label; the comparison panel repeats "Severity"). */
const metric = (label: string) => screen.getAllByText(label, { selector: 'dt' })[0].nextElementSibling?.textContent;

beforeEach(() => {
  useBackend();
  // jsdom has no ResizeObserver; Recharts' ResponsiveContainer needs one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Dynamic Surveillance — Local Demo Mode', () => {
  it('explains that API mode is required and sends no request', async () => {
    renderPage('local');
    expect(screen.getByText('Dynamic Surveillance requires LabSentinel API Capstone Mode.')).toBeTruthy();
    expect(screen.getByText('DYNAMIC SURVEILLANCE MODE')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.filter((call) => call.includes('/surveillance/'))).toEqual([]);
  });
});

describe('Dynamic Surveillance — API Capstone Mode', () => {
  it('labels the mode and shows the latest dynamic signal', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Why this dynamic signal?' });

    expect(screen.getByText('DYNAMIC SURVEILLANCE MODE')).toBeTruthy();
    expect(screen.getAllByText(new RegExp(DYNAMIC_LABEL.replace('.', '\\.'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(DYNAMIC_DISCLAIMER.slice(0, 60))).length).toBeGreaterThan(0);

    expect(metric('Surveillance date')).toBe('Tue, Jan 20, 2026');
    expect(metric('Current tests')).toBe('106');
    expect(metric('Baseline tests')).toBe('66.1 a day');
    expect(metric('Volume change')).toBe('+60.3%');
    expect(metric('Current positivity')).toBe('37.7%');
    expect(metric('Baseline positivity')).toBe('20.5%');
    expect(metric('Positivity change')).toBe('+17.2 points');
    expect(metric('Affected facilities')).toBe('3 of 3');
    expect(metric('Affected geographic areas')).toBe('3 of 3');
    expect(metric('Persistence')).toBe('6 days');
    expect(metric('Composite Outbreak Signal Score')).toBe('90 / 100');
    expect(metric('Severity')).toBe('Critical');
    expect(metric('Data Confidence')).toMatch(/^\d+ · (Very High|High|Moderate|Low)$/);
  });

  it('explains the signal with the stored components and contributions', async () => {
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Why this dynamic signal' });
    for (const heading of ['What changed?', 'Where is it happening?', 'Which facilities contributed?', 'How long has it persisted?', 'Why did the score reach this severity?']) {
      expect(within(panel).getByText(heading)).toBeTruthy();
    }
    expect(within(panel).getByText(/Testing moved from a baseline of 66\.1 tests a day to 106/)).toBeTruthy();
    expect(within(panel).getByText(/sum to 90\.1, rounded to 90 of 100: the Critical band/)).toBeTruthy();
    const table = within(panel).getByRole('table');
    expect(within(table).getByText('15.1 / 25')).toBeTruthy(); // volume 60.26 x 0.25
    expect(within(table).getByText('30.0 / 30')).toBeTruthy(); // positivity clamped at 100
    expect(within(table).getByText('20.0 / 20')).toBeTruthy();
    expect(within(table).getByText('15.0 / 15')).toBeTruthy();
    expect(within(table).getByText('10.0 / 10')).toBeTruthy();
    expect(within(table).getByText('90 / 100')).toBeTruthy();
    expect(within(table).getByText(/106 tests · baseline 66\.1 a day · \+60\.3%/)).toBeTruthy();
  });

  it('shows aggregate provenance, with no patient reference', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Why this dynamic signal?' });
    const provenance = screen.getByRole('table', { name: /Facilities and aggregate result counts/ });
    const rows = within(provenance).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Worcester Central Medical Center')).toBeTruthy();
    expect(within(rows[0]).getByText('46')).toBeTruthy();
    expect(within(rows[0]).getByText('Abnormal')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/FHIR-PT-|patient_reference/);
  });

  it('keeps Data Confidence separate from the score', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Why this dynamic signal?' });
    const card = screen.getByRole('heading', { name: 'Data Confidence' }).closest('section')!;
    for (const label of ['Feed Freshness', 'Data Completeness', 'Terminology Mapping Quality', 'Facility Participation', 'Data Integrity']) {
      expect(within(card).getByText(label)).toBeTruthy();
    }
  });

  it('explains an insufficient baseline without producing a score', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Why this dynamic signal?' });
    fireEvent.click(screen.getByRole('button', { name: 'Sat, Jan 3, 2026' }));
    expect(await screen.findByText(INSUFFICIENT_BASELINE_TEXT)).toBeTruthy();
    expect(metric('Composite Outbreak Signal Score')).toBe('Not calculated');
    expect(metric('Baseline tests')).toBe('Not available');
    expect(screen.getByText(/2 of the required 5 prior days have data/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Why this dynamic signal?' })).toBeNull();
    expect(calls).toContain('GET /api/surveillance/dynamic/signals/current?date=2026-01-03');
  });

  it('lists the signal history and selects a date from it', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Why this dynamic signal?' });
    const history = screen.getByRole('table', { name: /Every calculated dynamic signal/ });
    // 55 calculated dates (Nov 27 - Jan 20) plus the header row.
    expect(within(history).getAllByRole('row')).toHaveLength(56);
    fireEvent.change(screen.getByLabelText('Surveillance date'), { target: { value: '2026-01-15' } });
    await waitFor(() => expect(metric('Composite Outbreak Signal Score')).toBe('25 / 100'));
    expect(metric('Severity')).toBe('Watch');
    expect(metric('Affected facilities')).toBe('1 of 3');
  });

  it('recalculates on request (development)', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Why this dynamic signal?' });
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate Dynamic Surveillance' }));
    expect(await screen.findByText('Recalculated 55 day(s): 0 created, 0 updated, 55 unchanged.')).toBeTruthy();
    expect(calls).toContain('POST /api/surveillance/dynamic/recalculate');
  });

  it('offers no recalculation outside development', async () => {
    useBackend({ production: true });
    renderPage();
    await screen.findByRole('heading', { name: 'Why this dynamic signal?' });
    expect(screen.queryByRole('button', { name: 'Recalculate Dynamic Surveillance' })).toBeNull();
  });

  it('explains when nothing has been calculated yet', async () => {
    useBackend({ empty: true });
    renderPage();
    expect(await screen.findByText('No dynamic signals have been calculated yet')).toBeTruthy();
  });

  it('reports the API as unavailable', async () => {
    useBackend({ down: true });
    renderPage();
    expect(await screen.findByText('Dynamic surveillance is unavailable')).toBeTruthy();
  });
});

describe('Statistical Surveillance (EWMA) — API Capstone Mode', () => {
  const section = async () => {
    await screen.findByRole('heading', { name: 'Statistical Surveillance' });
    return screen.getByRole('heading', { name: 'Statistical Surveillance' }).closest('section')!;
  };
  const fact = (panel: HTMLElement, label: string) =>
    within(panel).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

  it('is labelled experimental and shows both metrics for the selected date', async () => {
    renderPage();
    const stats = await section();
    expect(within(stats).getByText('Experimental Statistical Surveillance')).toBeTruthy();
    expect(within(stats).getByText(/Prototype statistical detector — not clinically or epidemiologically validated\./)).toBeTruthy();
    expect(screen.getByText(/EWMA is an experimental statistical surveillance method in this capstone/)).toBeTruthy();

    const positivity = await within(stats).findByRole('region', { name: 'Positivity EWMA' });
    expect(within(positivity).getByText('Statistical Alert')).toBeTruthy();
    expect(fact(positivity, 'Observed')).toBe('37.7%');
    expect(fact(positivity, 'Historical mean')).toBe('7.5% (SD 4.2%)');
    expect(fact(positivity, 'EWMA')).toBe('20.90% → 25.11%');
    expect(fact(positivity, 'Upper control limit')).toBe('12.26%');
    expect(fact(positivity, 'Crossed the limit?')).toBe('Yes — 12.85% above the limit');
    expect(fact(positivity, 'Lambda · k')).toBe('0.25 · 3');
    expect(fact(positivity, 'Historical period')).toBe('2025-11-27 to 2025-12-24 (28 days)');
    expect(
      within(positivity).getByText('The exponentially weighted positivity signal exceeded its historical control limit.'),
    ).toBeTruthy();

    const volume = within(stats).getByRole('region', { name: 'Test Volume EWMA' });
    expect(fact(volume, 'Observed')).toBe('106.0 tests');
    expect(fact(volume, 'Upper control limit')).toBe('58.84 tests');
  });

  it('compares the two methods without combining them', async () => {
    renderPage();
    const stats = await section();
    const comparison = within(stats).getByRole('heading', { name: 'Detection Comparison' }).closest('section')!;
    await within(comparison).findByText('Agreement: Both methods signal');
    expect(fact(comparison, 'Score')).toBe('90 / 100');
    expect(fact(comparison, 'Volume')).toBe('Statistical Alert');
    expect(fact(comparison, 'Overall')).toMatch(/Statistical Alert$/);
    expect(within(comparison).getByText(/independently indicate abnormal activity/)).toBeTruthy();
    expect(within(comparison).getByText(/never combined into one number/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Surveillance date'), { target: { value: '2026-01-16' } });
    // A new date remounts the section: query it again.
    await screen.findByText('Agreement: Neither');
    const updated = screen.getByRole('heading', { name: 'Detection Comparison' }).closest('section')!;
    expect(fact(updated, 'Positivity')).toBe('Watch');
    expect(fact(updated, 'Overall')).toMatch(/Watch$/);
    expect(calls).toContain('GET /api/statistics/ewma/current?date=2026-01-16');
  });

  it('shows detection timing with lead and lag', async () => {
    renderPage();
    const stats = await section();
    const timing = within(stats).getByRole('table', { name: /each EWMA metric reaches Watch and Statistical Alert/ });
    const row = within(timing).getByText('Positivity EWMA — Statistical Alert').closest('tr')!;
    expect(row.textContent).toContain('Sat, Jan 17, 2026');
    expect(row.textContent).toContain('2 days later'); // vs composite Watch (Jan 15)
    expect(row.textContent).toContain('same day'); // vs composite High (Jan 17)
    const composite = within(stats).getByRole('table', { name: /Composite Outbreak Signal Score reaches each severity/ });
    expect(within(composite).getByText('Thu, Jan 15, 2026')).toBeTruthy();
  });

  it('switches the trend chart between metrics, with an accessible table', async () => {
    renderPage();
    const stats = await section();
    const tableFor = (name: RegExp) => within(stats).getByRole('table', { name });
    // 20 monitored days (Jan 1-20) plus the header row.
    expect(within(tableFor(/Positivity \(%\): observed value/)).getAllByRole('row')).toHaveLength(21);
    fireEvent.click(within(stats).getByRole('radio', { name: 'Test Volume' }));
    expect(within(tableFor(/Tests a day: observed value/)).getByText('84.0 tests')).toBeTruthy();
  });

  it('recalculates EWMA on request (development)', async () => {
    renderPage();
    const stats = await section();
    fireEvent.click(within(stats).getByRole('button', { name: 'Recalculate EWMA' }));
    expect(await screen.findByText('EWMA recalculated: 0 created, 0 updated, 110 unchanged.')).toBeTruthy();
    expect(calls).toContain('POST /api/statistics/ewma/recalculate');
  });

  it('keeps the composite view when EWMA fails, and explains when it is not calculated', async () => {
    useBackend({ ewmaDown: true });
    renderPage();
    expect(await screen.findByText('Statistical surveillance is unavailable')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Why this dynamic signal?' })).toBeTruthy();
    cleanup();
    useBackend({ ewmaEmpty: true });
    renderPage();
    expect(await screen.findByText('EWMA has not been calculated yet')).toBeTruthy();
  });
});

describe('CUSUM and the three-method comparison — API Capstone Mode', () => {
  const cusumSection = async () => {
    await screen.findByRole('heading', { name: 'CUSUM Surveillance' });
    return screen.getByRole('heading', { name: 'CUSUM Surveillance' }).closest('section')!;
  };
  const fact = (panel: HTMLElement, label: string) =>
    within(panel).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
  const comparison = async () => {
    await screen.findByRole('heading', { name: 'Three-Method Comparison' });
    return screen.getByRole('heading', { name: 'Three-Method Comparison' }).closest('section')!;
  };

  it('explains each CUSUM metric for the selected date', async () => {
    renderPage();
    const cusum = await cusumSection();
    expect(within(cusum).getByText(/CUSUM is an experimental statistical surveillance method in this capstone/)).toBeTruthy();
    const positivity = await within(cusum).findByRole('region', { name: 'Positivity CUSUM' });
    expect(within(positivity).getByText('Statistical Alert')).toBeTruthy();
    expect(fact(positivity, 'Observed today')).toBe('37.7%');
    expect(fact(positivity, 'Historical mean')).toBe('7.5%');
    expect(fact(positivity, 'Standard deviation')).toBe('4.2%');
    expect(fact(positivity, 'Standardized deviation (z)')).toBe('7.18 7.18 SD above the mean');
    expect(fact(positivity, 'Previous CUSUM')).toBe('14.95');
    expect(fact(positivity, 'Added today (z − k)')).toBe('+6.68 then floored at zero');
    expect(fact(positivity, 'Current CUSUM')).toBe('21.63');
    expect(fact(positivity, 'Decision limit h')).toBe('5.0');
    expect(fact(positivity, 'Crossed the limit?')).toBe('Yes — 16.63 past h');
    expect(fact(positivity, 'Reference value k')).toBe('0.50');
    expect(fact(positivity, 'Historical period')).toBe('2025-11-27 to 2025-12-24 (28 days)');
    expect(within(positivity).getByText(/accumulated enough sustained upward deviation/)).toBeTruthy();
  });

  it('counts the methods that signal, without combining them', async () => {
    renderPage();
    await cusumSection();
    fireEvent.change(screen.getByLabelText('Surveillance date'), { target: { value: '2026-01-17' } });
    await screen.findByText('3 OF 3 METHODS SIGNAL');
    const panel = await comparison();
    expect(within(panel).getByLabelText('Composite: signalling')).toBeTruthy();
    expect(within(panel).getByLabelText('EWMA: signalling')).toBeTruthy();
    expect(within(panel).getByLabelText('CUSUM: signalling')).toBeTruthy();
    const cusumColumn = within(panel).getByRole('region', { name: 'CUSUM method' });
    expect(fact(cusumColumn, 'Volume')).toBe('Normal');
    expect(fact(cusumColumn, 'Positivity')).toBe('Statistical Alert');
    const ewmaColumn = within(panel).getByRole('region', { name: 'EWMA method' });
    expect(fact(ewmaColumn, 'Volume')).toBe('Watch');
    expect(within(panel).getByText(/The count is descriptive, not a score\./)).toBeTruthy();

    const methods = within(panel).getByRole('table', { name: /What each surveillance method measures/ });
    for (const name of ['Composite Outbreak Signal', 'EWMA', 'CUSUM']) {
      const row = within(methods).getByRole('rowheader', { name }).closest('tr')!;
      expect(row.textContent).toContain('Sat, Jan 17, 2026'); // every method's first alert
    }
    expect(within(methods).getByText('High — 80')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Surveillance date'), { target: { value: '2026-01-16' } });
    expect(await screen.findByText('NO METHODS SIGNAL')).toBeTruthy();
    expect(calls).toContain('GET /api/statistics/comparison?date=2026-01-16');
  });

  it('shows CUSUM detection timing and the false-alert check', async () => {
    const cusum = await (async () => { renderPage(); return cusumSection(); })();
    const timing = within(cusum).getByRole('table', { name: /First CUSUM alert per metric/ });
    const volume = within(timing).getByText('Volume CUSUM — Statistical Alert').closest('tr')!;
    expect(volume.textContent).toContain('Sun, Jan 18, 2026');
    expect(volume.textContent).toContain('1 day later'); // vs composite High (Jan 17)
    const positivity = within(timing).getByText('Positivity CUSUM — Statistical Alert').closest('tr')!;
    expect(positivity.textContent).toContain('Sat, Jan 17, 2026');
    expect(positivity.textContent).toContain('1 day earlier'); // vs composite Critical (Jan 18)
    expect(within(cusum).getByText(/volume 0 alert days \(highest sum 1\.68\), positivity 0 alert days \(highest sum 3\.00\)/)).toBeTruthy();
  });

  it('switches the CUSUM chart between metrics, with an accessible table', async () => {
    renderPage();
    const cusum = await cusumSection();
    const table = (name: RegExp) => within(cusum).getByRole('table', { name });
    expect(within(table(/Positivity CUSUM: cumulative sum/)).getAllByRole('row')).toHaveLength(21);
    fireEvent.click(within(cusum).getByRole('radio', { name: 'Volume CUSUM' }));
    const volume = table(/Test Volume CUSUM: cumulative sum/);
    expect(within(volume).getByText('7.25')).toBeTruthy(); // Jan 18: 3.46 + 4.28 - 0.5
  });

  it('recalculates CUSUM on request (development)', async () => {
    renderPage();
    const cusum = await cusumSection();
    fireEvent.click(within(cusum).getByRole('button', { name: 'Recalculate CUSUM' }));
    expect(await screen.findByText('CUSUM recalculated: 0 created, 0 updated, 110 unchanged.')).toBeTruthy();
    expect(calls).toContain('POST /api/statistics/cusum/recalculate');
  });

  it('keeps the composite and EWMA when CUSUM fails, and explains when it is not calculated', async () => {
    useBackend({ cusumDown: true });
    renderPage();
    expect(await screen.findByText('CUSUM results are unavailable')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Statistical Surveillance' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Three-Method Comparison' })).toBeNull();
    cleanup();
    useBackend({ cusumEmpty: true });
    renderPage();
    expect(await screen.findByText('CUSUM has not been calculated yet')).toBeTruthy();
  });
});
