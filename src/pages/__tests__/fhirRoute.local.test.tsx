// @vitest-environment jsdom
/**
 * Local Demo Mode (the default, and the GitHub Pages build): the FHIR route
 * exists only as a notice, the navigation is unchanged, and nothing is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FHIR ingestion route in Local Demo Mode', () => {
  it('shows an informational page, no controls, no navigation entry and no requests', async () => {
    render(
      <MemoryRouter initialEntries={['/fhir-ingestion']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('FHIR ingestion requires LabSentinel API Capstone Mode.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ingest Synthetic FHIR' })).toBeNull();
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(nav.textContent).toContain('Laboratory Data');
    expect(nav.textContent).not.toContain('FHIR Ingestion');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toEqual([]);
  });

  it('shows the Dynamic Surveillance route as a notice only, with no navigation entry and no requests', async () => {
    render(
      <MemoryRouter initialEntries={['/dynamic-surveillance']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Dynamic Surveillance requires LabSentinel API Capstone Mode.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Recalculate Dynamic Surveillance' })).toBeNull();
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(nav.textContent).not.toContain('Dynamic Surveillance');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toEqual([]);
  });

  it('shows the Capstone Evaluation route as a notice only, with no navigation entry and no requests', async () => {
    render(
      <MemoryRouter initialEntries={['/evaluation']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('The Capstone Evaluation requires LabSentinel API Capstone Mode.')).toBeTruthy();
    expect(screen.queryByLabelText('Scenario')).toBeNull();
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(nav.textContent).not.toContain('Capstone Evaluation');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toEqual([]);
  });
});
