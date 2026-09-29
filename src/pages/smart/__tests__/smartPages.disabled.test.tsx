// @vitest-environment jsdom
/**
 * The default build (SMART disabled, local mode — as on GitHub Pages): SMART
 * routes show a notice only, the navigation is unchanged, and the SMART
 * client library is never even loaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock('fhirclient/browser', () => {
  loaded.count += 1;
  return { authorize: vi.fn(), ready: vi.fn() };
});

import App from '../../../App';
import { SMART_BUILD_CONFIG } from '../../../smart/config';

const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', async (input: string) => {
    calls.push(String(input));
    throw new Error('no requests expected');
  });
  Element.prototype.scrollTo = () => {};
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

describe('SMART disabled (default build)', () => {
  it('is disabled unless VITE_SMART_ENABLED=true', () => {
    expect(SMART_BUILD_CONFIG).toEqual({ ok: true, config: { enabled: false } });
  });

  it('shows Not Configured on the sandbox page, with no controls or navigation entry', async () => {
    renderAt('/smart-demo');
    expect(await screen.findByText('Not Configured')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Launch SMART Sandbox/ })).toBeNull();
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(nav.textContent).not.toContain('SMART Sandbox');
  });

  it.each([
    '/smart/launch?iss=https://launch.smarthealthit.org/v/r4/fhir&launch=abc',
    '/smart/callback?code=abc&state=xyz',
    '/smart/sidecar',
  ])('%s does nothing but explain', async (path) => {
    renderAt(path);
    expect(await screen.findByText('SMART sandbox integration is not enabled')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(loaded.count).toBe(0);
    expect(calls).toEqual([]);
  });
});
