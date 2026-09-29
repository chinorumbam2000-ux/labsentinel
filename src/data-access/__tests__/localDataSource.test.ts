import { describe, expect, it } from 'vitest';
import { createLocalDataSource } from '../localDataSource';
import { HOSPITALS } from '../../data/hospitals';
import { OBSERVATIONS } from '../../data/observations';
import { SCENARIOS } from '../../data/simulation';
import { getDataConfidence } from '../../lib/dataConfidence';
import { getScoreForDay } from '../../lib/selectors';
import type { ObservationQuery } from '../../types';

const source = createLocalDataSource();

const query = (overrides: Partial<ObservationQuery> = {}): ObservationQuery => ({
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

describe('LocalDataSource (local demo mode)', () => {
  it('is the local mode, with synchronous access and no backend health', async () => {
    expect(source.mode).toBe('local');
    expect(source.sync).toBeDefined();
    expect(await source.checkHealth()).toBeNull();
  });

  it('loads the three fictional facilities exactly as the prototype defines them', async () => {
    const facilities = await source.getFacilities();
    expect(facilities).toEqual(HOSPITALS);
    expect(facilities.map((f) => [f.name, f.vendor, f.zipCode])).toEqual([
      ['Worcester Central Medical Center', 'Epic', '01604'],
      ['Central Massachusetts Regional Hospital', 'Oracle Health', '01605'],
      ['Shrewsbury Community Medical Center', 'MEDITECH', '01545'],
    ]);
    expect(await source.getFacility('HOSP-B')).toEqual(HOSPITALS[1]);
  });

  it('returns the Day 1 summary from the prototype data', async () => {
    const day1 = await source.getDemoSummary(1);
    expect(day1.scenario).toEqual(SCENARIOS[0]);
    expect([day1.compositeScore, day1.severity]).toEqual([0, 'Low']);
    expect([day1.dataConfidenceScore, day1.dataConfidenceLevel]).toEqual([98, 'Very High']);
  });

  it('returns the Day 5 summary from the prototype data', async () => {
    const day5 = await source.getDemoSummary(5);
    expect(day5.scenario.stage).toBe('Regional Early-Warning Signal');
    expect([day5.scenario.totalTests, day5.scenario.totalPositives]).toEqual([176, 34]);
    expect([day5.compositeScore, day5.severity]).toEqual([
      getScoreForDay(5).composite,
      getScoreForDay(5).severity,
    ]);
    expect(day5.dataConfidenceScore).toBe(getDataConfidence(5).score);
  });

  it('returns every signal, Day 1 first, with the prototype scores', async () => {
    const signals = await source.getSignals();
    expect(signals.map((s) => s.compositeScore)).toEqual([0, 24, 50, 74, 87]);
    expect(signals.map((s) => s.severity)).toEqual(['Low', 'Watch', 'Moderate', 'High', 'Critical']);
    const current = await source.getCurrentSignal(3);
    expect(current.compositeScore).toBe(50);
    expect('stage' in current.scenario).toBe(false);
  });

  it('pages observations exactly as the Laboratory Data table always has', async () => {
    const page = await source.getObservations(query());
    expect([page.total, page.dayCount, page.cumulativeCount, page.totalPages]).toEqual([699, 176, 699, 70]);
    expect(page.rows).toHaveLength(10);
    // Newest first by default.
    expect(page.rows[0].effectiveDateTime >= page.rows[9].effectiveDateTime).toBe(true);
  });

  it('filters, searches and clamps pages', async () => {
    expect((await source.getObservations(query({ result: 'Positive' }))).total).toBe(99);
    expect((await source.getObservations(query({ scope: 'today', currentDay: 2 }))).total).toBe(124);
    expect((await source.getObservations(query({ search: 'syn-p0001' }))).total).toBe(1);
    const clamped = await source.getObservations(query({ currentDay: 1, page: 999 }));
    expect([clamped.page, clamped.totalPages]).toEqual([10, 10]);
  });

  it('finds a single observation by its id', async () => {
    expect(await source.getObservation('OBS-0001')).toEqual(OBSERVATIONS[0]);
    expect(await source.getObservation('OBS-9999')).toBeUndefined();
  });
});
