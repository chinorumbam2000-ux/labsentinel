// @vitest-environment jsdom
/**
 * The Capstone Evaluation page, rendered from the REAL evaluation artifacts
 * (fixtures/evaluation-summary.json: trimmed from
 * backend/evaluation-results/evaluation-summary.json, 100 repetitions, seed
 * 20260930). API mode shows the results read-only; local mode shows a notice
 * and makes no request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EvaluationPage from '../EvaluationPage';
import { DataSourceProvider } from '../../data-access/DataSourceProvider';
import { EVALUATION_DISCLAIMER, EVALUATION_LABEL, NO_WINNER } from '../../lib/evaluation';
import fixture from './fixtures/evaluation-summary.json';

const BASE = 'http://api.test';
let calls: string[] = [];

const useBackend = (options: { notRun?: boolean; down?: boolean } = {}) => {
  calls = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = String(input).slice(BASE.length);
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (options.down) throw new TypeError('Failed to fetch');
    if (options.notRun && path.startsWith('/api/evaluation')) {
      return new Response(JSON.stringify({ detail: 'No evaluation results.' }), { status: 404 });
    }
    if (path === '/api/evaluation/summary') return new Response(JSON.stringify(fixture.summary));
    const match = path.match(/^\/api\/evaluation\/scenarios\/(.+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const scenario = fixture.summary.scenarios.find((s) => s.id === id);
      const representative = (fixture.representatives as Record<string, unknown>)[id];
      if (scenario && representative) return new Response(JSON.stringify({ ...scenario, representative }));
    }
    return new Response('{}', { status: 404 });
  });
};

const renderPage = (mode: 'api' | 'local' = 'api') =>
  render(
    <DataSourceProvider configResult={{ ok: true, config: { mode, apiBaseUrl: BASE } }}>
      <MemoryRouter>
        <EvaluationPage />
      </MemoryRouter>
    </DataSourceProvider>,
  );

const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;

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

describe('Capstone Evaluation — Local Demo Mode', () => {
  it('explains that API mode is required, keeps the disclaimer and sends no request', async () => {
    renderPage('local');
    expect(screen.getByRole('heading', { name: 'Capstone Evaluation' })).toBeTruthy();
    expect(screen.getByText('The Capstone Evaluation requires LabSentinel API Capstone Mode.')).toBeTruthy();
    expect(screen.getByText(EVALUATION_DISCLAIMER)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toEqual([]);
  });
});

describe('Capstone Evaluation — API Capstone Mode', () => {
  it('labels the evaluation as experimental and synthetic, with the prominent disclaimer', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Overall comparison' });
    expect(screen.getByText(EVALUATION_LABEL)).toBeTruthy();
    expect(screen.getByText('SYNTHETIC EVALUATION')).toBeTruthy();
    expect(screen.getAllByText(EVALUATION_DISCLAIMER).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('python -m app.evaluation.run --all --repetitions 100 --seed 20260930')).toBeTruthy();
  });

  it('shows the pooled comparison with counts and Wilson intervals, and names no winner', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Overall comparison' });
    const overall = section('Overall comparison');
    expect(within(overall).getByText(NO_WINNER)).toBeTruthy();
    const row = within(overall).getByRole('rowheader', { name: 'Sensitivity (outbreak runs detected)' }).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells[0]).toBe('710/900 = 78.9% (95% CI 76.1–81.4)');
    expect(cells[1]).toMatch(/^900\/900 = 100\.0%/);
    expect(cells[2]).toMatch(/^900\/900 = 100\.0%/);
  });

  it('labels the unit of analysis on each confusion matrix', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Confusion matrices' });
    const matrices = section('Confusion matrices');
    expect(within(matrices).getByText('Unit: one simulated run')).toBeTruthy();
    expect(within(matrices).getByText('Unit: one monitored day')).toBeTruthy();
    expect(within(matrices).getByText('Composite (runs)')).toBeTruthy();
    expect(within(matrices).getByText('TP 710')).toBeTruthy();
    expect(within(matrices).getByText('FN 190')).toBeTruthy();
  });

  it('shows ground truth, detector results and the timeline for a selected scenario', async () => {
    renderPage();
    const select = (await screen.findByLabelText('Scenario')) as HTMLSelectElement;
    expect(select.value).toBe('S01-control');
    expect(section('Ground truth').textContent).toContain('Outbreak presentNo');
    expect(section('Detector results for this scenario').textContent).toContain('21/100 runs with a false alert');

    fireEvent.change(select, { target: { value: 'S13-moderate' } });
    const truth = section('Ground truth');
    expect(truth.textContent).toContain('Outbreak presentYes');
    expect(truth.textContent).toContain('2024-04-19 → 2024-05-09');
    const results = section('Detector results for this scenario');
    expect(results.textContent).toContain('88/100 detected · median delay 5 d');
    expect(within(results).getByText('Lead / lag between methods (runs where both detected)')).toBeTruthy();

    await waitFor(() => expect(calls).toContain('GET /api/evaluation/scenarios/S13-moderate'));
    const timeline = section('Scenario timeline');
    await waitFor(() => expect(within(timeline).getByRole('img').getAttribute('aria-label')).toMatch(/detection markers/));
    const table = within(timeline).getByRole('table');
    expect(within(table).getAllByText(/first detection/).length).toBe(3);
  });

  it('reports real-time detection for the delayed-data scenario', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Scenario'), { target: { value: 'S10-delayed-data' } });
    expect(section('Data-quality conditions').textContent).toContain('Scored in real time');
    expect(section('Detector results for this scenario').textContent).toContain('Retrospective timing');
    await waitFor(() => expect(section('Scenario timeline').textContent).toContain('Real-time (as-of) detection'));
  });

  it('shows robustness to data quality problems, sensitivity analyses, attributes and threats', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Robustness to Data Quality Problems' });
    expect(section('Robustness to Data Quality Problems').textContent).toContain('S10 Delayed');
    expect(screen.getByRole('heading', { name: 'Facility coverage' })).toBeTruthy();
    const sensitivity = section('Secondary analysis: parameter and cutoff sensitivity');
    expect(within(sensitivity).getByText('k = 0.5, h = 5')).toBeTruthy();
    expect(within(sensitivity).getAllByText('(application default)').length).toBe(3);
    expect(section('CDC/WHO surveillance attributes').textContent).toContain('Sensitivity');
    expect(section('Threats to validity').querySelectorAll('li').length).toBeGreaterThan(3);
  });

  it('explains how to produce results when none exist', async () => {
    useBackend({ notRun: true });
    renderPage();
    expect(await screen.findByText('No evaluation results')).toBeTruthy();
    expect(screen.getByText(/python -m app\.evaluation\.run --all/)).toBeTruthy();
  });

  it('reports an unreachable backend with a retry', async () => {
    useBackend({ down: true });
    renderPage();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
