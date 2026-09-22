import { describe, expect, it } from 'vitest';
import { getDayOverDayComparison } from '../dayOverDay';
import { getScoreForDay } from '../selectors';
import { SIMULATION_DAYS } from '../../data/dataset';

const find = (day: number, label: string) =>
  getDayOverDayComparison(day).metrics.find((m) => m.label === label);

describe('Day 1', () => {
  it('reports the baseline message rather than inventing a comparison', () => {
    const comparison = getDayOverDayComparison(1);
    expect(comparison.available).toBe(false);
    expect(comparison.previousDay).toBeNull();
    expect(comparison.metrics).toHaveLength(0);
    expect(comparison.explanation).toBe(
      'Baseline — no previous surveillance day available.',
    );
    expect(comparison.scoreDelta).toBe(0);
  });
});

describe('Day 4 to Day 5', () => {
  const comparison = getDayOverDayComparison(5);

  it('is available and points at the previous day', () => {
    expect(comparison.available).toBe(true);
    expect(comparison.previousDay).toBe(4);
    expect(comparison.currentDay).toBe(5);
  });

  it('reports the test volume change', () => {
    const metric = find(5, 'Tests');
    expect(metric?.previous).toBe('158');
    expect(metric?.current).toBe('176');
    expect(metric?.delta).toBe('+18');
    expect(metric?.direction).toBe('up');
  });

  it('reports the positive-result change', () => {
    const metric = find(5, 'Positive results');
    expect(metric?.previous).toBe('26');
    expect(metric?.current).toBe('34');
    expect(metric?.delta).toBe('+8');
  });

  it('reports the positivity change in percentage points', () => {
    const metric = find(5, 'Positivity');
    expect(metric?.previous).toBe('16.5%');
    expect(metric?.current).toBe('19.3%');
    expect(metric?.delta).toBe('+2.9 percentage points');
    expect(metric?.direction).toBe('up');
  });

  it('reports no change for facilities and geography', () => {
    expect(find(5, 'Affected hospitals')?.delta).toBe('No change');
    expect(find(5, 'Affected hospitals')?.direction).toBe('none');
    expect(find(5, 'Affected geographic areas')?.delta).toBe('No change');
  });

  it('reports the persistence change', () => {
    const metric = find(5, 'Persistence');
    expect(metric?.previous).toBe('3 days');
    expect(metric?.current).toBe('4 days');
    expect(metric?.delta).toBe('+1 day');
  });

  it('reports the composite score change', () => {
    const metric = find(5, 'Composite Outbreak Signal Score');
    expect(metric?.previous).toBe('74');
    expect(metric?.current).toBe('87');
    expect(metric?.delta).toBe('+13');
    expect(comparison.scoreDelta).toBe(13);
  });

  it('explains the movement in plain language', () => {
    expect(comparison.explanation).toMatch(/score increased/i);
    expect(comparison.explanation).toMatch(/test volume increased/i);
    expect(comparison.explanation).toMatch(/positivity increased/i);
    expect(comparison.explanation).toMatch(/persisted for another day/i);
    expect(comparison.explanation).toMatch(/remained unchanged/i);
  });
});

describe('every comparable day', () => {
  const days = SIMULATION_DAYS.filter((d) => d > 1);

  it.each(days)('day %i is available with a full metric set', (day) => {
    const comparison = getDayOverDayComparison(day);
    expect(comparison.available).toBe(true);
    expect(comparison.metrics).toHaveLength(7);
    expect(comparison.explanation.length).toBeGreaterThan(20);
  });

  it.each(days)('day %i score delta matches the shared scorer', (day) => {
    const expected = getScoreForDay(day).composite - getScoreForDay(day - 1).composite;
    expect(getDayOverDayComparison(day).scoreDelta).toBe(expected);
  });

  it('matches the known score progression', () => {
    expect(days.map((day) => getDayOverDayComparison(day).scoreDelta)).toEqual([
      24, 26, 24, 13,
    ]);
  });

  it('is deterministic', () => {
    days.forEach((day) => {
      expect(getDayOverDayComparison(day)).toEqual(getDayOverDayComparison(day));
    });
  });

  it('never alters the composite scores it reads', () => {
    days.forEach((day) => getDayOverDayComparison(day));
    expect(SIMULATION_DAYS.map((day) => getScoreForDay(day).composite)).toEqual([
      0, 24, 50, 74, 87,
    ]);
  });
});

describe('Day 2 and Day 3 specifics', () => {
  it('Day 2 notes the first affected facility and area', () => {
    const comparison = getDayOverDayComparison(2);
    expect(find(2, 'Affected hospitals')?.delta).toBe('+1');
    expect(find(2, 'Affected geographic areas')?.delta).toBe('+1');
    expect(comparison.explanation).toMatch(/more facilities became affected/i);
  });

  it('Day 3 notes a second facility joining', () => {
    expect(find(3, 'Affected hospitals')?.previous).toBe('1');
    expect(find(3, 'Affected hospitals')?.current).toBe('2');
    expect(find(3, 'Persistence')?.delta).toBe('+1 day');
  });
});
