// @vitest-environment jsdom
/**
 * The public identity: the sign-in button, the sidebar scrollbar, the GitHub
 * Pages path (/signal-by-probesyq/) and the ownership notice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { COPYRIGHT_NOTICE, OWNER_LEGAL_NAME, TRADEMARK_NOTICE } from '../../lib/brand';
import { signInForTest } from './signedIn';
import viteConfig from '../../../vite.config.ts?raw';
import tailwindConfig from '../../../tailwind.config.js?raw';
import indexHtml from '../../../index.html?raw';
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

describe('sign-in', () => {
  it('the button reads exactly "Sign in"', async () => {
    renderAt('/');
    const button = await screen.findByRole('button', { name: 'Sign in' }, WAIT);
    expect(button.textContent?.trim()).toBe('Sign in');
    expect(button.getAttribute('type')).toBe('submit');
    expect(screen.queryByRole('button', { name: /Sign in to/ })).toBeNull();
  });
});

describe('ownership notice', () => {
  it('claims ™ only — never ® — and names no invented company', () => {
    expect(TRADEMARK_NOTICE).toContain('ProbeSyQ™');
    expect(TRADEMARK_NOTICE).toContain('Signal by ProbeSyQ™');
    expect(OWNER_LEGAL_NAME).toBe('Munyaradzi Chinorumba');
    expect(COPYRIGHT_NOTICE).toBe('© 2026 Munyaradzi Chinorumba. All rights reserved.');
    expect(`${TRADEMARK_NOTICE} ${COPYRIGHT_NOTICE}`).not.toMatch(/\[|OWNER LEGAL NAME/);
    for (const text of [TRADEMARK_NOTICE, COPYRIGHT_NOTICE]) {
      expect(text).not.toContain('®');
      expect(text).not.toMatch(/\b(LLC|Inc\.?|Corporation|Corp\.)\b/);
    }
  });

  it('is shown on the sign-in screen and in About this data', { timeout: 20000 }, async () => {
    renderAt('/');
    const onSignIn = await screen.findByTestId('ownership-notice', undefined, WAIT);
    expect(onSignIn.textContent).toContain('Signal by ProbeSyQ™');
    expect(onSignIn.textContent).toContain('All rights reserved.');
    cleanup();
    signInForTest();
    renderAt('/overview#about-the-data');
    const notice = await screen.findByTestId('ownership-notice', undefined, WAIT);
    expect(document.getElementById('about-the-data')?.contains(notice)).toBe(true);
  });

  it('is not on the analyst working screens', { timeout: 30000 }, async () => {
    signInForTest();
    for (const path of ['/dashboard', '/live', '/replay', '/analytics']) {
      const view = renderAt(path);
      await screen.findByRole('heading', { level: 1 }, WAIT);
      expect(screen.queryByTestId('ownership-notice'), path).toBeNull();
      expect(document.body.textContent, path).not.toContain('®');
      view.unmount();
    }
  });
});

describe('sidebar scrollbar', () => {
  it('the nav list uses the sidebar scrollbar style', async () => {
    signInForTest();
    renderAt('/dashboard');
    const scroller = (await screen.findAllByTestId('sidebar-scroll', undefined, WAIT))[0];
    expect(scroller.className).toContain('ls-sidebar-scroll');
  });

  it('the sidebar colour stays the one token the scrollbar track is drawn from', () => {
    // Vitest does not load CSS; the computed scrollbar colours (track = this
    // token, light thumb) are asserted in a real browser by the release checks.
    expect(tailwindConfig).toMatch(/sidebar:\s*'#0B1F33'/);
  });
});

describe('GitHub Pages path', () => {
  it('builds for /signal-by-probesyq/ by default', () => {
    expect(viteConfig).toContain("export const PAGES_BASE_PATH = '/signal-by-probesyq/';");
    expect(viteConfig).toContain('|| PAGES_BASE_PATH;');
    expect(viteConfig).not.toContain("'/labsentinel/'");
  });

  it('the 404 fallback and index restore keep the first segment, whatever the repository name', () => {
    expect(notFoundHtml).toContain('var pathSegmentsToKeep = 1;');
    expect(notFoundHtml).toContain('/signal-by-probesyq/dashboard');
    expect(notFoundHtml).not.toContain('/labsentinel');
    expect(indexHtml).toContain('function restoreRoute(l)');
    expect(indexHtml).toContain('%BASE_URL%favicon.svg');
    expect(indexHtml).not.toContain('/labsentinel');
  });
});
