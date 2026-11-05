// @vitest-environment jsdom
/**
 * The presentation sign-in, its route guard, the SMART routes it must never
 * block, and Ask Roella — through the whole application, in Local Demo Mode.
 *
 * The dashboard's Leaflet map cannot render in jsdom, so these tests sign in
 * from a deep link to another screen; the default return to /dashboard is
 * covered by src/lib/__tests__/demoSession.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { DEMO_SESSION_KEY } from '../../lib/demoSession';
import { STORAGE_KEY as SIMULATION_KEY } from '../../lib/sessionState';

const PASSWORD = 'Zq7-unique-Pw-8812';
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
  window.sessionStorage.clear();
  window.localStorage.clear();
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

const setInput = (id: string, value: string) =>
  fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });

const signIn = async (name = 'Avery Analyst', password = PASSWORD) => {
  await screen.findByRole('form', { name: 'Sign in to ProbeSyQ Signal' });
  setInput('signin-name', name);
  setInput('signin-password', password);
  fireEvent.submit(screen.getByRole('form', { name: 'Sign in to ProbeSyQ Signal' }));
};

const everythingStored = () =>
  JSON.stringify({ ...window.sessionStorage }) + JSON.stringify({ ...window.localStorage });

describe('presentation sign-in', () => {
  it('shows the ProbeSyQ Signal access screen with the PSQ mark and no Roella', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'ProbeSyQ Signal' })).toBeTruthy();
    expect(screen.getByText('Outbreak Intelligence')).toBeTruthy();
    expect(screen.getByText('Healthcare Technology Systems', { exact: false })).toBeTruthy();
    expect((screen.getByLabelText('Role') as HTMLInputElement).value).toBe('Public Health Analyst');
    expect(screen.queryByRole('button', { name: 'Ask Roella' })).toBeNull();
    expect(document.body.textContent).not.toContain('LabSentinel');
  });

  it('rejects a blank name, then a blank password', async () => {
    renderAt('/');
    const form = await screen.findByRole('form', { name: 'Sign in to ProbeSyQ Signal' });
    fireEvent.submit(form);
    expect(screen.getByText('Enter your name.')).toBeTruthy();
    setInput('signin-name', 'Avery Analyst');
    fireEvent.submit(form);
    expect(screen.queryByText('Enter your name.')).toBeNull();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(window.sessionStorage.getItem(DEMO_SESSION_KEY)).toBeNull();
  });

  it('returns to the deep link, shows the analyst in the top bar, and never stores the password', async () => {
    renderAt('/reports');
    await signIn();
    expect(await screen.findByRole('heading', { name: 'Public Health Reports' })).toBeTruthy();

    const header = screen.getAllByRole('banner').find((el) => el.tagName === 'HEADER') as HTMLElement;
    expect(within(header).getByText('Avery Analyst')).toBeTruthy();
    expect(within(header).getByText('Public Health Analyst')).toBeTruthy();
    expect(within(header).getByText('AA')).toBeTruthy();
    expect(within(header).queryByText('Demo User')).toBeNull();

    expect(JSON.parse(window.sessionStorage.getItem(DEMO_SESSION_KEY) ?? '{}')).toEqual({
      signedIn: true,
      name: 'Avery Analyst',
      role: 'Public Health Analyst',
    });
    expect(everythingStored()).not.toContain(PASSWORD);
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    expect(calls).toEqual([]);
  });

  it('keeps the session through a reload', async () => {
    renderAt('/reports');
    await signIn();
    await screen.findByRole('heading', { name: 'Public Health Reports' });
    cleanup();
    renderAt('/analytics');
    expect(await screen.findByRole('heading', { name: 'Trends & Analytics' })).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Sign in to ProbeSyQ Signal' })).toBeNull();
  });

  it('Sign Out ends only the sign-in session, not the simulation state', async () => {
    renderAt('/reports');
    await signIn();
    await screen.findByRole('heading', { name: 'Public Health Reports' });
    fireEvent.click(screen.getByRole('button', { name: 'Next simulation day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next simulation day' }));
    const header = () => screen.getAllByRole('banner').find((el) => el.tagName === 'HEADER') as HTMLElement;
    await within(header()).findByText(/Day 3 of 5/);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Out Avery Analyst' }));
    expect(await screen.findByRole('form', { name: 'Sign in to ProbeSyQ Signal' })).toBeTruthy();
    expect(window.sessionStorage.getItem(DEMO_SESSION_KEY)).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(SIMULATION_KEY) ?? '{}').day).toBe(3);
  });

  it('guards every application screen', async () => {
    for (const path of ['/dashboard', '/map', '/laboratory-data', '/signals', '/hospitals', '/analytics', '/simulation',
      '/reports', '/architecture', '/overview', '/fhir-ingestion', '/dynamic-surveillance', '/evaluation', '/smart-demo', '/nope']) {
      renderAt(path);
      expect(await screen.findByRole('form', { name: 'Sign in to ProbeSyQ Signal' }), path).toBeTruthy();
      cleanup();
    }
  });

  it('never blocks the SMART launch, callback or sidecar routes', async () => {
    for (const path of ['/smart/launch', '/smart/callback', '/smart/sidecar']) {
      renderAt(path);
      // Each SMART page renders its own content (a "not enabled" notice in this build), never the sign-in form.
      expect((await screen.findAllByText(/SMART/)).length, path).toBeGreaterThan(0);
      expect(screen.queryByRole('form', { name: 'Sign in to ProbeSyQ Signal' }), path).toBeNull();
      cleanup();
    }
  });
});

describe('Ask Roella', () => {
  const open = async () => {
    renderAt('/reports');
    await signIn();
    await screen.findByRole('heading', { name: 'Public Health Reports' });
    const launcher = screen.getByRole('button', { name: 'Ask Roella' });
    fireEvent.click(launcher);
    return { launcher, panel: await screen.findByRole('dialog', { name: /Roella/ }) };
  };

  const ask = (question: string) => {
    const input = screen.getByLabelText('Ask Roella a question');
    fireEvent.change(input, { target: { value: question } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
  };

  const lastAnswer = (panel: HTMLElement) => {
    const answers = panel.querySelectorAll('[data-from="assistant"]');
    return answers[answers.length - 1]?.textContent ?? '';
  };

  it('opens as Roella, focuses the input and offers suggestions', async () => {
    const { panel } = await open();
    expect(within(panel).getByRole('heading', { name: /Roella/ })).toBeTruthy();
    expect(within(panel).getByText('ProbeSyQ AI Assistant')).toBeTruthy();
    expect(within(panel).getByText(/Ask about active signals, trends, facilities, geography, analytics, or how ProbeSyQ Signal works\./)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Ask Roella a question'));
    expect(within(panel).getByText('Suggested questions')).toBeTruthy();
    expect(panel.textContent).not.toContain('LabSentinel');
  });

  it('answers from the data on screen, labels answers Roella, and sends nothing', async () => {
    const { panel } = await open();
    ask('What is the current score?');
    expect(lastAnswer(panel)).toContain('0 out of 100');
    expect(lastAnswer(panel)).toContain('Roella');
    ask('Should I take antibiotics?');
    expect(lastAnswer(panel)).toContain("I don't provide individual medical diagnosis or treatment advice.");
    ask('What is my password?');
    expect(lastAnswer(panel)).not.toContain(PASSWORD);
    expect(panel.textContent).not.toContain(PASSWORD);
    expect(calls).toEqual([]);
  });

  it('closes on Escape and returns focus to the launcher', async () => {
    const { panel } = await open();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Roella/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ask Roella' }));
  });
});
