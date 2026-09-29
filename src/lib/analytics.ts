/**
 * Chart series builders. Every series runs Day 1 through the current
 * simulation day only — never beyond it.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type { SurveillanceDay } from '../types';
import { SCENARIOS } from '../data/simulation';
import { getScoreForDay } from './selectors';

export interface TrendPoint {
  day: number;
  dayLabel: string;
  tests: number;
  positivity: number;
  score: number;
  affectedZips: number;
  affectedHospitals: number;
  stage: string;
}

/** The full progression up to and including the given day. */
export const getTrendSeries = (currentDay: number): TrendPoint[] =>
  buildTrendSeries(
    SCENARIOS.map((scenario) => ({
      scenario,
      compositeScore: getScoreForDay(scenario.day).composite,
    })),
    currentDay,
  );

/**
 * The same progression built from any data source's days. The score is the
 * day's own composite score, as supplied; it is not recalculated here.
 */
export const buildTrendSeries = (
  days: Array<Pick<SurveillanceDay, 'scenario' | 'compositeScore'>>,
  currentDay: number,
): TrendPoint[] =>
  days
    .filter(({ scenario }) => scenario.day <= currentDay)
    .map(({ scenario, compositeScore }) => ({
      day: scenario.day,
      dayLabel: `Day ${scenario.day}`,
      tests: scenario.totalTests,
      positivity: scenario.positivityRate,
      score: compositeScore,
      affectedZips: scenario.affectedZipCodes.length,
      affectedHospitals: scenario.affectedHospitals.length,
      stage: scenario.stage,
    }));
