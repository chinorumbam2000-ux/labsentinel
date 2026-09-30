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

const metric = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

beforeEach(() => useBackend());
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
    expect(within(history).getAllByRole('row')).toHaveLength(21);
    fireEvent.change(screen.getByLabelText('Surveillance date'), { target: { value: '2026-01-15' } });
    await waitFor(() => expect(metric('Composite Outbreak Signal Score')).toBe('25 / 100'));
    expect(metric('Severity')).toBe('Watch');
    expect(metric('Affected facilities')).toBe('1 of 3');
  });

  it('recalculates on request (development)', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Why this dynamic signal?' });
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate Dynamic Surveillance' }));
    expect(await screen.findByText('Recalculated 20 day(s): 0 created, 0 updated, 20 unchanged.')).toBeTruthy();
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
