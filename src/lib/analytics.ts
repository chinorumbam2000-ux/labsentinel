/**
 * Chart series builders. Every series runs Day 1 through the current
 * simulation day only — never beyond it.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
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
  SCENARIOS.filter((scenario) => scenario.day <= currentDay).map((scenario) => ({
    day: scenario.day,
    dayLabel: `Day ${scenario.day}`,
    tests: scenario.totalTests,
    positivity: scenario.positivityRate,
    score: getScoreForDay(scenario.day).composite,
    affectedZips: scenario.affectedZipCodes.length,
    affectedHospitals: scenario.affectedHospitals.length,
    stage: scenario.stage,
  }));

/** Full five-day progression, used where the whole arc must be shown. */
export const getFullTrendSeries = (): TrendPoint[] => getTrendSeries(SCENARIOS.length);
