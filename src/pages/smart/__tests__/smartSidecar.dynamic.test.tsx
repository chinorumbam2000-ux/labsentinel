// @vitest-environment jsdom
/**
 * The SMART sidecar in API Capstone Mode: its regional panel shows Demo
 * Surveillance unless Dynamic Surveillance is chosen, and says which it is.
 * The SMART client adapter is mocked; backend replies are real recordings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import phase3Recording from '../../../data-access/__tests__/fixtures/api-recording.json';
import { dynamicReply } from '../../__tests__/fakeDynamicBackend';

vi.mock('../../../smart/config', async (original) => ({
  ...(await original<typeof import('../../../smart/config')>()),
  SMART_BUILD_CONFIG: {
    ok: true,
    config: {
      enabled: true,
      clientId: 'test-client',
      scopes: 'openid fhirUser patient/Observation.rs',
      redirectUri: 'http://localhost/labsentinel/smart/callback',
      launchUri: 'http://localhost/labsentinel/smart/launch',
      standaloneIss: 'https://sandbox.test/fhir',
    },
  },
}));

const adapter = vi.hoisted(() => ({ restoreSession: vi.fn(), endSession: vi.fn() }));
vi.mock('../../../smart/client', async (original) => ({
  ...(await original<typeof import('../../../smart/client')>()),
  ...adapter,
}));

import { toSession } from '../../../smart/client';
import { SimulationProvider } from '../../../context/SimulationContext';
import { DataSourceProvider } from '../../../data-access/DataSourceProvider';
import SmartSidecarPage from '../SmartSidecarPage';

const BASE = 'http://api.test';
const RECORDED = phase3Recording as Record<string, unknown>;
const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  adapter.restoreSession.mockResolvedValue(
    toSession(
      {
        state: { serverUrl: 'https://launch.smarthealthit.org/v/r4/fhir', expiresAt: Math.floor(Date.now() / 1000) + 3600, tokenResponse: { scope: 'launch' } },
        getPatientId: () => 'p-1',
        getFhirUser: () => 'Practitioner/x',
        request: (async () => ({ resourceType: 'Bundle', entry: [] })) as never,
      },
      'ehr',
    ),
  );
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = String(input).slice(BASE.length);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    if (method === 'GET' && path in RECORDED) return new Response(JSON.stringify(RECORDED[path]));
    return dynamicReply(path, method) ?? new Response('{}', { status: 404 });
  });
  Element.prototype.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SMART sidecar regional panel in API mode', () => {
  it('shows Demo Surveillance by default and Dynamic Surveillance only when chosen', async () => {
    render(
      <DataSourceProvider configResult={{ ok: true, config: { mode: 'api', apiBaseUrl: BASE } }}>
        <MemoryRouter initialEntries={['/smart/sidecar']}>
          <Routes>
            <Route
              path="/smart/sidecar"
              element={
                <SimulationProvider>
                  <SmartSidecarPage />
                </SimulationProvider>
              }
            />
          </Routes>
        </MemoryRouter>
      </DataSourceProvider>,
    );

    const regional = await screen.findByRole('region', { name: 'Regional Respiratory Activity' });
    const choice = within(regional).getByRole('radiogroup', { name: 'Surveillance shown' });
    expect(within(choice).getByRole('radio', { name: 'Demo Surveillance' }).getAttribute('aria-checked')).toBe('true');
    expect(await within(regional).findByText('Demo Surveillance', { selector: 'strong' })).toBeTruthy();
    expect(calls.some((call) => call.includes('/api/surveillance/dynamic'))).toBe(false);

    fireEvent.click(within(choice).getByRole('radio', { name: 'Dynamic Surveillance' }));
    expect(await within(regional).findByText('Tue, Jan 20, 2026')).toBeTruthy();
    expect(within(regional).getByText('Dynamic Surveillance', { selector: 'strong' })).toBeTruthy();
    expect(within(regional).getByText('90/100')).toBeTruthy();
    expect(within(regional).getByText('3 of 3')).toBeTruthy();
    // A compact statistical indicator only: no control-chart mathematics in the sidecar.
    expect(await within(regional).findByText('EWMA Alert')).toBeTruthy();
    expect(within(regional).queryByText(/control limit|lambda/i)).toBeNull();
    expect(within(regional).getByRole('link', { name: 'View Statistical Details' }).getAttribute('href')).toBe(
      '/dynamic-surveillance#statistical-surveillance',
    );
    expect(calls).toContain('GET /api/statistics/ewma/current?date=2026-01-20');
    expect(within(regional).queryByText('Demo Surveillance', { selector: 'strong' })).toBeNull();
    expect(calls).toContain('GET /api/surveillance/dynamic/signals/current');
  });
});
