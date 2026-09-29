/**
 * Surveillance days: the per-day values every data source supplies, and the
 * derivations the UI builds from them.
 *
 * The composite score, severity and Data Confidence on a SurveillanceDay are
 * the source's own values. Nothing here recalculates them. The score's
 * explanatory breakdown is rebuilt from the day's persisted inputs with the
 * prototype's unchanged scorer, and must reproduce the persisted composite and
 * severity exactly — if it does not, that is a data-integrity failure and is
 * raised, never papered over.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  DataConfidenceResult,
  SignalScoreResult,
  SurveillanceDay,
} from '../types';
import { SCENARIOS } from '../data/simulation';
import { getDataConfidence } from './dataConfidence';
import { scoreScenario } from './signalScore';

/** A source's data disagrees with itself or with the prototype's model. */
export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataIntegrityError';
  }
}

/** The prototype's own five days, from the TypeScript source of truth. */
export const buildLocalSurveillanceDays = (): SurveillanceDay[] =>
  SCENARIOS.map((scenario) => {
    const score = scoreScenario(scenario);
    const confidence = getDataConfidence(scenario.day);
    return {
      scenario,
      compositeScore: score.composite,
      severity: score.severity,
      dataConfidenceScore: confidence.score,
      dataConfidenceLevel: confidence.level,
    };
  });

export const findDay = (days: SurveillanceDay[], day: number): SurveillanceDay => {
  const match = days.find((item) => item.scenario.day === day);
  if (!match) throw new DataIntegrityError(`No surveillance data for simulation day ${day}.`);
  return match;
};

/** Regional totals from Day 1 through `currentDay`, summed from the days. */
export const cumulativeTotalsFrom = (days: SurveillanceDay[], currentDay: number) => {
  const reached = days.filter((item) => item.scenario.day <= currentDay);
  const tests = reached.reduce((sum, item) => sum + item.scenario.totalTests, 0);
  const positives = reached.reduce((sum, item) => sum + item.scenario.totalPositives, 0);
  return {
    tests,
    positives,
    negatives: tests - positives,
    positivityRate: tests === 0 ? 0 : (positives / tests) * 100,
  };
};

/**
 * The day's score, with the explanatory breakdown rebuilt from its inputs.
 * Composite and severity are the day's own values.
 */
export const signalScoreFor = (day: SurveillanceDay): SignalScoreResult => {
  const breakdown = scoreScenario(day.scenario);
  if (breakdown.composite !== day.compositeScore || breakdown.severity !== day.severity) {
    throw new DataIntegrityError(
      `Day ${day.scenario.day}: the stored score (${day.compositeScore} ${day.severity}) does not ` +
        `match its own inputs (${breakdown.composite} ${breakdown.severity}).`,
    );
  }
  return { ...breakdown, composite: day.compositeScore, severity: day.severity };
};

/**
 * Data Confidence for the day. The score and level are the day's own values;
 * the component breakdown comes from the prototype's feed-health simulation,
 * which is still frontend-local, so the two must agree.
 */
export const dataConfidenceFor = (day: SurveillanceDay): DataConfidenceResult => {
  const breakdown = getDataConfidence(day.scenario.day);
  if (day.dataConfidenceScore === null || day.dataConfidenceLevel === null) {
    throw new DataIntegrityError(`Day ${day.scenario.day}: no Data Confidence value is stored.`);
  }
  if (breakdown.score !== day.dataConfidenceScore || breakdown.level !== day.dataConfidenceLevel) {
    throw new DataIntegrityError(
      `Day ${day.scenario.day}: the stored Data Confidence (${day.dataConfidenceScore} ` +
        `${day.dataConfidenceLevel}) does not match the feed-health model ` +
        `(${breakdown.score} ${breakdown.level}).`,
    );
  }
  return { ...breakdown, score: day.dataConfidenceScore, level: day.dataConfidenceLevel };
};
