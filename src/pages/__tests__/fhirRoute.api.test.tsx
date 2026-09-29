// @vitest-environment jsdom
/**
 * API Capstone Mode: the full application, built as VITE_DATA_SOURCE=api,
 * lists "FHIR Ingestion" in its navigation and serves a connected page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import phase3Recording from '../../data-access/__tests__/fixtures/api-recording.json';
import { BASE, fakeBackend } from './fakeFhirBackend';

vi.mock('../../data-access/config', async (original) => ({
  ...(await original<typeof import('../../data-access/config')>()),
  BUILD_CONFIG: { ok: true, config: { mode: 'api', apiBaseUrl: 'http://api.test' } },
}));

const RECORDED = phase3Recording as Record<string, unknown>;

beforeEach(() => {
  const fhir = fakeBackend();
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = String(input).slice(BASE.length);
    if ((init?.method ?? 'GET') === 'GET' && path in RECORDED) {
      return new Response(JSON.stringify(RECORDED[path]), { status: 200 });
    }
    return fhir.fetch(input, init);
  });
  Element.prototype.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FHIR ingestion route in API Capstone Mode', () => {
  it('appears in the navigation and connects to the backend', async () => {
    render(
      <MemoryRouter initialEntries={['/fhir-ingestion']}>
        <App />
      </MemoryRouter>,
    );

    const heading = await screen.findByRole('heading', { name: 'FHIR Laboratory Ingestion' });
    expect(heading).toBeTruthy();
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(within(nav).getByRole('link', { name: /FHIR Ingestion/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Ingest Synthetic FHIR' })).toBeTruthy();
    expect(screen.queryByText('FHIR ingestion requires LabSentinel API Capstone Mode.')).toBeNull();
  });
});
