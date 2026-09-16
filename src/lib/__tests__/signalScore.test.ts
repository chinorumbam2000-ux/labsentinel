import { describe, expect, it } from 'vitest';
import {
  SCORE_WEIGHTS,
  calculateSignalScore,
  clamp,
  getSeverity,
  scoreScenario,
} from '../signalScore';
import { SCENARIOS, getScenario } from '../../data/simulation';

describe('clamp', () => {
  it('bounds values into the 0-100 range', () => {
    expect(clamp(-40)).toBe(0);
    expect(clamp(0)).toBe(0);
    expect(clamp(55.5)).toBe(55.5);
    expect(clamp(140)).toBe(100);
  });
});

describe('getSeverity', () => {
  it('maps each score band to the specified severity', () => {
    expect(getSeverity(0)).toBe('Low');
    expect(getSeverity(19)).toBe('Low');
    expect(getSeverity(20)).toBe('Watch');
    expect(getSeverity(39)).toBe('Watch');
    expect(getSeverity(40)).toBe('Moderate');
    expect(getSeverity(64)).toBe('Moderate');
    expect(getSeverity(65)).toBe('High');
    expect(getSeverity(84)).toBe('High');
    expect(getSeverity(85)).toBe('Critical');
    expect(getSeverity(100)).toBe('Critical');
  });
});

describe('composite score weights', () => {
  it('sums to 1.0', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('five-day score progression', () => {
  const expected: Record<number, number> = { 1: 0, 2: 23, 3: 49, 4: 74, 5: 86 };

  it.each(SCENARIOS.map((scenario) => scenario.day))(
    'calculates day %i to the expected composite score',
    (day) => {
      expect(scoreScenario(getScenario(day)).composite).toBe(expected[day]);
    },
  );

  it('calculates Day 5 as approximately 86 rather than hard-coding it', () => {
    const result = scoreScenario(getScenario(5));
    expect(result.composite).toBeGreaterThanOrEqual(85);
    expect(result.composite).toBeLessThanOrEqual(87);
    expect(result.severity).toBe('Critical');
  });

  it('never decreases as the simulation advances', () => {
    const scores = SCENARIOS.map((scenario) => scoreScenario(scenario).composite);
    scores.forEach((score, index) => {
      if (index > 0) expect(score).toBeGreaterThan(scores[index - 1]);
    });
  });

  it('assigns the specified severity at each day', () => {
    const severities = SCENARIOS.map((scenario) => scoreScenario(scenario).severity);
    expect(severities).toEqual(['Low', 'Watch', 'Moderate', 'High', 'Critical']);
  });
});

describe('score components', () => {
  it('produces the blueprint Day 5 breakdown', () => {
    const { components, composite } = scoreScenario(getScenario(5));
    const points = Object.fromEntries(
      components.map((component) => [component.key, component.points]),
    );

    expect(points.volume).toBe(19);
    expect(points.positivity).toBe(22);
    expect(points.facilities).toBe(20);
    expect(points.geography).toBe(15);
    expect(points.persistence).toBe(10);
    expect(composite).toBe(86);
  });

  it('exposes five components with the specified maximum point values', () => {
    const { components } = scoreScenario(getScenario(1));
    expect(components).toHaveLength(5);
    expect(components.map((component) => component.maxPoints)).toEqual([25, 30, 20, 15, 10]);
  });

  it('reports zero for every component at baseline', () => {
    const { components, composite } = scoreScenario(getScenario(1));
    expect(composite).toBe(0);
    components.forEach((component) => expect(component.score).toBe(0));
  });
});

describe('edge cases', () => {
  it('clamps a volume drop below baseline to zero rather than going negative', () => {
    const result = calculateSignalScore({
      totalTests: 40,
      positivityRate: 2,
      affectedFacilities: 0,
      affectedZipCodes: [],
      persistenceDays: 0,
    });
    expect(result.composite).toBe(0);
    expect(result.severity).toBe('Low');
    expect(result.volumeIncreasePercent).toBeLessThan(0);
  });

  it('caps at 100 when every component is saturated', () => {
    const result = calculateSignalScore({
      totalTests: 900,
      positivityRate: 60,
      affectedFacilities: 9,
      affectedZipCodes: ['01604', '01605', '01545', '01610'],
      persistenceDays: 30,
    });
    expect(result.composite).toBe(100);
    expect(result.severity).toBe('Critical');
  });
});
