// @vitest-environment jsdom
/**
 * Phase 2: the analyst workflow first, technical pages under System, and no
 * implementation labels or unbacked status claims on analyst screens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../../App';
import { answerQuestion, answerText } from '../../assistant/answerEngine';
import { ANALYST_SECTIONS, SYSTEM_ROUTES, systemItems } from '../../lib/navigation';
import { signInForTest } from './signedIn';

const calls: string[] = [];
let lastPath = '';

function LocationProbe() {
  const location = useLocation();
  lastPath = `${location.pathname}${location.search}`;
  return null;
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', async (input: string) => {
    calls.push(String(input));
    throw new Error('Local mode must not make requests');
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
      <LocationProbe />
    </MemoryRouter>,
  );

const primaryNav = () => screen.getAllByRole('navigation', { name: 'Primary' })[0];
const analystRoutes = ANALYST_SECTIONS.flatMap((section) => section.items.map((item) => item.to));

describe('navigation model', () => {
  it('keeps raw FHIR, SMART, evaluation and other technical pages out of the analyst workflow', () => {
    for (const route of ['/fhir-ingestion', '/dynamic-surveillance', '/smart-demo', '/evaluation', '/architecture', '/overview']) {
      expect(analystRoutes).not.toContain(route);
      expect(SYSTEM_ROUTES).toContain(route);
    }
    expect(ANALYST_SECTIONS.map((section) => section.heading)).toEqual(['Overview', 'Surveillance', 'Action']);
    expect(analystRoutes).toEqual([
      '/dashboard', '/live', '/replay', '/map', '/signals', '/facilities', '/laboratory-data', '/analytics', '/investigations', '/reports',
    ]);
  });

  it('lists every technical page under System in a full-stack, SMART-enabled build', () => {
    expect(systemItems('api', true).map((item) => [item.to, item.label])).toEqual([
      ['/fhir-ingestion', 'Data Ingestion'],
      ['/dynamic-surveillance', 'Detection Methods'],
      ['/smart-demo', 'Integration Testing'],
      ['/evaluation', 'Validation'],
      ['/architecture', 'Architecture'],
      ['/overview', 'Project Overview'],
    ]);
    // A local build lists only the pages that work without a backend.
    expect(systemItems('local', false).map((item) => item.to)).toEqual(['/architecture', '/overview']);
  });
});

describe('sidebar', () => {
  it('shows the analyst groups, with System collapsed on an analyst page and opening on request', async () => {
    renderAt('/reports');
    await screen.findByRole('heading', { name: 'Public Health Reports' });
    const nav = primaryNav();
    const surveillance = within(nav).getByRole('group', { name: 'Surveillance' });
    expect(within(surveillance).getByRole('link', { name: 'Facilities' }).getAttribute('href')).toBe('/facilities');
    expect(within(within(nav).getByRole('group', { name: 'Action' })).getByRole('link', { name: 'Investigations' })).toBeTruthy();

    const toggle = within(nav).getByRole('button', { name: /System/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(nav).queryByRole('link', { name: 'Architecture' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(nav).getByRole('link', { name: 'Architecture' })).toBeTruthy();
    expect(within(nav).getByText(/not access-controlled/)).toBeTruthy();
  });

  it('opens System by itself on a System page', async () => {
    renderAt('/architecture');
    await screen.findByRole('heading', { level: 1 });
    expect(within(primaryNav()).getByRole('button', { name: /System/ }).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Facilities', () => {
  it('is titled Facilities, with facility status first and Data Confidence in view', async () => {
    renderAt('/facilities');
    expect(await screen.findByRole('heading', { level: 1, name: 'Facilities' })).toBeTruthy();
    const status = screen.getByRole('heading', { name: 'Facility status' }).closest('section') as HTMLElement;
    expect(within(status).getByText('3 of 3 facilities reporting · all feeds healthy')).toBeTruthy();
    for (const name of ['Worcester Central Medical Center', 'Central Massachusetts Regional Hospital', 'Shrewsbury Community Medical Center']) {
      expect(within(status).getByText(name)).toBeTruthy();
    }
    expect(screen.getAllByText(/Data Confidence/).length).toBeGreaterThan(0);
    expect(screen.getByText(/it never changes the\s+Composite Outbreak Signal Score/)).toBeTruthy();
  });

  it('keeps the old /hospitals address working, query string included', async () => {
    renderAt('/hospitals?from=bookmark');
    expect(await screen.findByRole('heading', { level: 1, name: 'Facilities' })).toBeTruthy();
    expect(lastPath).toBe('/facilities?from=bookmark');
  });

  it('makes no status claim it cannot back', async () => {
    renderAt('/facilities');
    await screen.findByRole('heading', { level: 1, name: 'Facilities' });
    const text = document.body.textContent ?? '';
    for (const claim of ['Signal Engine', 'Normalization', 'Last Sync', 'Interoperability Status', 'Connected']) {
      expect(text).not.toContain(claim);
    }
    const details = screen.getByText('Integration details').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('Simulated Epic Environment');
    expect(details.textContent).not.toContain('✓');
  });
});

describe('analyst screens carry no implementation labels', () => {
  it.each(['/replay', '/signals', '/facilities', '/laboratory-data', '/analytics', '/investigations', '/reports'])('%s', async (path) => {
    renderAt(path);
    await screen.findByRole('heading', { level: 1 });
    const text = document.body.textContent ?? '';
    for (const label of ['Local Demo Mode', 'API Capstone', 'API mode', 'local mode', 'Capstone Overview', 'Capstone Evaluation']) {
      expect(text, `${path}: ${label}`).not.toContain(label);
    }
    expect(calls).toEqual([]);
  });
});

describe('Investigations', () => {
  it('lists each detected signal with its review and report status, linking to its investigation', async () => {
    renderAt('/replay');
    await screen.findByRole('heading', { level: 1 });
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Next replay day' }));
    cleanup();
    renderAt('/investigations');
    const table = (await screen.findByRole('table', { name: /investigation and report status/ })) as HTMLElement;
    // Every profile's alerts, each naming its profile and opening that profile's investigation.
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBe(15);
    expect(rows.filter((row) => row.textContent?.startsWith('Respiratory Viral Activity'))).toHaveLength(4);
    for (const row of rows) {
      expect(within(row).getByText('NEW')).toBeTruthy();
      expect(within(row).getByText('Not prepared')).toBeTruthy();
      expect(within(row).getByRole('link', { name: /Open investigation/ }).getAttribute('href')).toMatch(
        /^\/signals\?profile=[a-z0-9-]+&alert=ALERT-/,
      );
    }
  });

  it('says so when there is nothing to investigate yet', async () => {
    renderAt('/investigations');
    expect(await screen.findByText('Nothing to investigate yet')).toBeTruthy();
  });
});

describe('Roella follows the new names', () => {
  const ask = (question: string, route: Parameters<typeof answerQuestion>[1]['route'] = 'dashboard') =>
    answerText(answerQuestion(question, { day: 5, route }, {}).answer);

  it('sends facility questions to Facilities and technical ones to System', () => {
    expect(ask('Where can I see facility feed health?')).toContain('Open Facilities in the sidebar');
    expect(ask('Where can I see investigations?')).toContain('Open Investigations in the sidebar');
    expect(ask('Where is the architecture?')).toContain('Open System → Architecture in the sidebar');
    expect(ask('What does this page show?', 'hospitals')).toContain('This page (Facilities)');
    expect(ask('Where can I find things?')).toContain('Technical pages are under System');
    for (const question of ['Where can I see facility feed health?', 'Which hospitals are affected?', 'What changed from Day 2 to Day 5?']) {
      expect(ask(question)).not.toMatch(/\bHospitals page\b|Affected hospitals/);
    }
  });
});
