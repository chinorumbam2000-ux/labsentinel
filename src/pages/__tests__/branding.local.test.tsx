// @vitest-environment jsdom
/**
 * The product is "Signal by ProbeSyQ" (Outbreak Intelligence); ProbeSyQ is
 * the company. "Signal" leads and "by ProbeSyQ" is secondary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { PRODUCT_NAME, PRODUCT_SHORT_NAME, PRODUCT_TAGLINE, withProductName } from '../../lib/brand';
import { signInForTest } from './signedIn';
import indexHtml from '../../../index.html?raw';

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

describe('Signal by ProbeSyQ', () => {
  it('names the product consistently', () => {
    expect(PRODUCT_NAME).toBe('Signal by ProbeSyQ');
    expect(PRODUCT_SHORT_NAME).toBe('Signal');
    expect(PRODUCT_TAGLINE).toBe('Outbreak Intelligence');
    expect(withProductName('LabSentinel raises a signal.')).toBe('Signal by ProbeSyQ raises a signal.');
  });

  it('sets the browser title', () => {
    const html = indexHtml;
    expect(html).toContain('<title>Signal by ProbeSyQ — Outbreak Intelligence</title>');
    expect(html).not.toContain('ProbeSyQ Signal');
  });

  it('leads the sign-in screen with "Signal", then "by ProbeSyQ"', async () => {
    renderAt('/');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Signal by ProbeSyQ' });
    // "by ProbeSyQ" is a quieter, secondary part of the heading.
    expect(heading.firstChild?.textContent?.trim()).toBe('Signal');
    expect(within(heading).getByText('by ProbeSyQ').className).toMatch(/text-muted/);
    expect(screen.getByText('Outbreak Intelligence')).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Sign in to Signal by ProbeSyQ' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('ProbeSyQ Signal');
  });

  it('brands the sidebar the same way', async () => {
    signInForTest();
    renderAt('/reports');
    await screen.findByRole('heading', { level: 1 });
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(nav.textContent).toContain('Signal by ProbeSyQ');
    expect(within(nav).getByText('by ProbeSyQ').className).toMatch(/text-white\/60/);
    expect(nav.textContent).toContain('Outbreak Intelligence');
    expect(document.body.textContent).not.toContain('ProbeSyQ Signal');
  });
});
