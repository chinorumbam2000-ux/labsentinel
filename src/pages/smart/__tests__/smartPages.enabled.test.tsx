// @vitest-environment jsdom
/**
 * SMART pages with SMART enabled; the SMART client adapter is mocked, so no
 * test reaches an authorization server or FHIR server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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

const adapter = vi.hoisted(() => ({
  beginEhrLaunch: vi.fn(async () => undefined),
  beginStandaloneLaunch: vi.fn(async () => undefined),
  completeAuthorization: vi.fn(),
  restoreSession: vi.fn(),
  hasStoredSession: vi.fn(() => false),
  endSession: vi.fn(),
}));
vi.mock('../../../smart/client', async (original) => ({
  ...(await original<typeof import('../../../smart/client')>()),
  ...adapter,
}));

import { toSession } from '../../../smart/client';
import { SimulationProvider } from '../../../context/SimulationContext';
import { DataSourceProvider } from '../../../data-access/DataSourceProvider';
import SmartLaunchPage from '../SmartLaunchPage';
import SmartCallbackPage from '../SmartCallbackPage';
import SmartSidecarPage, { SANDBOX_DATA_NOTE } from '../SmartSidecarPage';
import SmartDemoPage, { SMART_DISCLAIMER } from '../SmartDemoPage';

const SECRETS = ['SECRET-ACCESS-TOKEN', 'SECRET-REFRESH', 'SECRET-ID-TOKEN', 'SECRET-VERIFIER', 'SECRET-CODE'];

const labBundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Observation',
        id: 'obs-hgb',
        category: [{ coding: [{ code: 'laboratory' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }], text: 'Hemoglobin' },
        effectiveDateTime: '2020-01-01T10:00:00-05:00',
        valueQuantity: { value: 13.2, unit: 'g/dL' },
      },
    },
  ],
};

const sessionFor = (overrides: { expiresAt?: number; request?: () => Promise<unknown> } = {}) =>
  toSession(
    {
      state: {
        serverUrl: 'https://launch.smarthealthit.org/v/r4/fhir',
        expiresAt: overrides.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
        // Present in the library's state, and must never reach the page.
        tokenResponse: {
          scope: 'launch openid fhirUser patient/Observation.rs',
          ...({ access_token: SECRETS[0], refresh_token: SECRETS[1], id_token: SECRETS[2] } as object),
        },
        ...({ codeVerifier: SECRETS[3] } as object),
      },
      getPatientId: () => 'smart-patient-7',
      getFhirUser: () => 'Practitioner/prac-3',
      request: (overrides.request ?? (async () => labBundle)) as never,
    },
    'ehr',
  );

const renderAt = (path: string) =>
  render(
    <DataSourceProvider configResult={{ ok: true, config: { mode: 'local', apiBaseUrl: 'http://api.test' } }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/smart/launch" element={<SmartLaunchPage />} />
          <Route path="/smart/callback" element={<SmartCallbackPage />} />
          <Route
            path="/smart/sidecar"
            element={
              <SimulationProvider>
                <SmartSidecarPage />
              </SimulationProvider>
            }
          />
          <Route path="/smart-demo" element={<SmartDemoPage />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </DataSourceProvider>,
  );

beforeEach(() => {
  Object.values(adapter).forEach((fn) => fn.mockReset());
  adapter.beginEhrLaunch.mockResolvedValue(undefined);
  adapter.beginStandaloneLaunch.mockResolvedValue(undefined);
  adapter.hasStoredSession.mockReturnValue(false);
  Element.prototype.scrollTo = () => {};
});
afterEach(() => cleanup());

describe('SMART launch and callback', () => {
  it('passes a valid EHR launch to the SMART client', async () => {
    renderAt('/smart/launch?iss=https://launch.smarthealthit.org/v/r4/fhir&launch=abc');
    expect(await screen.findByText('Redirecting to the sandbox authorization server…')).toBeTruthy();
    expect(adapter.beginEhrLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'test-client' }),
      'https://launch.smarthealthit.org/v/r4/fhir',
      'abc',
    );
  });

  it('explains an invalid launch without starting authorization', () => {
    renderAt('/smart/launch?launch=abc');
    expect(screen.getByText('This is not a valid SMART EHR launch')).toBeTruthy();
    expect(screen.getByText(/missing the "iss"/)).toBeTruthy();
    expect(adapter.beginEhrLaunch).not.toHaveBeenCalled();
  });

  it('shows Authorization Denied in plain language', () => {
    renderAt('/smart/callback?error=access_denied&error_description=The%20user%20denied%20access');
    expect(screen.getByText('Authorization Denied')).toBeTruthy();
    expect(screen.getByText(/The user denied access/)).toBeTruthy();
    expect(adapter.completeAuthorization).not.toHaveBeenCalled();
  });

  it('reports any other OAuth error as a configuration error, not a denial', () => {
    renderAt('/smart/callback?error=invalid_request&error_description=Invalid%20launch%20options');
    expect(screen.getByText('SMART Configuration Error')).toBeTruthy();
    expect(screen.queryByText('Authorization Denied')).toBeNull();
    expect(screen.getByText(/Invalid launch options/)).toBeTruthy();
    expect(adapter.completeAuthorization).not.toHaveBeenCalled();
  });

  it('completes authorization and opens the sidecar', async () => {
    adapter.completeAuthorization.mockResolvedValue(sessionFor());
    adapter.restoreSession.mockResolvedValue(sessionFor());
    renderAt('/smart/callback?code=SECRET-CODE&state=s1');
    expect(await screen.findByRole('heading', { name: 'LabSentinel SMART Sidecar' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('SECRET-CODE');
  });

  it('reports a failed token exchange as a server error', async () => {
    adapter.completeAuthorization.mockRejectedValue(new Error('token endpoint 500: stack details'));
    renderAt('/smart/callback?code=x&state=s1');
    expect(await screen.findByText('FHIR Server Error')).toBeTruthy();
    expect(document.body.textContent).not.toContain('stack details');
  });
});

describe('SMART sidecar', () => {
  it('shows context and regional intelligence, and never a token', async () => {
    adapter.restoreSession.mockResolvedValue(sessionFor());
    renderAt('/smart/sidecar');

    expect(await screen.findByRole('heading', { name: 'LabSentinel SMART Sidecar' })).toBeTruthy();
    const context = screen.getByRole('region', { name: 'SMART context' });
    expect(within(context).getByText('Connected')).toBeTruthy();
    expect(within(context).getByText('launch.smarthealthit.org')).toBeTruthy();
    expect(within(context).getByText('EHR Launch')).toBeTruthy();
    expect(within(context).getByText('Practitioner/prac-3 (synthetic sandbox user)')).toBeTruthy();
    expect(within(context).getByText('smart-patient-7')).toBeTruthy();

    const regional = screen.getByRole('region', { name: 'Regional Respiratory Activity' });
    expect(within(regional).getByText('Composite Outbreak Signal Score')).toBeTruthy();
    expect(within(regional).getByRole('link', { name: 'View Regional Intelligence' })).toBeTruthy();

    expect(await screen.findByText('Hemoglobin')).toBeTruthy();
    expect(screen.getByText(SANDBOX_DATA_NOTE)).toBeTruthy();
    expect(screen.getByText(/requires API Capstone Mode/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View SMART Technical Details' }));
    expect(screen.getByText('launch openid fhirUser patient/Observation.rs')).toBeTruthy();

    for (const secret of SECRETS) expect(document.body.innerHTML).not.toContain(secret);
  });

  it('shows Session Expired when the access token has expired', async () => {
    adapter.restoreSession.mockResolvedValue(sessionFor({ expiresAt: 1000 }));
    renderAt('/smart/sidecar');
    expect(await screen.findByText('Session Expired')).toBeTruthy();
  });

  it('shows Ready to Launch when this tab has no session', async () => {
    adapter.restoreSession.mockResolvedValue(null);
    renderAt('/smart/sidecar');
    expect(await screen.findByText('No SMART session in this tab')).toBeTruthy();
    expect(screen.getByText('Ready to Launch')).toBeTruthy();
  });

  it('shows a FHIR server error when the sandbox cannot be read', async () => {
    adapter.restoreSession.mockResolvedValue(sessionFor({ request: async () => Promise.reject(new Error('503')) }));
    renderAt('/smart/sidecar');
    expect(await screen.findByText('FHIR Server Error')).toBeTruthy();
    expect(screen.getByText(/did not return laboratory Observations/)).toBeTruthy();
  });

  it('ends the session on request', async () => {
    adapter.restoreSession.mockResolvedValue(sessionFor());
    renderAt('/smart/sidecar');
    fireEvent.click(await screen.findByRole('button', { name: 'End SMART session' }));
    expect(adapter.endSession).toHaveBeenCalled();
    expect(await screen.findByText('No SMART session in this tab')).toBeTruthy();
  });
});

describe('SMART on FHIR Sandbox page', () => {
  it('shows the configuration, EHR instructions and a standalone launch', () => {
    renderAt('/smart-demo');
    expect(screen.getByRole('heading', { name: 'SMART on FHIR Sandbox' })).toBeTruthy();
    expect(screen.getByText(SMART_DISCLAIMER)).toBeTruthy();
    expect(screen.getByText('launch openid fhirUser patient/Observation.rs')).toBeTruthy();
    const launcher = screen.getByRole('link', { name: 'SMART Health IT launcher (prefilled)' });
    expect(launcher.getAttribute('href')).toBe(
      'https://launch.smarthealthit.org/?launch_url=http%3A%2F%2Flocalhost%2Flabsentinel%2Fsmart%2Flaunch&fhir_version=r4',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Launch SMART Sandbox (Standalone)' }));
    expect(adapter.beginStandaloneLaunch).toHaveBeenCalled();
    expect(screen.getByText('Live SMART sandbox session')).toBeTruthy();
  });
});
