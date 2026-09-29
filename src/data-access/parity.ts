/**
 * Local-versus-API parity: the two data sources must yield identical frontend
 * domain values.
 *
 * Used by scripts/verify-api-parity.ts against a live backend, and by the
 * unit tests against recorded API responses. Not imported by the application.
 */
import type { ObservationQuery, SimulationDay } from '../types';
import { canonicalJson } from './canonical';
import type { LabSentinelDataSource } from './types';

const DAYS: SimulationDay[] = [1, 2, 3, 4, 5];

const base = (overrides: Partial<ObservationQuery>): ObservationQuery => ({
  currentDay: 5,
  scope: 'cumulative',
  search: '',
  vendor: 'all',
  hospitalId: 'all',
  result: 'all',
  testName: 'all',
  day: 'all',
  sortKey: 'effectiveDateTime',
  sortDirection: 'desc',
  page: 1,
  pageSize: 10,
  ...overrides,
});

/** Laboratory Data queries covering every filter, search, sort and paging rule. */
export const PARITY_OBSERVATION_QUERIES: Array<{ name: string; query: ObservationQuery }> = [
  { name: 'default view, Day 1', query: base({ currentDay: 1 }) },
  { name: 'default view, Day 5', query: base({}) },
  { name: 'Day 3, page 4', query: base({ currentDay: 3, page: 4 }) },
  { name: 'page beyond the end clamps', query: base({ currentDay: 2, page: 999 }) },
  { name: 'today only', query: base({ currentDay: 4, scope: 'today' }) },
  { name: 'today with a conflicting day filter', query: base({ currentDay: 4, scope: 'today', day: 2 }) },
  { name: 'day filter', query: base({ day: 2 }) },
  { name: 'hospital filter', query: base({ hospitalId: 'HOSP-B' }) },
  { name: 'vendor filter', query: base({ vendor: 'MEDITECH', page: 2 }) },
  { name: 'result filter', query: base({ result: 'Positive' }) },
  { name: 'test filter', query: base({ testName: 'RSV RNA' }) },
  { name: 'search patient id', query: base({ search: 'SYN-P0042' }) },
  { name: 'search across two fields', query: base({ search: 'epic sars' }) },
  { name: 'search, mixed case and padding', query: base({ search: '  Worcester Central  ' }) },
  { name: 'search with no match', query: base({ search: 'no-such-thing' }) },
  { name: 'sort hospital ascending', query: base({ sortKey: 'hospitalName', sortDirection: 'asc' }) },
  { name: 'sort vendor descending', query: base({ sortKey: 'vendor', sortDirection: 'desc', page: 3 }) },
  { name: 'sort patient ascending', query: base({ sortKey: 'patientId', sortDirection: 'asc' }) },
  { name: 'sort result descending', query: base({ sortKey: 'result', sortDirection: 'desc' }) },
  { name: 'sort test ascending, page 7', query: base({ sortKey: 'testName', sortDirection: 'asc', page: 7 }) },
  {
    name: 'everything combined',
    query: base({
      currentDay: 5,
      hospitalId: 'HOSP-A',
      vendor: 'Epic',
      result: 'Positive',
      testName: 'Influenza A RNA',
      search: 'obs',
      sortKey: 'patientId',
      sortDirection: 'asc',
    }),
  },
];

const describe = canonicalJson;

/** Every difference between the two sources; empty means full parity. */
export const compareDataSources = async (
  local: LabSentinelDataSource,
  api: LabSentinelDataSource,
): Promise<string[]> => {
  const problems: string[] = [];
  const check = (label: string, localValue: unknown, apiValue: unknown) => {
    if (describe(localValue) !== describe(apiValue)) {
      problems.push(`${label}\n    local: ${describe(localValue)}\n    api:   ${describe(apiValue)}`);
    }
  };

  check('facilities', await local.getFacilities(), await api.getFacilities());
  check('facility HOSP-C', await local.getFacility('HOSP-C'), await api.getFacility('HOSP-C'));
  check('signal history (all days)', await local.getSignals(), await api.getSignals());
  for (const day of DAYS) {
    check(`demo summary, Day ${day}`, await local.getDemoSummary(day), await api.getDemoSummary(day));
    check(`current signal, Day ${day}`, await local.getCurrentSignal(day), await api.getCurrentSignal(day));
  }
  for (const id of ['OBS-0001', 'OBS-0350', 'OBS-0699']) {
    check(`observation ${id}`, await local.getObservation(id), await api.getObservation(id));
  }
  for (const { name, query } of PARITY_OBSERVATION_QUERIES) {
    check(`observations: ${name}`, await local.getObservations(query), await api.getObservations(query));
  }
  return problems;
};
