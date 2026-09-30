// @vitest-environment jsdom
/**
 * Final capstone polish in Local Demo Mode (the GitHub Pages build): mode
 * labelling, the Capstone Overview, Presentation Mode and the Architecture
 * page's status sections. Local mode makes no network request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', async (input: string) => {
    calls.push(String(input));
    throw new Error('Local mode must not make requests');
  });
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  // jsdom has no ResizeObserver; Recharts' ResponsiveContainer needs one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.sessionStorage.clear();
  document.documentElement.classList.remove('ls-presentation');
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

const topBar = () => screen.getAllByRole('banner').find((el) => el.tagName === 'HEADER' && el.querySelector('[data-mode]')) as HTMLElement;

describe('mode labelling', () => {
  it('names the Classroom Demo on frozen demonstration screens, with the Day 1-5 controls', async () => {
    // (The dashboard's Leaflet map cannot render in jsdom; any classroom route shows the same top bar.)
    renderAt('/reports');
    await screen.findByRole('button', { name: 'Next simulation day' });
    const bar = topBar();
    expect(bar.querySelector('[data-mode]')?.getAttribute('data-mode')).toBe('classroom');
    expect(within(bar).getByText('Classroom Demo')).toBeTruthy();
    expect(within(bar).getByText('Local Demo Mode')).toBeTruthy();
  });

  it('names the mode instead of the classroom controls elsewhere', async () => {
    renderAt('/overview');
    await screen.findByRole('heading', { name: 'Laboratory-First Public Health Early Warning' });
    const bar = topBar();
    expect(bar.querySelector('[data-mode]')?.getAttribute('data-mode')).toBe('overview');
    expect(within(bar).queryByRole('button', { name: 'Next simulation day' })).toBeNull();
    expect(within(bar).queryByText('/100')).toBeNull();
  });

  it('groups the navigation by mode, with no API or SMART entries in local mode', async () => {
    renderAt('/reports');
    await screen.findByRole('button', { name: 'Next simulation day' });
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(nav.textContent).toContain('Capstone Overview');
    expect(nav.textContent).toContain('Classroom Demo');
    expect(nav.textContent).toContain('Reference');
    expect(nav.textContent).not.toContain('API Capstone');
    expect(nav.textContent).not.toContain('FHIR Ingestion');
    expect(nav.textContent).not.toContain('SMART Sandbox');
  });
});

describe('Capstone Overview', () => {
  it('explains the workflow, links every part and states what needs API mode', async () => {
    renderAt('/overview');
    await screen.findByRole('heading', { name: 'Laboratory-First Public Health Early Warning' });
    const workflow = screen.getByRole('heading', { name: 'Workflow' }).closest('section') as HTMLElement;
    expect(within(workflow).getAllByRole('listitem')).toHaveLength(7);
    expect(workflow.textContent).toContain('Laboratory Data → FHIR Interoperability → Normalization → Dynamic Surveillance');

    const explore = screen.getByRole('heading', { name: 'Explore' }).closest('section') as HTMLElement;
    const links = within(explore).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard', '/fhir-ingestion', '/dynamic-surveillance', '/smart-demo', '/evaluation', '/architecture',
    ]);
    expect(within(explore).getAllByText('Requires API Capstone Mode (this build shows a notice).')).toHaveLength(3);
    expect(within(explore).getByText('Not enabled in this build (VITE_SMART_ENABLED).')).toBeTruthy();

    expect(screen.getByText('Synthetic data only. No real patient data.')).toBeTruthy();
    expect(screen.queryByText('Presentation readiness')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toEqual([]);
  });
});

describe('Presentation Mode', () => {
  it('turns on from the query string and steps through the real application', async () => {
    renderAt('/overview?presentation=true');
    const bar = await screen.findByRole('region', { name: 'Presentation mode' });
    expect(bar.textContent).toContain('Step 1 of 10');
    expect(bar.textContent).toContain('Problem and overview');
    expect(document.documentElement.classList.contains('ls-presentation')).toBe(true);
    expect((within(bar).getByRole('button', { name: '‹ Previous' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves between steps, following the real routes and noting what needs API mode', async () => {
    // Step 3 (Hospitals). The Step 2 dashboard's Leaflet map cannot render in jsdom.
    renderAt('/hospitals?presentation=true');
    const bar = await screen.findByRole('region', { name: 'Presentation mode' });
    expect(bar.textContent).toContain('Step 3 of 10');
    expect(bar.textContent).toContain('Vendor-agnostic sidecar');
    await screen.findByRole('button', { name: 'Next simulation day' });

    fireEvent.click(within(bar).getByRole('button', { name: 'Next ›' }));
    await screen.findByText('FHIR ingestion requires LabSentinel API Capstone Mode.');
    expect(bar.textContent).toContain('Step 4 of 10');
    expect(bar.textContent).toContain('Needs API Capstone Mode');

    fireEvent.click(within(bar).getByRole('button', { name: 'Next ›' }));
    expect(bar.textContent).toContain('Step 5 of 10');
    expect(bar.textContent).toContain('Normalization');

    fireEvent.click(within(bar).getByRole('button', { name: '‹ Previous' }));
    fireEvent.click(within(bar).getByRole('button', { name: '‹ Previous' }));
    expect(bar.textContent).toContain('Step 3 of 10');
    await screen.findByRole('button', { name: 'Next simulation day' });

    fireEvent.click(within(bar).getByRole('button', { name: 'Exit presentation' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Presentation mode' })).toBeNull());
    expect(document.documentElement.classList.contains('ls-presentation')).toBe(false);
  });

  it('is off by default and ends at the architecture step', async () => {
    renderAt('/overview');
    await screen.findByRole('heading', { name: 'Laboratory-First Public Health Early Warning' });
    expect(screen.queryByRole('region', { name: 'Presentation mode' })).toBeNull();
    cleanup();

    renderAt('/architecture?presentation=true');
    const bar = await screen.findByRole('region', { name: 'Presentation mode' });
    expect(bar.textContent).toContain('Step 10 of 10');
    expect((within(bar).getByRole('button', { name: 'Next ›' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Architecture page', () => {
  it('separates implemented, prototype and planned work, with future work', async () => {
    renderAt('/architecture');
    await screen.findByRole('heading', { name: 'LabSentinel Architecture' });
    for (const title of ['Implemented', 'Prototype', 'Planned and future', 'Future work']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    const implemented = screen.getByRole('heading', { name: 'Implemented' }).closest('section') as HTMLElement;
    for (const item of ['React frontend', 'FastAPI backend', 'PostgreSQL', 'FHIR ingestion', 'EWMA', 'CUSUM', 'SMART sandbox', 'Evaluation framework']) {
      expect(within(implemented).getAllByText(item).length).toBeGreaterThan(0);
    }
    expect(implemented.textContent).toContain('This build runs in Local Demo Mode');
    const future = document.getElementById('future-work') as HTMLElement;
    expect(future.textContent).toContain('Data Confidence should remember silent facilities');
    expect(future.textContent).toContain('Population denominators');
    expect(screen.queryByText(/There is no backend/)).toBeNull();
  });
});
