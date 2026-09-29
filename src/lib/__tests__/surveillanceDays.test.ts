/**
 * The data-source-driven derivations must reproduce local mode exactly, and
 * must refuse data that disagrees with itself.
 */
import { describe, expect, it } from 'vitest';
import { buildTrendSeries, getTrendSeries } from '../analytics';
import { compareDays, getDayOverDayComparison } from '../dayOverDay';
import { getDataConfidence } from '../dataConfidence';
import { getCumulativeTotals, getScoreForDay } from '../selectors';
import {
  DataIntegrityError,
  buildLocalSurveillanceDays,
  cumulativeTotalsFrom,
  dataConfidenceFor,
  findDay,
  signalScoreFor,
} from '../surveillanceDays';

const days = buildLocalSurveillanceDays();

describe('surveillance-day derivations reproduce the prototype exactly', () => {
  it.each([1, 2, 3, 4, 5])('Day %i: score, confidence, totals, trend and day-over-day', (day) => {
    const current = findDay(days, day);
    expect(signalScoreFor(current)).toEqual(getScoreForDay(day));
    expect(dataConfidenceFor(current)).toEqual(getDataConfidence(day));
    expect(cumulativeTotalsFrom(days, day)).toEqual(getCumulativeTotals(day));
    expect(buildTrendSeries(days, day)).toEqual(getTrendSeries(day));
    const previous = day > 1 ? findDay(days, day - 1) : null;
    expect(
      compareDays(
        day,
        previous && { scenario: previous.scenario, composite: previous.compositeScore },
        { scenario: current.scenario, composite: current.compositeScore },
      ),
    ).toEqual(getDayOverDayComparison(day));
  });

  it('keeps the Day 1 baseline message', () => {
    expect(getDayOverDayComparison(1).explanation).toBe(
      'Baseline — no previous surveillance day available.',
    );
  });

  it('reproduces the progression 0, 24, 50, 74, 87', () => {
    expect(buildTrendSeries(days, 5).map((point) => point.score)).toEqual([0, 24, 50, 74, 87]);
  });
});

describe('integrity checks', () => {
  it('refuses a stored score that its own inputs do not produce', () => {
    const day = { ...findDay(days, 3), compositeScore: 51 };
    expect(() => signalScoreFor(day)).toThrow(DataIntegrityError);
  });

  it('refuses a stored severity that does not match', () => {
    expect(() => signalScoreFor({ ...findDay(days, 3), severity: 'High' })).toThrow(DataIntegrityError);
  });

  it('refuses a Data Confidence value that differs from the feed-health model', () => {
    expect(() => dataConfidenceFor({ ...findDay(days, 2), dataConfidenceScore: 96 })).toThrow(DataIntegrityError);
    expect(() => dataConfidenceFor({ ...findDay(days, 2), dataConfidenceScore: null })).toThrow(DataIntegrityError);
  });

  it('refuses a missing day', () => {
    expect(() => findDay(days.slice(0, 2), 4)).toThrow(DataIntegrityError);
  });
});
