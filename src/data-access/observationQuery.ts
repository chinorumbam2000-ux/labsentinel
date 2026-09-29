/**
 * The Laboratory Data table's filter, search, sort and paging rules.
 *
 * This is the prototype's browser-side behaviour, moved here unchanged from
 * LaboratoryDataPage so the local data source can serve it and the API data
 * source can be held to exactly the same results.
 */
import type { LabObservation, ObservationPage, ObservationQuery } from '../types';

/** The fields free-text search looks in, joined by single spaces. */
export const searchableText = (observation: LabObservation): string =>
  [
    observation.id,
    observation.patientId,
    observation.hospitalName,
    observation.vendor,
    observation.testName,
    observation.loincCode,
    observation.zipCode,
    observation.result,
  ]
    .join(' ')
    .toLowerCase();

export const queryObservations = (
  visibleObservations: LabObservation[],
  query: ObservationQuery,
): ObservationPage => {
  const term = query.search.trim().toLowerCase();

  const rows = visibleObservations.filter((observation) => {
    if (query.scope === 'today' && observation.day !== query.currentDay) return false;
    if (query.vendor !== 'all' && observation.vendor !== query.vendor) return false;
    if (query.hospitalId !== 'all' && observation.hospitalId !== query.hospitalId) return false;
    if (query.result !== 'all' && observation.result !== query.result) return false;
    if (query.testName !== 'all' && observation.testName !== query.testName) return false;
    if (query.day !== 'all' && observation.day !== Number(query.day)) return false;
    if (!term) return true;
    return searchableText(observation).includes(term);
  });

  const direction = query.sortDirection === 'asc' ? 1 : -1;
  const sorted = [...rows].sort(
    (a, b) => String(a[query.sortKey]).localeCompare(String(b[query.sortKey])) * direction,
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);

  return {
    rows: sorted.slice((page - 1) * query.pageSize, page * query.pageSize),
    total: sorted.length,
    page,
    totalPages,
    dayCount: visibleObservations.filter((o) => o.day === query.currentDay).length,
    cumulativeCount: visibleObservations.length,
  };
};
