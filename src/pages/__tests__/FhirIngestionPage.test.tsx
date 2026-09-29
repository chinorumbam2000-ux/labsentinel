// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FhirIngestionPage, { DEMO_WINDOW_NOTE, SYNTHETIC_NOTICE } from '../FhirIngestionPage';
import { DataSourceProvider } from '../../data-access/DataSourceProvider';
import { BASE, fakeBackend, type FakeBackend } from './fakeFhirBackend';

let backend: FakeBackend;

const renderPage = (mode: 'api' | 'local' = 'api') =>
  render(
    <DataSourceProvider configResult={{ ok: true, config: { mode, apiBaseUrl: BASE } }}>
      <FhirIngestionPage />
    </DataSourceProvider>,
  );

const useBackend = (options?: Parameters<typeof fakeBackend>[0]) => {
  backend = fakeBackend(options);
  vi.stubGlobal('fetch', backend.fetch);
};

const waitForReady = () => screen.findByRole('option', { name: 'Influenza A positive Observation' });

const loadAndIngest = async (exampleId: string) => {
  fireEvent.change(screen.getByLabelText('Example fixture'), { target: { value: exampleId } });
  fireEvent.click(screen.getByRole('button', { name: 'Load Example' }));
  await waitFor(() => expect((screen.getByLabelText('Synthetic FHIR JSON') as HTMLTextAreaElement).value).not.toBe(''));
  fireEvent.click(screen.getByRole('button', { name: 'Ingest Synthetic FHIR' }));
};

const summaryValue = (label: string) => {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.nextElementSibling?.textContent;
};

