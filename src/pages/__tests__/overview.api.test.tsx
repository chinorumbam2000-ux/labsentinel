// @vitest-environment jsdom
/**
 * The Capstone Overview in API Capstone Mode: the development-only
 * presentation readiness panel (frontend configuration plus the backend
 * checklist from GET /api/readiness). No secrets are shown.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewPage from '../OverviewPage';
import { DataSourceProvider } from '../../data-access/DataSourceProvider';

const BASE = 'http://api.test';

const READINESS = {
  status: 'READY',
  environment: 'development',
  disclaimer: 'Synthetic data only.',
  checks: [
    { key: 'database', label: 'Database health', status: 'PASS', detail: 'Connected.' },
    { key: 'seed', label: 'Frozen Day 1-5 demonstration', status: 'PASS', detail: 'scores 0 / 24 / 50 / 74 / 87.' },
    { key: 'smart', label: 'SMART sandbox bridge', status: 'WARN', detail: 'SMART-SANDBOX facility absent.' },
  ],
};

const useBackend = (readiness: 'ok' | 'disabled') =>
  vi.stubGlobal('fetch', async (input: string) => {
    const path = String(input).slice(BASE.length);
    if (path === '/api/health') return new Response(JSON.stringify({ status: 'healthy' }));
    if (path === '/api/health/database') return new Response(JSON.stringify({ status: 'healthy', database: 'connected' }));
    if (path === '/api/readiness' && readiness === 'ok') return new Response(JSON.stringify(READINESS));
    return new Response('{"detail":"Not Found"}', { status: 404 });
  });

const renderPage = () =>
  render(
    <DataSourceProvider configResult={{ ok: true, config: { mode: 'api', apiBaseUrl: BASE } }}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </DataSourceProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Capstone Overview — API Capstone Mode', () => {
  it('shows the readiness checklist beside the frontend configuration', async () => {
    useBackend('ok');
    renderPage();
    const panel = (await screen.findByRole('heading', { name: 'Presentation readiness' })).closest('section') as HTMLElement;
    expect(panel.closest('[data-dev-detail]')).toBeTruthy();
    await within(panel).findByText('Database health:');
    expect(panel.textContent).toContain('READY (APP_ENV=development)');
    expect(panel.textContent).toContain('API Capstone Mode → http://api.test');
    expect(within(panel).getAllByText('WARN').length).toBeGreaterThan(0);
    expect(panel.textContent).not.toMatch(/password|secret=|salt/i);
    // API-mode features are available: no "requires API mode" notes on the cards.
    expect(screen.queryByText('Requires API Capstone Mode (this build shows a notice).')).toBeNull();
  });

  it('says so when the readiness endpoint is disabled in this environment', async () => {
    useBackend('disabled');
    renderPage();
    expect(await screen.findByText('Not available in this environment (development-only endpoint).')).toBeTruthy();
  });
});
