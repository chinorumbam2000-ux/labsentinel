// @vitest-environment jsdom
/**
 * Live Surveillance is the primary, default experience; Scenario Replay is
 * the secondary training mode. Presentation and default-mode behaviour only:
 * the replay, the live dataset and the scores are unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { MODE_STORAGE_KEY } from '../../context/LiveSurveillanceContext';
import { getScoreForDay } from '../../lib/selectors';
import { ANALYST_SECTIONS } from '../../lib/navigation';
import { answerQuestion, answerText, suggestedQuestions } from '../../assistant/answerEngine';
import { buildLiveAssistantContext } from '../../assistant/liveContext';
import type { AssistantContext } from '../../assistant/types';
import { LiveSimulator } from '../../lib/live/simulator';
import { liveSummaries } from '../../lib/live/view';
import { signInForTest } from './signedIn';

vi.mock('../../components/map/OutbreakMap', () => ({
  default: () => <div data-testid="outbreak-map" />,
}));

const calls: string[] = [];

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
  // A fresh browser session: no stored mode.
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
const modeGroup = () => screen.getAllByRole('group', { name: 'Surveillance mode' })[0];
const pressed = (name: string) => within(modeGroup()).getByRole('button', { name }).getAttribute('aria-pressed');
const topBar = () => screen.getAllByRole('banner').find((el) => el.tagName === 'HEADER') as HTMLElement;

describe('default mode', () => {
  it('a fresh signed-in session opens the Dashboard in Live Surveillance, ready but not started', { timeout: 20000 }, async () => {
    expect(window.sessionStorage.getItem(MODE_STORAGE_KEY)).toBeNull();
    renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    expect(pressed('Live Surveillance')).toBe('true');
    expect(pressed('Scenario Replay')).toBe('false');
    // The live context, never the replay's values.
    expect(screen.getByTestId('dashboard-live')).toBeTruthy();
    const ready = screen.getByTestId('live-ready');
    expect(ready.textContent).toContain('Live Surveillance ready');
    expect(ready.textContent).toContain('Start Live Surveillance to begin receiving simulated source observations');
    expect(topBar().textContent).toContain('Live Surveillance · Simulated source feeds');
    expect(topBar().textContent).not.toMatch(/Replay Day|Day \d of 5/);
    expect(document.querySelector('main')?.textContent).not.toMatch(/Replay Day|Replay date/);
    expect(calls).toEqual([]);
  });

  it('the first page after sign-in is in Live Surveillance', { timeout: 20000 }, async () => {
    window.sessionStorage.clear();
    renderAt('/');
    fireEvent.change(await screen.findByLabelText('Name', undefined, WAIT), { target: { value: 'Avery Analyst' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'any-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    expect(pressed('Live Surveillance')).toBe('true');
    expect(screen.getByTestId('dashboard-live')).toBeTruthy();
  });

  it('a refresh of a fresh session stays in Live Surveillance; an explicit Scenario Replay choice is kept for the session', { timeout: 30000 }, async () => {
    let view = renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    view.unmount(); // a refresh: the app starts again with the same sessionStorage
    view = renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    expect(pressed('Live Surveillance')).toBe('true');

    fireEvent.click(within(modeGroup()).getByRole('button', { name: 'Scenario Replay' }));
    expect(window.sessionStorage.getItem(MODE_STORAGE_KEY)).toBe('replay');
    expect(screen.queryByTestId('dashboard-live')).toBeNull();
    view.unmount();
    view = renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    expect(pressed('Scenario Replay')).toBe('true');
    expect(screen.queryByTestId('dashboard-live')).toBeNull();

    fireEvent.click(within(modeGroup()).getByRole('button', { name: 'Live Surveillance' }));
    view.unmount();
    renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    expect(pressed('Live Surveillance')).toBe('true');
  });
});

describe('Live Surveillance first', () => {
  it('lists Live Surveillance before Scenario Replay in the mode switch, the sidebar and Explore', { timeout: 20000 }, async () => {
    renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    const buttons = within(modeGroup()).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Live Surveillance', 'Scenario Replay']);
    // The selected mode is said in words, not by colour alone.
    expect(screen.getAllByTestId('mode-caption')[0].textContent).toBe('Live Surveillance · Simulated source feeds');

    const overview = ANALYST_SECTIONS[0].items.map((item) => item.to);
    expect(overview.indexOf('/live')).toBeLessThan(overview.indexOf('/replay'));
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs.indexOf('/live')).toBeLessThan(hrefs.indexOf('/replay'));
    // Scenario Replay keeps its exact link name, with a smaller explanatory line beneath it.
    const replayLink = within(nav).getByRole('link', { name: 'Scenario Replay' });
    expect(replayLink.textContent).toContain('Historical training scenario');
    expect(replayLink.getAttribute('title')).toMatch(/^Historical training scenario/);
    expect(within(nav).getByRole('link', { name: 'Live Surveillance' }).getAttribute('title')).toMatch(/^Primary mode/);
  });

  it('Start Here recommends Live Surveillance, with Scenario Replay as the secondary path', async () => {
    renderAt('/dashboard');
    const strip = await screen.findByTestId('start-here', undefined, WAIT);
    const live = within(strip).getByRole('button', { name: '▶ Watch Live Surveillance' });
    const replay = within(strip).getByRole('link', { name: 'View Scenario Replay' });
    expect(live.className).toContain('ls-btn-primary');
    expect(replay.className).not.toMatch(/ls-btn-primary|\bls-btn\b/);
    expect(replay.getAttribute('href')).toBe('/replay');
    // Live comes first.
    expect(live.compareDocumentPosition(replay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('page headers and dates', () => {
  it('Live Surveillance says so, with the live surveillance date and no replay terms', async () => {
    renderAt('/live');
    await screen.findByRole('heading', { level: 1, name: 'Live Surveillance' }, WAIT);
    expect(screen.getByTestId('live-subtitle').textContent).toBe('Current simulated feed');
    const header = screen.getByRole('heading', { level: 1, name: 'Live Surveillance' }).closest('header') as HTMLElement;
    expect(header.textContent).toContain('Live surveillance date:');
    expect(header.textContent).not.toMatch(/Replay Day|Replay date|Day \d of 5/);
    expect(topBar().textContent).not.toMatch(/Replay Day|Day \d of 5/);
  });

  it('Scenario Replay says so, as a historical training scenario with replay dates and no live-feed terms', async () => {
    renderAt('/replay');
    await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' }, WAIT);
    expect(screen.getByTestId('replay-subtitle').textContent).toBe('Historical training scenario');
    expect(pressed('Scenario Replay')).toBe('true');
    const header = screen.getByRole('heading', { level: 1, name: 'Scenario Replay' }).closest('header') as HTMLElement;
    expect(header.textContent).toContain('Replay date:');
    expect(header.textContent).toContain('Replay Day 1 of 5');
    expect(header.textContent).not.toMatch(/Live surveillance date|simulated clock|Simulated source feeds/i);
    expect(topBar().textContent).not.toMatch(/Live surveillance date|Simulated source feeds/);
    expect(screen.getAllByTestId('mode-caption')[0].textContent).toBe('Scenario Replay · Historical training scenario');
  });

  it('Scenario Replay, reached from the live default, still scores 0 / 24 / 50 / 74 / 87', { timeout: 20000 }, async () => {
    renderAt('/dashboard');
    const strip = await screen.findByTestId('start-here', undefined, WAIT);
    fireEvent.click(within(strip).getByRole('link', { name: 'View Scenario Replay' }));
    await screen.findByRole('heading', { level: 1, name: 'Scenario Replay' }, WAIT);
    expect(pressed('Scenario Replay')).toBe('true');
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Next replay day' }));
    await within(topBar()).findByText(/Day 5 of 5/);
    expect([1, 2, 3, 4, 5].map((day) => getScoreForDay(day).composite)).toEqual([0, 24, 50, 74, 87]);
    const table = screen.getAllByRole('table').find((t) => within(t).queryByRole('columnheader', { name: 'Persistence' })) as HTMLElement;
    const scores = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => {
        const cells = within(row).getAllByRole('cell');
        return Number(cells[cells.length - 2]?.textContent);
      });
    expect(scores).toEqual([0, 24, 50, 74, 87]);
  });
});

describe('Roella on the two modes', () => {
  const sim = new LiveSimulator();
  sim.advance(600);
  const live: AssistantContext = {
    day: 1,
    route: 'dashboard',
    profiles: liveSummaries(sim),
    live: buildLiveAssistantContext(sim, { started: true, playing: true }),
  };
  const replay: AssistantContext = { day: 3, route: 'dashboard' };
  const ask = (q: string, ctx: AssistantContext) => {
    const a = answerQuestion(q, ctx).answer;
    return { intent: a.intent, text: answerText(a), followUps: a.followUps };
  };

  it('names Live Surveillance as the main mode', () => {
    for (const ctx of [live, replay]) {
      const a = ask('What is the main mode?', ctx);
      expect(a.intent).toBe('mode_main');
      expect(a.text).toContain('Live Surveillance is the main mode');
      expect(a.text).toContain('Scenario Replay is the secondary mode');
    }
    expect(ask('Which mode should I use?', replay).intent).toBe('mode_main');
  });

  it('explains Scenario Replay as a controlled historical training scenario', () => {
    for (const ctx of [live, replay]) {
      const a = ask('What is Scenario Replay?', ctx);
      expect(a.intent).toBe('mode_replay');
      expect(a.text).toContain('controlled historical training scenario');
      expect(a.text).toContain('known Respiratory Viral Activity outbreak progression');
      expect(a.text).toContain('not the current operational state');
    }
    expect(ask('What is Scenario Replay?', replay).text).toContain('Replay Day 3 of 5');
    expect(ask('What is Scenario Replay?', live).text).not.toMatch(/Replay Day \d/);
  });

  it('explains why the dates differ, without implying inconsistent data', () => {
    for (const ctx of [live, replay]) {
      const a = ask('Why are the dates different?', ctx);
      expect(a.intent).toBe('mode_dates');
      expect(a.text).toContain('separate synthetic scenarios');
      expect(a.text).toContain('intentionally independent');
      expect(a.text).toContain('Live Surveillance uses its own simulated feed timeline');
      expect(a.text).toContain('Scenario Replay preserves the original five-day historical training sequence');
      expect(a.text).toContain('The data is not inconsistent');
    }
    expect(ask('Why are the dates different?', live).text).toContain(`the live surveillance date is now ${live.live!.clock}`);
    expect(ask('Why do the modes have different dates?', replay).intent).toBe('mode_dates');
  });

  it('never suggests a replay day in Live Surveillance', () => {
    for (const route of ['dashboard', 'live', 'analytics', 'simulation', 'signals', 'map', 'hospitals', 'laboratory-data', 'other'] as const) {
      const starters = suggestedQuestions({ ...live, route });
      expect(starters.join(' | '), route).not.toMatch(/\bDay [1-5]\b/);
      expect(starters).toContain('What just changed?');
    }
    const starters = suggestedQuestions(live);
    for (const q of ['What just changed?', 'Which profiles need attention?', 'Are all sources active?', 'What is driving the selected signal?', 'Why did the score change?']) {
      expect(starters).toContain(q);
    }
    for (const q of ['Hello', 'How do I use the replay?', 'What does this page show?', 'What is Scenario Replay?', 'Which alerts are active?']) {
      const a = ask(q, { ...live, route: 'simulation' });
      expect(a.followUps.join(' | '), q).not.toMatch(/\bDay [1-5]\b/);
      expect(a.text, q).not.toMatch(/Replay Day \d of 5/);
    }
    // The live suggestions are answered from the live state.
    expect(ask('What is driving the selected signal?', live).intent).toBe('live_driver');
    expect(ask('Why did the score change?', live).intent).toBe('live_why');
    expect(ask('Are all sources active?', live).intent).toBe('live_sources');
  });

  it('the Ask Roella panel offers the live starters in Live Surveillance, and replay-day ones in Scenario Replay', { timeout: 20000 }, async () => {
    const chips = () =>
      within(screen.getByText('Suggested questions').parentElement as HTMLElement)
        .getAllByRole('button')
        .map((b) => b.textContent?.replace('→', '').trim());
    const view = renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    fireEvent.click(screen.getByRole('button', { name: /Ask Roella/i }));
    // Exactly the five live starters, in order — "Why did the score change?" included.
    expect(chips()).toEqual([
      'What just changed?',
      'Which profiles need attention?',
      'Are all sources active?',
      'What is driving the selected signal?',
      'Why did the score change?',
    ]);
    expect(screen.getByRole('button', { name: /Why did the score change\?/ })).toBeTruthy();
    expect(chips().join(' | ')).not.toMatch(/\bDay [1-5]\b/);
    view.unmount();
    window.sessionStorage.setItem(MODE_STORAGE_KEY, 'replay');
    renderAt('/dashboard');
    await screen.findByTestId('active-surveillance', undefined, WAIT);
    fireEvent.click(screen.getByRole('button', { name: /Ask Roella/i }));
    // Scenario Replay unchanged: its first four day-aware starters (Day 1 here).
    expect(chips()).toEqual(suggestedQuestions({ day: 1, route: 'dashboard' }).slice(0, 4));
    expect(chips()).toContain('What happens on Day 1?');
  });

  it('keeps Day 1 / Day 2 language in Scenario Replay', () => {
    expect(suggestedQuestions({ day: 1, route: 'dashboard' })).toContain('What happens on Day 1?');
    expect(suggestedQuestions({ day: 2, route: 'dashboard' })).toContain('What changed from Day 1 to Day 2?');
  });
});
