// @vitest-environment jsdom
/**
 * Phase 3: Scenario Replay (/replay, with /simulation redirecting), product
 * language on analyst pages, and a clear statement that the data is simulated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../../App';
import { answerQuestion, answerText } from '../../assistant/answerEngine';
import { getScoreForDay } from '../../lib/selectors';
import { STORAGE_KEY as REPLAY_STATE_KEY } from '../../lib/sessionState';
import { chooseScenarioReplayForTest, signInForTest } from './signedIn';

const calls: string[] = [];
let lastPath = '';

function LocationProbe() {
  const location = useLocation();
  lastPath = `${location.pathname}${location.search}${location.hash}`;
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
  // These tests cover Scenario Replay; Live Surveillance is the default.
  chooseScenarioReplayForTest();
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

const topBar = () => screen.getAllByRole('banner').find((el) => el.tagName === 'HEADER') as HTMLElement;
const ANALYST_ROUTES = ['/replay', '/signals', '/facilities', '/laboratory-data', '/analytics', '/investigations', '/reports'];

describe('Scenario Replay routes', () => {
  it('serves Scenario Replay at /replay, listed under Overview', async () => {
    renderAt('/replay');
    expect(await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' })).toBeTruthy();
    const overview = within(screen.getAllByRole('navigation', { name: 'Primary' })[0]).getByRole('group', { name: 'Overview' });
    expect(within(overview).getByRole('link', { name: 'Scenario Replay' }).getAttribute('href')).toBe('/replay');
    expect(within(topBar()).getByText('Replay Day')).toBeTruthy();
  });

  it('redirects /simulation to /replay, keeping the query string and hash', async () => {
    renderAt('/simulation?from=bookmark#timeline');
    expect(await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' })).toBeTruthy();
    expect(lastPath).toBe('/replay?from=bookmark#timeline');
  });

  it('keeps the selected replay day through the redirect and its stored state', async () => {
    renderAt('/replay');
    await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' });
    fireEvent.click(screen.getByRole('button', { name: 'Next replay day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next replay day' }));
    await within(topBar()).findByText(/Day 3 of 5/);
    expect(JSON.parse(window.sessionStorage.getItem(REPLAY_STATE_KEY) ?? '{}').day).toBe(3);
    cleanup();
    renderAt('/simulation');
    await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' });
    expect(within(topBar()).getByText(/Day 3 of 5/)).toBeTruthy();
  });

  it('shows the original five-day scores', async () => {
    renderAt('/replay');
    await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' });
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Next replay day' }));
    await within(topBar()).findByText(/Day 5 of 5/);
    expect([1, 2, 3, 4, 5].map((day) => getScoreForDay(day).composite)).toEqual([0, 24, 50, 74, 87]);
    const table = screen.getAllByRole('table').find((t) => within(t).queryByRole('columnheader', { name: 'Persistence' })) as HTMLElement;
    const scores = within(table).getAllByRole('row').slice(1).map((row) => Number((() => { const cells = within(row).getAllByRole('cell'); return cells[cells.length - 2]?.textContent; })()));
    expect(scores).toEqual([0, 24, 50, 74, 87]);
  });
});

describe('simulated-data disclosure', () => {
  it.each(ANALYST_ROUTES)('%s says once, beside the replay controls, that the data is simulated', async (path) => {
    renderAt(path);
    await screen.findByRole('heading', { level: 1 });
    // The Scenario Replay indicator is the disclosure, with a link to the full limitations.
    expect(within(topBar()).getByText('Scenario Replay')).toBeTruthy();
    expect(within(topBar()).getByText('Simulated surveillance data')).toBeTruthy();
    // The disclosure is itself the link to the full limitations, named for both.
    const about = within(topBar()).getByRole('link', { name: 'Simulated surveillance data — about replay data' });
    expect(about.getAttribute('href')).toBe('/overview#about-the-data');
    expect(about.getAttribute('title')).toBe('About replay data');
    // No persistent banner, and no repeated warning block in the sidebar.
    expect(screen.queryByText('Simulated surveillance data.')).toBeNull();
    expect((document.body.textContent ?? '').match(/Simulated surveillance data/g)).toHaveLength(1);
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(nav.textContent).not.toMatch(/Not validated|Simulated data|Demo Environment|Classroom Demo/);
    expect(within(nav).getByRole('link', { name: 'About this data' }).getAttribute('href')).toBe('/overview#about-the-data');
  });

  it('keeps the full simulated-data banner and technical terms on System pages', async () => {
    renderAt('/fhir-ingestion');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Simulated surveillance data.')).toBeTruthy();
    expect(screen.getByText(/All facilities, patients, laboratory observations and vendor environments are\s+fictional/)).toBeTruthy();
    // Technical wording is allowed here.
    expect(document.body.textContent).toContain('full-stack build');
    expect(within(topBar()).getByText('Static portfolio build')).toBeTruthy();
  });

  it('lands "About this data" on the limitations, which still say the data is synthetic and not validated', async () => {
    renderAt('/overview#about-the-data');
    const heading = await screen.findByRole('heading', { name: 'About this data' });
    const card = heading.closest('section') as HTMLElement;
    expect(card.id).toBe('about-the-data');
    expect(card.textContent).toContain('Synthetic data only. No real patient data.');
    expect(card.textContent).toMatch(/not validated for public-health decisions/);
  });

  it('keeps score and method notes one click away, with their text unchanged', async () => {
    renderAt('/signals');
    await screen.findByRole('heading', { level: 1 });
    const note = screen.getAllByText(/illustrative, non-validated demonstration model/)[0];
    const details = note.closest('details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(within(details).getByText('About this score')).toBeTruthy();
    // The operational warning stays in view.
    expect(screen.getByText('Early-warning signal — not a confirmed outbreak. Epidemiological review required.').closest('details')).toBeNull();
  });

  it('keeps the simulated feed telemetry label on Facilities', async () => {
    renderAt('/facilities');
    await screen.findByRole('heading', { level: 1, name: 'Facilities' });
    expect(screen.getAllByText(/Simulated feed telemetry/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/live (hospital|laboratory) feed|connected to (a|the) (hospital|EHR)/i);
  });
});

describe('analyst pages use product language', () => {
  const CLASSROOM = ['Classroom', 'classroom', 'Simulation Day', 'Simulation date', 'simulation day', 'Session updated', 'Session clock',
    'session clock', 'Demo Environment', 'DEMO ENVIRONMENT', 'Capstone', 'capstone', 'Respiratory Outbreak Simulation', 'Reset Simulation',
    'API Capstone', 'Local Demo Mode', 'Synthetic data only', 'Demo User', 'simulation time', 'ProbeSyQ Signal'];

  it.each(ANALYST_ROUTES)('%s', async (path) => {
    renderAt(path);
    await screen.findByRole('heading', { level: 1 });
    const text = document.body.textContent ?? '';
    for (const phrase of CLASSROOM) expect(text, `${path}: ${phrase}`).not.toContain(phrase);
    expect(calls).toEqual([]);
  });

  it('shows the replay date, not a session clock, in the page header', async () => {
    renderAt('/signals');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByText('Replay date:').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Replay Day 1 of 5/).length).toBeGreaterThan(0);
  });
});

describe('Roella knows Scenario Replay', () => {
  const ask = (question: string, route: Parameters<typeof answerQuestion>[1]['route'] = 'dashboard', day: 1 | 2 | 3 | 4 | 5 = 5) =>
    answerText(answerQuestion(question, { day, route }, {}).answer);

  it('explains the rename when asked about the simulation', () => {
    for (const question of ['Where is the simulation?', 'How does the simulation work?']) {
      const text = ask(question);
      expect(text).toContain('Simulation is now called Scenario Replay; the old /simulation address still opens it.');
      expect(text).toContain('Scenario Replay');
    }
  });

  it('describes Scenario Replay and its page', () => {
    expect(ask('Where can I find the scenario replay?')).toContain('Open Scenario Replay in the sidebar');
    expect(ask('What does this page show?', 'simulation')).toContain('This page (Scenario Replay)');
    const help = ask('How do I use the replay?', 'dashboard', 3);
    expect(help).toContain('currently on Replay Day 3 of 5');
    expect(help).not.toContain('Simulation is now called');
  });

  it('talks about replay days, with unchanged numbers', () => {
    const ahead = ask('What happens on Day 4?', 'dashboard', 2);
    expect(ahead).toContain('ahead of the current replay day (Day 2)');
    expect(ask('What is the current score?')).toContain('87 out of 100');
    for (const question of ['What is the current score?', 'Why is the score this high?', 'When did the signal become Critical?']) {
      expect(ask(question, 'dashboard', 2)).not.toMatch(/simulation day|the demo\b/i);
    }
  });
});
