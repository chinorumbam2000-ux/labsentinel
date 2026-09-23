/**
 * Day-to-day change explanation.
 *
 * Compares the selected simulation day with the one before it and explains, in
 * plain language, why the Composite Outbreak Signal Score moved. It reads the
 * existing scenario and scorer — it does not recalculate or alter the score.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type { ChangeDirection, DayOverDayComparison, DayOverDayMetric } from '../types';
import { getScenario } from '../data/simulation';
import { getScoreForDay } from './selectors';

const directionOf = (delta: number): ChangeDirection => {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'none';
};

const signed = (delta: number, digits = 0): string =>
  `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(digits)}`;

const countMetric = (
  label: string,
  previous: number,
  current: number,
  unit = '',
): DayOverDayMetric => {
  const delta = current - previous;
  return {
    label,
    previous: `${previous}${unit}`,
    current: `${current}${unit}`,
    delta:
      delta === 0
        ? 'No change'
        : `${signed(delta)}${unit ? ` ${unit.trim()}` : ''}`.trim(),
    direction: directionOf(delta),
  };
};

/**
 * Builds the comparison for the given day. Day 1 has no previous surveillance
 * day, so it returns an unavailable comparison rather than inventing one.
 */
export const getDayOverDayComparison = (currentDay: number): DayOverDayComparison => {
  if (currentDay <= 1) {
    return {
      available: false,
      previousDay: null,
      currentDay,
      metrics: [],
      explanation: 'Baseline — no previous surveillance day available.',
      scoreDelta: 0,
    };
  }

  const previousDay = currentDay - 1;
  const previous = getScenario(previousDay);
  const current = getScenario(currentDay);
  const previousScore = getScoreForDay(previousDay);
  const currentScore = getScoreForDay(currentDay);

  const testsDelta = current.totalTests - previous.totalTests;
  const positivityDelta = current.positivityRate - previous.positivityRate;
  const hospitalsDelta =
    current.affectedHospitals.length - previous.affectedHospitals.length;
  const areasDelta = current.affectedZipCodes.length - previous.affectedZipCodes.length;
  const persistenceDelta = current.persistenceDays - previous.persistenceDays;
  const scoreDelta = currentScore.composite - previousScore.composite;

  const metrics: DayOverDayMetric[] = [
    countMetric('Tests', previous.totalTests, current.totalTests),
    countMetric('Positive results', previous.totalPositives, current.totalPositives),
    {
      label: 'Positivity',
      previous: `${previous.positivityRate.toFixed(1)}%`,
      current: `${current.positivityRate.toFixed(1)}%`,
      delta:
        Math.abs(positivityDelta) < 0.05
          ? 'No change'
          : `${signed(positivityDelta, 1)} percentage points`,
      direction: directionOf(positivityDelta),
    },
    countMetric(
      'Affected hospitals',
      previous.affectedHospitals.length,
      current.affectedHospitals.length,
    ),
    countMetric(
      'Affected geographic areas',
      previous.affectedZipCodes.length,
      current.affectedZipCodes.length,
    ),
    {
      label: 'Persistence',
      previous: `${previous.persistenceDays} ${previous.persistenceDays === 1 ? 'day' : 'days'}`,
      current: `${current.persistenceDays} ${current.persistenceDays === 1 ? 'day' : 'days'}`,
      delta:
        persistenceDelta === 0
          ? 'No change'
          : `${signed(persistenceDelta)} ${Math.abs(persistenceDelta) === 1 ? 'day' : 'days'}`,
      direction: directionOf(persistenceDelta),
    },
    countMetric('Composite Outbreak Signal Score', previousScore.composite, currentScore.composite),
  ];

  // Build the sentence from whatever actually moved.
  const rose: string[] = [];
  const fell: string[] = [];
  const unchanged: string[] = [];

  const note = (delta: number, up: string, down: string, flat: string) => {
    if (delta > 0) rose.push(up);
    else if (delta < 0) fell.push(down);
    else unchanged.push(flat);
  };

  note(testsDelta, 'test volume increased', 'test volume fell', 'test volume');
  note(
    Math.abs(positivityDelta) < 0.05 ? 0 : positivityDelta,
    'positivity increased',
    'positivity fell',
    'positivity',
  );
  note(
    hospitalsDelta,
    'more facilities became affected',
    'fewer facilities were affected',
    'facility',
  );
  note(
    areasDelta,
    'the signal reached more geographic areas',
    'the signal covered fewer geographic areas',
    'geographic',
  );
  note(
    persistenceDelta,
    'the abnormal pattern persisted for another day',
    'the abnormal pattern broke',
    'persistence',
  );

  const list = (items: string[]): string => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  };

  const explanation = (() => {
    const direction =
      scoreDelta > 0 ? 'increased' : scoreDelta < 0 ? 'decreased' : 'did not change';
    const head =
      rose.length > 0 || fell.length > 0
        ? `The score ${direction} because ${list([...rose, ...fell])}.`
        : `The score ${direction}; no component input moved between these days.`;
    // The tail is its own sentence, so it needs its own capital letter.
    const tail = (() => {
      if (unchanged.length === 0) return '';
      const phrase = list(
        unchanged.map((item) =>
          item === 'facility' || item === 'geographic'
            ? `${item} contributions`
            : `${item} levels`,
        ),
      );
      return ` ${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} remained unchanged.`;
    })();
    return `${head}${tail}`.replace(/\s+/g, ' ').trim();
  })();

  return {
    available: true,
    previousDay,
    currentDay,
    metrics,
    explanation:
      explanation.charAt(0).toUpperCase() + explanation.slice(1),
    scoreDelta,
  };
};
