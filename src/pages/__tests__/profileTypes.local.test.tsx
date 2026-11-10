// @vitest-environment jsdom
/**
 * Aggregate and pathogen-specific profiles on the analyst pages: the visible
 * name Respiratory Viral Activity, each profile's type in words, and the
 * selected-profile rule on every page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { MODE_STORAGE_KEY } from '../../context/LiveSurveillanceContext';
import { chooseScenarioReplayForTest, signInForTest } from './signedIn';
import { STORAGE_KEY as SIMULATION_KEY } from '../../lib/sessionState';

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

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
const WAIT = { timeout: 5000 };
const OLD = 'Respiratory Viral Syndrome';
const PAGES = ['/dashboard', '/replay', '/live', '/map', '/signals', '/signals?profile=all', '/facilities', '/laboratory-data', '/analytics', '/investigations', '/reports', '/overview', '/architecture'];
const atReplayDay5 = () => {
  const stored = JSON.parse(window.sessionStorage.getItem(SIMULATION_KEY) ?? '{}');
  window.sessionStorage.setItem(SIMULATION_KEY, JSON.stringify({ ...stored, currentDay: 5 }));
};

describe('the old name is gone from the analyst pages', () => {
  it.each(['replay', 'live'] as const)('%s mode', { timeout: 60000 }, async (mode) => {
    atReplayDay5();
    // /live belongs to Live Surveillance and /replay to Scenario Replay: each is checked in its own mode.
    for (const path of PAGES.filter((p) => p !== (mode === 'replay' ? '/live' : '/replay'))) {
      window.sessionStorage.setItem(MODE_STORAGE_KEY, mode);
      const view = renderAt(path);
      await screen.findByRole('heading', { level: 1 }, WAIT);
      expect(document.body.textContent, `${mode} ${path}`).not.toContain(OLD);
      expect(document.body.textContent, `${mode} ${path}`).not.toMatch(/surveillance syndrome/i);
      view.unmount();
    }
  });
});

describe('profile types on the Dashboard', () => {
  it('names Respiratory Viral Activity, with each profile’s type in words and the aggregate explained once', { timeout: 20000 }, async () => {
    chooseScenarioReplayForTest();
    atReplayDay5();
    renderAt('/dashboard?profile=all');
    const section = await screen.findByTestId('active-surveillance', undefined, WAIT);
    const typeOf = (id: string) => within(screen.getByTestId(`profile-card-${id}`)).getByTestId('profile-type').firstChild?.textContent;
    expect(within(screen.getByTestId('profile-card-respiratory-viral-syndrome')).getByRole('heading', { level: 3 }).textContent).toBe('Respiratory Viral Activity');
    expect(typeOf('respiratory-viral-syndrome')).toBe('Aggregate');
    expect(typeOf('gastrointestinal-syndrome')).toBe('Aggregate');
    for (const id of ['covid-19', 'rsv', 'influenza-a', 'cholera']) expect(typeOf(id), id).toBe('Pathogen');
    // The type is said in words for assistive technology too.
    expect(within(screen.getByTestId('profile-card-covid-19')).getByTestId('profile-type').textContent).toContain('Pathogen-specific surveillance');
    expect(section.textContent).toContain('scores are never combined');
    cleanup();
    renderAt('/dashboard');
    const heading = await screen.findByTestId('profile-heading', undefined, WAIT);
    expect(within(heading).getByRole('heading', { level: 2 }).textContent).toBe('Respiratory Viral Activity');
    expect(within(heading).getByTestId('profile-type').firstChild?.textContent).toBe('Aggregate');
    expect(within(heading).getAllByText(/Aggregate respiratory surveillance/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('This aggregate profile combines Influenza A, COVID-19 and RSV laboratory activity.')).toHaveLength(1);
    expect(screen.getByText('Respiratory Viral Activity | Worcester County, MA')).toBeTruthy();
  });

  it('a pathogen profile says its figures are that pathogen’s only', async () => {
    chooseScenarioReplayForTest();
    renderAt('/dashboard?profile=covid-19');
    const heading = await screen.findByTestId('profile-heading', undefined, WAIT);
    expect(within(heading).getByTestId('profile-type').firstChild?.textContent).toBe('Pathogen');
    expect(within(heading).getByTestId('profile-scope').textContent).toBe(
      'COVID-19 results only (SARS-CoV-2 RNA); they also count towards Respiratory Viral Activity.',
    );
  });

  it('the selector groups aggregate and pathogen-specific profiles', async () => {
    renderAt('/dashboard');
    const select = (await screen.findByLabelText('Surveillance profile', undefined, WAIT)) as HTMLSelectElement;
    const groups = [...select.querySelectorAll('optgroup')].map((g) => ({
      label: g.label,
      options: [...g.querySelectorAll('option')].map((o) => o.value),
    }));
    expect(groups).toEqual([
      { label: 'Portfolio', options: ['active', 'all'] },
      { label: 'Aggregate profiles', options: ['respiratory-viral-syndrome', 'gastrointestinal-syndrome'] },
      { label: 'Pathogen-specific profiles', options: ['influenza-a', 'covid-19', 'rsv', 'cholera'] },
    ]);
    expect(select.querySelector('option[value="respiratory-viral-syndrome"]')?.textContent).toMatch(/^Respiratory Viral Activity — /);
  });
});

describe('the selected-profile rule on each page', () => {
  it('Laboratory Data, Analytics, Facilities and Map say what the figures cover', { timeout: 30000 }, async () => {
    chooseScenarioReplayForTest();
    let view = renderAt('/laboratory-data');
    await screen.findByRole('heading', { level: 1 }, WAIT);
    expect(screen.getByTestId('lab-profile-note').textContent).toBe(
      'Respiratory Viral Activity (aggregate): every Influenza A, SARS-CoV-2 and RSV result in the replay feed.',
    );
    view.unmount();
    view = renderAt('/laboratory-data?profile=rsv');
    await screen.findByRole('heading', { level: 1 }, WAIT);
    expect(screen.getByTestId('lab-profile-note').textContent).toContain('RSV: the replay feed\'s RSV RNA results only. Each also counts towards Respiratory Viral Activity, the aggregate.');
    view.unmount();
    for (const [path, scope] of [
      ['/analytics', 'This aggregate profile combines Influenza A, COVID-19 and RSV laboratory activity.'],
      ['/analytics?profile=influenza-a', 'Influenza A results only (Influenza A RNA); they also count towards Respiratory Viral Activity.'],
      ['/facilities?profile=covid-19', 'COVID-19 results only (SARS-CoV-2 RNA); they also count towards Respiratory Viral Activity.'],
      ['/map?profile=rsv', 'RSV results only (RSV RNA); they also count towards Respiratory Viral Activity.'],
      ['/map', 'This aggregate profile combines Influenza A, COVID-19 and RSV laboratory activity.'],
    ] as const) {
      view = renderAt(path);
      const heading = await screen.findByTestId('profile-heading', undefined, WAIT);
      expect(within(heading).getByTestId('profile-scope').textContent, path).toBe(scope);
      view.unmount();
    }
  });

  it('Detection Methods names the profile it demonstrates', async () => {
    renderAt('/dynamic-surveillance');
    await screen.findByRole('heading', { level: 1 }, WAIT);
    expect(document.body.textContent).not.toContain(OLD);
  });
});
