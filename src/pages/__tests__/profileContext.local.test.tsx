// @vitest-environment jsdom
/**
 * Selected-profile context everywhere, global alert counts, profile-aware
 * investigations and reports, and the small-count rule at facility and
 * county level (local mode).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import App from '../../App';
import { saveSession } from '../../lib/sessionState';
import { summarizeProfiles } from '../../lib/profiles/portfolio';
import { answerQuestion, answerText } from '../../assistant/answerEngine';
import { signInForTest } from './signedIn';
import notFoundHtml from '../../../public/404.html?raw';

vi.mock('../../components/map/OutbreakMap', () => ({
  default: () => <div data-testid="outbreak-map" />,
}));

beforeEach(() => {
  vi.stubGlobal('fetch', async () => {
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
  window.localStorage.clear();
  signInForTest();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let lastSearch = '';
let lastPath = '';
function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  lastSearch = location.search;
  lastPath = location.pathname;
  return (
    <button type="button" data-testid="history-back" onClick={() => navigate(-1)}>
      back
    </button>
  );
}

const atDay = (day: 1 | 2 | 3 | 4 | 5) => saveSession({ day, acknowledgements: {}, investigations: {}, reports: [] });
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Probe />
    </MemoryRouter>,
  );
const WAIT = { timeout: 5000 };
const reading = () => screen.getByTestId('profile-reading');
const topBar = () => document.querySelector('header') as HTMLElement;

describe('top bar follows the selected profile', () => {
  it('shows the selected profile’s own score, never the replay’s', async () => {
    atDay(5);
    renderAt('/map?profile=covid-19');
    await screen.findByRole('heading', { level: 1, name: 'Outbreak Map' }, WAIT);
    expect(reading().getAttribute('aria-label')).toBe(
      'Selected profile: COVID-19, Critical, score 93 out of 100; 4 alerts awaiting acknowledgement',
    );
    expect(reading().textContent).toContain('93');
    expect(reading().textContent).not.toContain('87');
    // The narrated stage is the replay's: not shown on a profile page.
    expect(topBar().textContent).not.toContain('Regional Early-Warning Signal');
  });

  it('shows status words, not a number, for an unscored profile', async () => {
    atDay(5);
    renderAt('/dashboard?profile=cholera');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    expect(reading().textContent).toBe('CholeraInsufficient baseline');
    expect(reading().textContent).not.toMatch(/\d/);
    cleanup();
    atDay(1);
    renderAt('/facilities?profile=cholera');
    await screen.findByRole('heading', { level: 1, name: 'Facilities' }, WAIT);
    expect(reading().textContent).toBe('CholeraNo current data');
    expect(reading().getAttribute('aria-label')).toContain('no current data');
  });

  it('names Respiratory Viral Syndrome as the replay profile on Scenario Replay', async () => {
    atDay(5);
    renderAt('/replay?profile=covid-19');
    await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' }, WAIT);
    expect(reading().getAttribute('aria-label')).toMatch(/^Replay profile: Respiratory Viral Syndrome, Critical, score 87/);
    expect(topBar().textContent).toContain('Regional Early-Warning Signal');
    // The selection is kept for the way back.
    expect(lastSearch).toBe('?profile=covid-19');
  });

  it('shows the narrated stage in page headers only for its own profile', async () => {
    atDay(5);
    renderAt('/signals?profile=covid-19');
    await screen.findByRole('heading', { level: 1, name: 'Signals & Alerts' }, WAIT);
    expect(document.body.textContent).not.toContain('Regional Early-Warning Signal');
    expect(screen.getByText('Replay Day 5 of 5')).toBeTruthy();
    cleanup();
    renderAt('/signals');
    await screen.findByRole('heading', { level: 1, name: 'Signals & Alerts' }, WAIT);
    expect(screen.getByText('Replay Day 5 of 5 · Regional Early-Warning Signal')).toBeTruthy();
  });

  it('keeps the default (no ?profile) exactly on Respiratory Viral Syndrome', async () => {
    atDay(5);
    renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    expect(reading().getAttribute('aria-label')).toMatch(/^Selected profile: Respiratory Viral Syndrome, Critical, score 87/);
  });
});

describe('global alert counts', () => {
  it('counts alerts across all profiles in the bell and the Signals badge', async () => {
    atDay(5);
    renderAt('/dashboard?profile=rsv');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    const bell = screen.getByRole('button', { name: /^Notifications:/ });
    expect(bell.getAttribute('aria-label')).toBe('Notifications: 15 alerts awaiting acknowledgement across all profiles');
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(within(nav).getByLabelText('15 alerts awaiting acknowledgement across all profiles')).toBeTruthy();
    fireEvent.click(bell);
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge alert: COVID-19 — Regional outbreak signal detected' }));
    expect(screen.getByRole('button', { name: /^Notifications:/ }).getAttribute('aria-label')).toContain('14 alerts');
    // The replay tile names no score: scores belong to profiles.
    expect(nav.textContent).not.toContain('Score 87');
  });
});

describe('investigations and reports name their profile', () => {
  it('lists every profile’s alert with its profile', async () => {
    atDay(5);
    renderAt('/investigations');
    const table = await screen.findByRole('table', { name: /investigation and report status/ }, WAIT);
    expect(within(table).getByRole('columnheader', { name: 'Profile' })).toBeTruthy();
    expect(within(table).getAllByText('COVID-19').length).toBe(4);
    expect(within(table).getAllByRole('link', { name: /^Open investigation: Influenza A — / }).length).toBe(4);
  });

  it('reviews a COVID-19 alert and drafts a COVID-19 report — never an RVS one', async () => {
    atDay(5);
    renderAt('/signals?profile=covid-19&alert=ALERT-COVID-19-REGIONAL-D5&view=detection');
    await screen.findByTestId('profile-investigation', {}, WAIT);
    fireEvent.click(screen.getByRole('button', { name: 'Begin Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue Monitoring' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Public Health Report' }));
    await screen.findByRole('heading', { level: 1, name: /Reports/ }, WAIT);
    expect(lastPath).toBe('/reports');
    expect(lastSearch).toBe('?profile=covid-19');
    const body = document.body.textContent ?? '';
    expect(body).toContain('COVID-19');
    expect(body).toContain('Regional outbreak signal detected');
    expect(body).not.toContain('Respiratory Viral Syndrome · ');
    // The investigation record carries its profile.
    const stored = JSON.parse(window.sessionStorage.getItem('labsentinel.simulation.v1') ?? '{}');
    expect(stored.investigations['ALERT-COVID-19-REGIONAL-D5'].profileId).toBe('covid-19');
    expect(stored.reports[0].snapshot.syndrome).toBe('COVID-19');
    expect(stored.reports[0].snapshot.profileId).toBe('covid-19');
    expect(stored.reports[0].snapshot.baselineTestVolume).toBe(34);
  });
});

describe('the small-count rule at facility and county level', () => {
  it('withholds a facility’s positives and rate under 5, and lists no results on the summary', async () => {
    atDay(1);
    renderAt('/facilities');
    await screen.findByRole('heading', { level: 1, name: 'Facilities' }, WAIT);
    // Day 1, the first facility: 3 positives of 41 — withheld.
    expect(screen.getByText('Fewer than 5 of 41 tests positive — withheld')).toBeTruthy();
    expect(screen.queryByText('3 of 41 tests positive')).toBeNull();
    expect(screen.queryByText('7.3%')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Result' })).toBeNull();
    expect(screen.getByText(/Results are not listed here/)).toBeTruthy();
  });

  it('shows a facility’s count once it meets the threshold', async () => {
    atDay(5);
    renderAt('/facilities');
    await screen.findByRole('heading', { level: 1, name: 'Facilities' }, WAIT);
    expect(screen.getByText('14 of 72 tests positive')).toBeTruthy();
  });

  it('withholds a profile’s county-level count and rate under 5 on every screen', async () => {
    atDay(1);
    renderAt('/dashboard?profile=influenza-a');
    await screen.findByTestId('profile-heading', {}, WAIT);
    // Influenza A, Day 1: 1 positive of 33.
    expect(screen.getByText('<5 of 33 tests · baseline <5')).toBeTruthy();
    expect(document.body.textContent).not.toContain('3.0%');
    expect(screen.getByTestId('low-volume-note').textContent).toContain('fewer than 5 positive results');
    cleanup();
    renderAt('/signals?profile=influenza-a');
    await screen.findByRole('heading', { level: 1, name: 'Signals & Alerts' }, WAIT);
    expect(document.body.textContent).not.toContain('3.0%');
  });

  it('never withholds the narrated profile’s regional figures (all at least 5)', () => {
    for (const day of [1, 2, 3, 4, 5]) {
      const rvs = summarizeProfiles(day).find((s) => s.profile.id === 'respiratory-viral-syndrome')!;
      expect(rvs.current.scenario.totalPositives).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('score traceability', () => {
  it('lists the score’s components, the same ones Roella explains', async () => {
    atDay(4);
    renderAt('/dashboard?profile=influenza-a');
    const list = await screen.findByTestId('score-components', {}, WAIT);
    const flu = summarizeProfiles(4).find((s) => s.profile.id === 'influenza-a')!;
    expect(list.textContent).toContain(`Score components (${flu.score!.composite} of 100)`);
    const roella = answerText(
      answerQuestion('Why is this signal high?', {
        day: 4,
        route: 'dashboard',
        profiles: summarizeProfiles(4),
        profileId: 'influenza-a',
      }).answer,
    );
    for (const c of flu.score!.components) {
      expect(list.textContent).toContain(`${c.label}: ${c.points} of ${c.maxPoints} points`);
      expect(roella).toContain(`${c.label}: ${c.points} of ${c.maxPoints} points`);
    }
    // The positivity rates are withheld (baseline of 1 positive) in both.
    expect(list.textContent).toContain('Rates withheld');
    expect(roella).toContain('Rates withheld');
  });
});

describe('selected-profile URL state', () => {
  it('back and forward restore the previous profile', async () => {
    atDay(5);
    renderAt('/dashboard?profile=rsv');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    fireEvent.change(screen.getByLabelText('Surveillance profile'), { target: { value: 'cholera' } });
    expect(lastSearch).toBe('?profile=cholera');
    fireEvent.click(screen.getByTestId('history-back'));
    expect(lastSearch).toBe('?profile=rsv');
    expect((screen.getByLabelText('Surveillance profile') as HTMLSelectElement).value).toBe('rsv');
  });

  it('carries the profile through the sidebar to every analyst page', async () => {
    atDay(5);
    renderAt('/dashboard?profile=covid-19');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    for (const label of ['Outbreak Map', 'Signals', 'Facilities', 'Laboratory Data', 'Analytics', 'Investigations', 'Reports']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label) }).getAttribute('href')).toMatch(/\?profile=covid-19$/);
    }
  });
});

describe('public branding', () => {
  it('the 404 redirect page carries no former product name', () => {
    expect(notFoundHtml).toContain('<title>Signal by ProbeSyQ — Outbreak Intelligence</title>');
    expect(notFoundHtml).not.toContain('LabSentinel');
    // The repository path stays: it is the app's base, not branding.
    expect(notFoundHtml).toContain('/labsentinel/');
  });
});