beforeEach(() => useBackend());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FHIR ingestion page — Local Demo Mode', () => {
  it('shows only an informational notice and makes no requests', async () => {
    renderPage('local');

    expect(screen.getByText('FHIR ingestion requires LabSentinel API Capstone Mode.')).toBeTruthy();
    expect(screen.getByText(SYNTHETIC_NOTICE, { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ingest Synthetic FHIR' })).toBeNull();
    expect(screen.queryByLabelText('Synthetic FHIR JSON')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backend.calls).toEqual([]);
  });
});

describe('FHIR ingestion page — API Capstone Mode', () => {
  it('shows real backend status and the synthetic-data banner', async () => {
    renderPage();
    await waitForReady();

    const status = screen.getByRole('region', { name: 'Backend status' });
    await waitFor(() => expect(within(status).getAllByText('Connected')).toHaveLength(3));
    expect(screen.getByText('SYNTHETIC DEVELOPMENT DATA ONLY')).toBeTruthy();
    expect(screen.getByText(DEMO_WINDOW_NOTE)).toBeTruthy();
    expect(backend.calls).toContain('GET /api/health/database');
  });

  it('loads fixtures from the backend catalogue', async () => {
    renderPage();
    await waitForReady();
    expect(screen.getByRole('group', { name: 'Bundle' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Non-laboratory Observation' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Example fixture'), { target: { value: 'influenza-a-positive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load Example' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Synthetic FHIR JSON') as HTMLTextAreaElement).value).toContain('"92142-9"'),
    );
    expect(backend.calls).toContain('GET /api/fhir/examples/influenza-a-positive');
  });

  it('ingests, then shows the pipeline and the normalized record', async () => {
    renderPage();
    await waitForReady();
    await loadAndIngest('influenza-a-positive');

    await screen.findByText('✓ Ingested');
    expect(summaryValue('Created')).toBe('1');
    expect(summaryValue('Duplicates')).toBe('0');
    expect(backend.calls).toContain('POST /api/fhir/ingest');

    const pipeline = screen.getByRole('list', { name: 'Ingestion pipeline' });
    expect(within(pipeline).getAllByText('Success')).toHaveLength(6);

    const normalized = await screen.findByRole('region', { name: 'Normalized LabSentinel record' });
    const sourceFhir = screen.getByRole('region', { name: 'Source FHIR' });
    expect(within(sourceFhir).getByText(/92142-9/)).toBeTruthy();
    expect(within(normalized).getByText('A-FLU-20260112-0001')).toBeTruthy();
    expect(within(normalized).getByText('Influenza A RNA')).toBeTruthy();
    expect(within(normalized).getByText('Respiratory Viral Syndrome')).toBeTruthy();
    expect(within(normalized).getByText('Positive')).toBeTruthy();
    expect(within(normalized).getByText('01604')).toBeTruthy();
    expect(within(normalized).getByText(/^FHIR-PT-/)).toBeTruthy();
    // The source subject reference is shown only as "not stored".
    expect(within(sourceFhir).getByText(/\(not stored\)/)).toBeTruthy();
    expect(screen.getByText('Performer logical identifier (urn:labsentinel:facility-code)')).toBeTruthy();
    expect(screen.getByText('Simulated Epic Environment')).toBeTruthy();
    expect(screen.getByText('When LabSentinel ingested the FHIR resource.')).toBeTruthy();
    expect(
      screen.getByText(
        'Facility mappings are synthetic development configuration and do not represent live vendor connectivity.',
      ),
    ).toBeTruthy();
  });

  it('shows a duplicate on the second ingestion, from the real response', async () => {
    renderPage();
    await waitForReady();
    await loadAndIngest('influenza-a-positive');
    await screen.findByText('✓ Ingested');

    fireEvent.click(screen.getByRole('button', { name: 'Ingest Again' }));

    await screen.findByText('Duplicate detected.');
    expect(summaryValue('Created')).toBe('0');
    expect(summaryValue('Duplicates')).toBe('1');
    expect(
      screen.getByText(/LabSentinel detected the same source system \+ source observation ID/),
    ).toBeTruthy();
    const pipeline = screen.getByRole('list', { name: 'Ingestion pipeline' });
    expect(within(pipeline).getByText(/nothing written/)).toBeTruthy();
  });

  it('renders structured errors without claiming later stages succeeded', async () => {
    renderPage();
    await waitForReady();
    await loadAndIngest('vital-signs');

    await screen.findByText('✕ Rejected');
    expect(summaryValue('Rejected')).toBe('1');
    const issues = screen.getByRole('list', { name: 'Structured ingestion issues' });
    expect(within(issues).getByText('NON_LAB_OBSERVATION')).toBeTruthy();
    expect(
      within(issues).getByText('This Observation does not meet LabSentinel laboratory-surveillance criteria.'),
    ).toBeTruthy();
    const pipeline = screen.getByRole('list', { name: 'Ingestion pipeline' });
    expect(within(pipeline).getByText('Failed')).toBeTruthy();
    expect(within(pipeline).getAllByText('Not reached')).toHaveLength(4);
    expect(screen.queryByText('Normalized LabSentinel record')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Traceback|stack/i);
  });

  it('renders a request-level rejection for malformed JSON', async () => {
    renderPage();
    await waitForReady();
    await loadAndIngest('malformed-json');

    await screen.findByText('HTTP 400');
    const issues = screen.getByRole('list', { name: 'Structured ingestion issues' });
    expect(within(issues).getByText('INVALID_FHIR')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeTruthy();
  });

  it('explains a Bundle and lets each Observation be inspected', async () => {
    renderPage();
    await waitForReady();
    await loadAndIngest('respiratory-panel-bundle');

    await screen.findByText('Bundle contents');
    expect(summaryValue('Resources received')).toBe('8');
    expect(summaryValue('Created')).toBe('3');
    expect(
      screen.getByText('1 Organization · 1 Location · 1 Specimen · 1 DiagnosticReport · 3 Observations · 1 Patient'),
    ).toBeTruthy();
    expect(screen.getByText(/best effort per Observation/)).toBeTruthy();

    const selector = screen.getByLabelText('Observation in this submission');
    expect(within(selector).getAllByRole('option')).toHaveLength(3);
    fireEvent.change(selector, { target: { value: '1' } });
    await screen.findByText('C-PANEL-20260116-0001-SARS');
  });

  it('shows the recent FHIR ingestions from the filtered read API', async () => {
    renderPage();
    await screen.findByText('Recent FHIR ingestions');
    expect(backend.calls).toContain('GET /api/observations?origin=fhir&sort=received_datetime&order=desc&limit=8');
    expect((await screen.findAllByText('C-PANEL-20260116-0001-FLUA')).length).toBeGreaterThan(0);
  });

  it('reports the API as unavailable and recovers on Retry', async () => {
    useBackend({ down: true });
    renderPage();

    await screen.findByText('LabSentinel API is currently unavailable.');
    expect(screen.queryByRole('button', { name: 'Ingest Synthetic FHIR' })).toBeNull();

    backend.setDown(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitForReady();
    expect(screen.getByRole('button', { name: 'Ingest Synthetic FHIR' })).toBeTruthy();
  });

  it('explains when the backend is not in development mode', async () => {
    useBackend({ disabled: true });
    renderPage();
    await screen.findByText('FHIR ingestion is disabled on this backend');
    expect(screen.queryByRole('button', { name: 'Ingest Synthetic FHIR' })).toBeNull();
  });
});
