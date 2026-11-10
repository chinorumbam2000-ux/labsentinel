// @vitest-environment jsdom
/**
 * useObservationPage reads the data source only when given a query: `null`
 * (Live Surveillance, portfolio profiles) requests nothing, from either the
 * local (sync) source or the API source.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { DataSourceProvider, createDataSource } from '../DataSourceProvider';
import { useObservationPage } from '../hooks';
import type { LabSentinelDataSource } from '../types';
import type { ObservationQuery } from '../../types';

afterEach(() => cleanup());

const QUERY: ObservationQuery = {
  currentDay: 3, scope: 'cumulative', search: '', vendor: 'all', hospitalId: 'all', result: 'all',
  testName: 'all', day: 'all', sortKey: 'effectiveDateTime', sortDirection: 'desc', page: 1, pageSize: 10,
};
const EMPTY_PAGE = { rows: [], total: 7, page: 1, totalPages: 1, dayCount: 0, cumulativeCount: 7 };

function Probe({ query }: { query: ObservationQuery | null }) {
  const state = useObservationPage(query);
  return <p data-testid="state">{state.status === 'ready' ? `ready ${state.page.total}` : state.status}</p>;
}

const renderWith = (source: LabSentinelDataSource, query: ObservationQuery | null) =>
  render(
    <DataSourceProvider configResult={{ ok: true, config: { mode: source.mode === 'api' ? 'api' : 'local', apiBaseUrl: 'http://api.test' } as never }} source={source}>
      <Probe query={query} />
    </DataSourceProvider>,
  );

describe('useObservationPage', () => {
  it('API source: no request for a null query; one for a real query', async () => {
    const getObservations = vi.fn(async (_query: ObservationQuery, _signal?: AbortSignal) => EMPTY_PAGE);
    const api = {
      mode: 'api', label: 'test', getObservations,
      checkHealth: async () => ({ status: 'healthy' }),
    } as unknown as LabSentinelDataSource;
    const idle = renderWith(api, null);
    expect(screen.getByTestId('state').textContent).toBe('idle');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getObservations).not.toHaveBeenCalled();
    idle.unmount();
    renderWith(api, QUERY);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready 7'));
    expect(getObservations).toHaveBeenCalledTimes(1);
    expect(getObservations.mock.calls[0][0]).toEqual(QUERY);
  });

  it('local (static) source: no synchronous read for a null query; unchanged for a real one', () => {
    const local = createDataSource({ mode: 'local' } as never);
    const spy = vi.spyOn(local.sync!, 'observations');
    const idle = renderWith(local, null);
    expect(screen.getByTestId('state').textContent).toBe('idle');
    expect(spy).not.toHaveBeenCalled();
    idle.unmount();
    renderWith(local, QUERY);
    expect(screen.getByTestId('state').textContent).toMatch(/^ready \d+$/);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
