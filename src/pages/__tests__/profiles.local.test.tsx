// @vitest-environment jsdom
/**
 * Multi-profile surveillance in the analyst pages (local mode): Active
 * Surveillance, the profile selector and ?profile= state, and the
 * profile-aware Map, Facilities, Laboratory Data, Analytics and Signals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../../App';
import { saveSession } from '../../lib/sessionState';
import { OBSERVATIONS_BY_PROFILE } from '../../lib/profiles/derive';
import { signInForTest } from './signedIn';

// Leaflet needs a real browser; the map itself is checked in the browser runs.
vi.mock('../../components/map/OutbreakMap', () => ({
  default: (props: { unscoredReason?: string | null }) => (
    <div data-testid="outbreak-map" data-unscored={props.unscoredReason ? 'yes' : 'no'} />
  ),
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
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

const atDay = (day: 1 | 2 | 3 | 4 | 5) =>
  saveSession({ day, acknowledgements: {}, investigations: {}, reports: [] });

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );

const selector = () => screen.getByLabelText('Surveillance profile') as HTMLSelectElement;
const WAIT = { timeout: 5000 };
const situationText = () =>
  screen.getAllByRole('region', { name: 'Current situation' }).map((el) => el.textContent).join(' ');

describe('Dashboard — Active Surveillance', () => {
  it('lists the active signals ranked, with each status counted separately', async () => {
    atDay(5);
    renderAt('/dashboard');
    const section = await screen.findByTestId('active-surveillance', {}, WAIT);
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('4 signals require attention');
    const counts = within(section).getByLabelText('Profile status counts');
    const count = (label: string) => within(counts).getByText(label).nextElementSibling?.textContent;
    expect(count('Active signal')).toBe('4');
    expect(count('Within expected range')).toBe('1');
    expect(count('Insufficient baseline')).toBe('1');
    expect(count('No data')).toBe('0');
    const cards = within(within(section).getByRole('list', { name: 'Active signals' })).getAllByRole('heading', { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual(['COVID-19', 'Respiratory Viral Syndrome', 'Influenza A', 'RSV']);
    // Status in words, not colour alone.
    expect(within(screen.getByTestId('profile-card-covid-19')).getByText('Active signal')).toBeTruthy();
    expect(within(screen.getByTestId('profile-card-covid-19')).getByText('Critical')).toBeTruthy();
    // Non-signal profiles are shown apart, with their reasons.
    const others = within(section).getByRole('list', { name: 'Other profiles' });
    expect(within(others).getByText('Insufficient baseline')).toBeTruthy();
    expect(others.textContent).toContain('Gastrointestinal Syndrome');
  });

  it('keeps the default detail as Respiratory Viral Syndrome, exactly as before', async () => {
    atDay(5);
    renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    expect(screen.getByText('Respiratory Viral Syndrome | Worcester County, MA')).toBeTruthy();
    expect(selector().value).toBe('respiratory-viral-syndrome');
    expect(situationText()).toContain('87');
    expect(screen.getByText('Baseline 100 · 699 cumulative')).toBeTruthy();
  });

  it('shows all profiles, and a profile chosen from a card, through the URL', async () => {
    atDay(5);
    renderAt('/dashboard');
    const section = await screen.findByTestId('active-surveillance', {}, WAIT);
    fireEvent.click(within(section).getByRole('button', { name: 'All profiles' }));
    expect(lastSearch).toBe('?profile=all');
    expect(within(within(section).getByRole('list', { name: 'All profiles' })).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByTestId('profile-focus-note').textContent).toContain('COVID-19');

    fireEvent.click(within(screen.getByTestId('profile-card-influenza-a')).getByRole('button', { name: /View Influenza A/ }));
    expect(lastSearch).toBe('?profile=influenza-a');
    expect(screen.getByText('Influenza A | Worcester County, MA')).toBeTruthy();
    expect(situationText()).toContain('67');
    expect(screen.getByText('Baseline 33 · 234 cumulative')).toBeTruthy();
  });

  it('shows why an unscored profile has no score instead of a score', async () => {
    atDay(4);
    renderAt('/dashboard?profile=cholera');
    const heading = await screen.findByTestId('profile-heading', {}, WAIT);
    expect(heading.textContent).toContain('Cholera');
    expect(heading.textContent).toContain('Insufficient baseline');
    expect(heading.textContent).toContain('below the minimum of 10');
    expect(screen.queryByRole('region', { name: 'Current situation' })).toBeNull();
    // Data quality is still shown: it is source-wide.
    expect(screen.getByRole('heading', { name: /Data quality/ })).toBeTruthy();
  });

  it('falls back to the default for an unknown profile, and says so', async () => {
    atDay(2);
    renderAt('/dashboard?profile=plague');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    expect(screen.getByRole('status').textContent).toContain('“plague” is not a surveillance profile');
    expect(selector().value).toBe('respiratory-viral-syndrome');
  });

  it('changes profile from the keyboard-operable selector, and a refresh keeps it', async () => {
    atDay(5);
    const first = renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    fireEvent.change(selector(), { target: { value: 'rsv' } });
    expect(lastSearch).toBe('?profile=rsv');
    expect(screen.getByText('RSV | Worcester County, MA')).toBeTruthy();
    first.unmount();
    renderAt(`/dashboard${lastSearch}`);
    await screen.findByTestId('active-surveillance', {}, WAIT);
    expect(selector().value).toBe('rsv');
    // Options carry the status in words.
    const option = within(selector()).getByRole('option', { name: /^Cholera/ });
    expect(option.textContent).toBe('Cholera — Insufficient baseline');
  });
});

describe('profile-aware pages', () => {
  it('Map shows the selected profile only, with its small counts suppressed', async () => {
    atDay(1);
    renderAt('/map?profile=influenza-a');
    await screen.findByRole('heading', { level: 1, name: 'Outbreak Map' }, WAIT);
    expect(selector().value).toBe('influenza-a');
    const table = screen.getByRole('table');
    const row = within(table).getAllByRole('row')[1];
    // HOSP-A, Day 1: 14 Influenza A tests, 1 positive — withheld.
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells[3]).toBe('14');
    expect(cells[4]).toContain('<5');
    expect(cells[5]).toBe('<5');
  });

  it('Map shows no severity for a profile without a score', async () => {
    atDay(1);
    renderAt('/map?profile=cholera');
    await screen.findByRole('heading', { level: 1, name: 'Outbreak Map' }, WAIT);
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('No score')).toHaveLength(3);
    expect(within(table).queryByText('Low')).toBeNull();
  });

  it('Facilities follows the selected profile', async () => {
    atDay(5);
    renderAt('/facilities?profile=covid-19');
    await screen.findByRole('heading', { level: 1, name: 'Facilities' }, WAIT);
    expect(screen.getByTestId('profile-heading').textContent).toContain('COVID-19');
    expect(screen.getByTestId('profile-heading').textContent).toContain('93');
  });

  it('Laboratory Data filters to the profile’s tests', async () => {
    atDay(5);
    renderAt('/laboratory-data?profile=influenza-a');
    await screen.findByRole('heading', { level: 1 }, WAIT);
    const flu = OBSERVATIONS_BY_PROFILE['influenza-a'].length;
    await screen.findByText(`${flu} of 699 observations`, {}, WAIT);
    expect(screen.getByTestId('lab-profile-note').textContent).toContain('Each also counts towards Respiratory Viral Syndrome');
    fireEvent.change(selector(), { target: { value: 'cholera' } });
    await screen.findByText('9 of 9 observations', {}, WAIT);
    expect(screen.getByTestId('lab-profile-note').textContent).toContain('not in the API database');
    fireEvent.change(selector(), { target: { value: 'respiratory-viral-syndrome' } });
    await screen.findByText('699 of 699 observations', {}, WAIT);
  });

  it('Analytics follows the profile and never plots a missing score as 0', async () => {
    atDay(5);
    renderAt('/analytics?profile=cholera');
    await screen.findByRole('heading', { level: 1 }, WAIT);
    fireEvent.click(screen.getByRole('tab', { name: 'Signal Score' }));
    expect(screen.getAllByText('No score').length).toBeGreaterThanOrEqual(5);
  });

  it('Signals lists every profile’s alerts and acknowledges them', async () => {
    atDay(5);
    renderAt('/signals');
    await screen.findByRole('heading', { level: 1, name: 'Signals & Alerts' }, WAIT);
    // Default: the narrated profile, as before, with a pointer to the rest.
    expect(screen.getAllByRole('row')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'show all profiles' }));
    expect(lastSearch).toBe('?profile=all');
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Profile' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'Score' })).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(16);
    const ack = screen.getByRole('button', {
      name: 'Acknowledge alert: COVID-19 — Regional outbreak signal detected, detected on replay day 5',
    });
    fireEvent.click(ack);
    expect(screen.getByText('COVID-19 — Regional outbreak signal detected')).toBeTruthy(); // acknowledgement log
    // Only the narrated profile's regional signal opens the investigation view.
    expect(within(table).getAllByRole('button', { name: 'Investigate' })).toHaveLength(1);
  });

  it('explains that another profile’s alert has no investigation view yet', async () => {
    atDay(5);
    renderAt('/signals?alert=ALERT-COVID-19-REGIONAL-D5&view=detection');
    expect(await screen.findByText('Detailed investigation is not available for this profile yet', {}, WAIT)).toBeTruthy();
  });

  it('the sidebar carries the selected profile between profile-aware pages', async () => {
    atDay(5);
    renderAt('/dashboard?profile=rsv');
    await screen.findByTestId('active-surveillance', {}, WAIT);
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(within(nav).getByRole('link', { name: /Outbreak Map/ }).getAttribute('href')).toBe('/map?profile=rsv');
    expect(within(nav).getByRole('link', { name: /Reports/ }).getAttribute('href')).toBe('/reports');
  });

  it('Scenario Replay still narrates the five-day respiratory scenario', async () => {
    atDay(5);
    renderAt('/replay');
    await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' }, WAIT);
    expect(screen.getByText(/The narrated scenario is Respiratory Viral Syndrome/)).toBeTruthy();
  });
});
