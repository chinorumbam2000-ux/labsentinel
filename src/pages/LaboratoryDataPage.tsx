import { useEffect, useMemo, useState } from 'react';
import { useSimulation } from '../context/SimulationContext';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { HOSPITALS } from '../data/hospitals';
import { LAB_TESTS } from '../data/tests';
import { formatDateTime } from '../lib/format';
import type { LabObservation } from '../types';

type SortKey = 'effectiveDateTime' | 'hospitalName' | 'vendor' | 'patientId' | 'result' | 'testName';
type SortDirection = 'asc' | 'desc';

const ROWS_PER_PAGE = 10;
const VENDORS = ['Epic', 'Oracle Health', 'MEDITECH'] as const;
const RESULTS = ['Positive', 'Negative'] as const;

const COLUMNS: Array<{ key: SortKey | null; label: string; className?: string }> = [
  { key: 'effectiveDateTime', label: 'Date/Time' },
  { key: 'hospitalName', label: 'Hospital' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'patientId', label: 'Patient ID' },
  { key: 'result', label: 'Result' },
  { key: 'testName', label: 'Test' },
  { key: null, label: 'LOINC' },
  { key: null, label: 'ZIP Code' },
  { key: null, label: 'FHIR Status' },
];

export default function LaboratoryDataPage() {
  const {
    currentDay,
    visibleObservations,
    observationCounts,
    isLoading,
    error,
    clearError,
  } = useSimulation();

  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [hospitalFilter, setHospitalFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [testFilter, setTestFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [scope, setScope] = useState<'cumulative' | 'today'>('cumulative');
  const [sortKey, setSortKey] = useState<SortKey>('effectiveDateTime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);

  // Stepping the simulation backwards can strand the day filter on a day that
  // is no longer visible; fall back to "all days" instead of an empty table.
  useEffect(() => {
    if (dayFilter !== 'all' && Number(dayFilter) > currentDay) {
      setDayFilter('all');
      setPage(1);
    }
  }, [currentDay, dayFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    const rows = visibleObservations.filter((observation) => {
      if (scope === 'today' && observation.day !== currentDay) return false;
      if (vendorFilter !== 'all' && observation.vendor !== vendorFilter) return false;
      if (hospitalFilter !== 'all' && observation.hospitalId !== hospitalFilter) return false;
      if (resultFilter !== 'all' && observation.result !== resultFilter) return false;
      if (testFilter !== 'all' && observation.testName !== testFilter) return false;
      if (dayFilter !== 'all' && observation.day !== Number(dayFilter)) return false;
      if (!term) return true;
      return [
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
        .toLowerCase()
        .includes(term);
    });

    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...rows].sort(
      (a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * direction,
    );
  }, [
    visibleObservations,
    scope,
    currentDay,
    search,
    vendorFilter,
    hospitalFilter,
    resultFilter,
    testFilter,
    dayFilter,
    sortKey,
    sortDirection,
  ]);

  const scopeTotal =
    scope === 'today' ? observationCounts.day : observationCounts.cumulative;
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * ROWS_PER_PAGE,
    safePage * ROWS_PER_PAGE,
  );

  const resetFilters = () => {
    setSearch('');
    setVendorFilter('all');
    setHospitalFilter('all');
    setResultFilter('all');
    setTestFilter('all');
    setDayFilter('all');
    setScope('cumulative');
    setPage(1);
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const hasActiveFilters =
    scope !== 'cumulative' ||
    search.trim() !== '' ||
    vendorFilter !== 'all' ||
    hospitalFilter !== 'all' ||
    resultFilter !== 'all' ||
    testFilter !== 'all' ||
    dayFilter !== 'all';

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Laboratory Observations — FHIR
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Normalized synthetic laboratory observations received from participating
            healthcare organizations. Every test counted in the regional and hospital
            totals has a record here — the table reconciles exactly with those figures.
            All patient identifiers are synthetic placeholders.
          </p>
        </div>
        <PageMeta />
      </header>

      <Card bodyClassName="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="lab-search" className="ls-label">
              Search
            </label>
            <input
              id="lab-search"
              type="search"
              className="ls-input mt-1"
              placeholder="Patient ID, hospital, test, LOINC, ZIP…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <label htmlFor="filter-scope" className="ls-label">Scope</label>
            <select
              id="filter-scope"
              className="ls-select mt-1 block"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as 'cumulative' | 'today');
                setPage(1);
              }}
            >
              <option value="cumulative">Cumulative through Day {currentDay}</option>
              <option value="today">Day {currentDay} only</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-hospital" className="ls-label">Hospital</label>
            <select
              id="filter-hospital"
              className="ls-select mt-1 block"
              value={hospitalFilter}
              onChange={(event) => {
                setHospitalFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All hospitals</option>
              {HOSPITALS.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-vendor" className="ls-label">Vendor</label>
            <select
              id="filter-vendor"
              className="ls-select mt-1 block"
              value={vendorFilter}
              onChange={(event) => {
                setVendorFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All vendors</option>
              {VENDORS.map((vendor) => (
                <option key={vendor} value={vendor}>
                  {vendor}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-result" className="ls-label">Result</label>
            <select
              id="filter-result"
              className="ls-select mt-1 block"
              value={resultFilter}
              onChange={(event) => {
                setResultFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All results</option>
              {RESULTS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-test" className="ls-label">Test</label>
            <select
              id="filter-test"
              className="ls-select mt-1 block"
              value={testFilter}
              onChange={(event) => {
                setTestFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All tests</option>
              {LAB_TESTS.map((test) => (
                <option key={test.loincCode} value={test.name}>
                  {test.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-day" className="ls-label">Day</label>
            <select
              id="filter-day"
              className="ls-select mt-1 block"
              value={dayFilter}
              onChange={(event) => {
                setDayFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All days to date</option>
              {Array.from({ length: currentDay }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  Day {day}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="ls-btn"
          >
            Clear filters
          </button>
        </div>
      </Card>

      <Card
        title={`${filtered.length.toLocaleString('en-US')} of ${scopeTotal.toLocaleString(
          'en-US',
        )} observations`}
        subtitle={`${observationCounts.day.toLocaleString(
          'en-US',
        )} received on Day ${currentDay} · ${observationCounts.cumulative.toLocaleString(
          'en-US',
        )} cumulative through Day ${currentDay}. Synthetic FHIR Observation resources — scroll the table horizontally to see every column.`}
        bodyClassName="p-0"
      >
        {isLoading ? (
          <LoadingState label="Loading synthetic observations…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="≡"
            title="No observations match these filters"
            message={
              hasActiveFilters
                ? 'Try widening your search or clearing one of the active filters.'
                : 'No synthetic observations are available for this simulation day.'
            }
            action={
              hasActiveFilters ? (
                <button type="button" onClick={resetFilters} className="ls-btn">
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse">
                <thead className="border-b border-hairline bg-canvas">
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column.label} scope="col" className="ls-th">
                        {column.key ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(column.key as SortKey)}
                            className="-my-3 inline-flex items-center gap-1 py-3 uppercase tracking-[0.06em] hover:text-ink"
                          >
                            {column.label}
                            <span aria-hidden="true" className="text-[9px]">
                              {sortKey === column.key
                                ? sortDirection === 'asc'
                                  ? '▲'
                                  : '▼'
                                : '⇅'}
                            </span>
                          </button>
                        ) : (
                          column.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {pageRows.map((observation: LabObservation) => (
                    <tr key={observation.id} className="transition-colors hover:bg-canvas">
                      <td className="ls-td text-muted">
                        {formatDateTime(observation.effectiveDateTime)}
                      </td>
                      <td className="ls-td">
                        <span className="block font-medium">{observation.hospitalName}</span>
                        <span className="block text-xs text-muted">
                          {observation.hospitalId}
                        </span>
                      </td>
                      <td className="ls-td text-muted">{observation.vendor}</td>
                      <td className="ls-td font-mono text-xs">{observation.patientId}</td>
                      <td className="ls-td">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            observation.result === 'Positive'
                              ? 'bg-severity-critical/10 text-severity-critical ring-1 ring-inset ring-severity-critical/25'
                              : 'bg-severity-low/10 text-[#166534] ring-1 ring-inset ring-severity-low/20'
                          }`}
                        >
                          {observation.result}
                        </span>
                      </td>
                      <td className="ls-td">{observation.testName}</td>
                      <td className="ls-td font-mono text-xs text-muted">
                        {observation.loincCode}
                      </td>
                      <td className="ls-td tabular-nums text-muted">{observation.zipCode}</td>
                      <td className="ls-td text-muted">
                        {observation.fhirStatus}{' '}
                        <span className="text-[#166534]">✓</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
              <p className="text-xs text-muted">
                Showing {(safePage - 1) * ROWS_PER_PAGE + 1}–
                {Math.min(safePage * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={safePage <= 1}
                  className="ls-btn px-3 py-1.5 text-xs"
                >
                  ‹ Previous
                </button>
                <span className="px-2 text-xs tabular-nums text-muted">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={safePage >= totalPages}
                  className="ls-btn px-3 py-1.5 text-xs"
                >
                  Next ›
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
