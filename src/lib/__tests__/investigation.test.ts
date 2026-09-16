/**
 * Invariants the Signal Investigation view relies on.
 *
 * The view renders a day's breakdown through the shared scorer. These tests
 * pin the relationships it depends on so the detection-time replay cannot
 * silently start disagreeing with the recorded alert.
 */
import { describe, expect, it } from 'vitest';
import { ALL_DETECTIONS, findDetection, getAlerts, getRegionalAlert } from '../alerts';
import { getScoreForDay } from '../selectors';
import { getScenario } from '../../data/simulation';

describe('detection-time replay uses the recorded day', () => {
  it('the regional alert is detected on Day 4 with score 74 / High', () => {
    const regional = getRegionalAlert(5);
    expect(regional?.detectedDay).toBe(4);
    expect(regional?.detection.compositeScore).toBe(74);
    expect(regional?.detection.severity).toBe('High');
  });

  it('replaying the detection day through the shared scorer reproduces it', () => {
    const regional = getRegionalAlert(5)!;
    const replay = getScoreForDay(regional.detectedDay);
    expect(replay.composite).toBe(regional.detection.compositeScore);
    expect(replay.severity).toBe(regional.detection.severity);
  });

  it('the current day gives a different answer at Day 5', () => {
    const current = getScoreForDay(5);
    expect(current.composite).toBe(87);
    expect(current.severity).toBe('Critical');
    // The whole point of the fix: these two must not be the same view.
    expect(current.composite).not.toBe(getScoreForDay(4).composite);
  });

  it('every detection replays to its own recorded composite score', () => {
    ALL_DETECTIONS.forEach((detection) => {
      const replay = getScoreForDay(detection.detectedDay);
      expect(replay.composite).toBe(detection.detection.compositeScore);
    });
  });

  it('replaying is independent of the currently selected day', () => {
    // The same alert, read at Day 4 and at Day 5, replays identically.
    const atFour = getAlerts(4).find((a) => a.investigable)!;
    const atFive = getAlerts(5).find((a) => a.investigable)!;
    expect(atFive.id).toBe(atFour.id);
    expect(atFive.detectedDay).toBe(atFour.detectedDay);
    expect(getScoreForDay(atFive.detectedDay)).toEqual(getScoreForDay(atFour.detectedDay));
  });
});

describe('component contributions reconcile with the score in both views', () => {
  it.each([4, 5])('day %i components sum to within rounding of the composite', (day) => {
    const score = getScoreForDay(day);
    const summed = score.components.reduce((total, c) => total + c.points, 0);
    // Component points are rounded for display, so allow a one-point drift.
    expect(Math.abs(summed - score.composite)).toBeLessThanOrEqual(1);
  });

  it('day 4 breakdown reconciles exactly to 74', () => {
    const score = getScoreForDay(4);
    const points = Object.fromEntries(score.components.map((c) => [c.key, c.points]));
    expect(points).toEqual({
      volume: 14,
      positivity: 17,
      facilities: 20,
      geography: 15,
      persistence: 8,
    });
    const summed = score.components.reduce((total, c) => total + c.points, 0);
    expect(summed).toBe(74);
    expect(score.composite).toBe(74);
  });

  it('day 5 breakdown reconciles to 87', () => {
    const score = getScoreForDay(5);
    const summed = score.components.reduce((total, c) => total + c.points, 0);
    expect(score.composite).toBe(87);
    expect(Math.abs(summed - 87)).toBeLessThanOrEqual(1);
  });

  it('exposes five weighted components in both views', () => {
    [4, 5].forEach((day) => {
      const score = getScoreForDay(day);
      expect(score.components).toHaveLength(5);
      expect(score.components.map((c) => c.maxPoints)).toEqual([25, 30, 20, 15, 10]);
    });
  });
});

describe('alert reference resolution', () => {
  it('finds a known detection regardless of the current day', () => {
    const regional = getRegionalAlert(5)!;
    expect(findDetection(regional.id)?.detectedDay).toBe(4);
  });

  it('returns undefined for an unknown reference', () => {
    expect(findDetection('ALERT-NOPE-D9')).toBeUndefined();
    expect(findDetection('')).toBeUndefined();
    expect(findDetection('../../etc/passwd')).toBeUndefined();
  });

  it('distinguishes "not yet detected" from "does not exist"', () => {
    const regional = getRegionalAlert(5)!;
    // Known detection, but not visible at Day 2.
    expect(findDetection(regional.id)).toBeDefined();
    expect(getAlerts(2).find((a) => a.id === regional.id)).toBeUndefined();
    // Genuinely unknown.
    expect(findDetection('ALERT-UNKNOWN-D1')).toBeUndefined();
  });

  it('exposes the detection day needed for the "not yet detected" message', () => {
    const regional = getRegionalAlert(5)!;
    const detection = findDetection(regional.id)!;
    expect(detection.detectedDay).toBe(4);
    expect(detection.title).toBe('Regional outbreak signal detected');
  });
});

describe('switching views does not mutate anything', () => {
  it('reading the same day repeatedly yields equal results', () => {
    const a = getScoreForDay(4);
    const b = getScoreForDay(5);
    const c = getScoreForDay(4);
    expect(c).toEqual(a);
    expect(b.composite).not.toBe(a.composite);
  });

  it('leaves the detection snapshots untouched', () => {
    const before = JSON.parse(JSON.stringify(ALL_DETECTIONS));
    getScoreForDay(4);
    getScoreForDay(5);
    getAlerts(5);
    getAlerts(2);
    expect(JSON.parse(JSON.stringify(ALL_DETECTIONS))).toEqual(before);
  });

  it('does not depend on or alter acknowledgement state', () => {
    const regional = getRegionalAlert(5)!;
    const acked = getAlerts(5, {
      [regional.id]: {
        day: 5,
        simulationTime: '2025-11-07T17:00:00',
        realTime: '2026-09-16T12:00:00.000Z',
      },
    }).find((a) => a.investigable)!;
    // Acknowledgement changes status only — never the replayed breakdown.
    expect(acked.status).toBe('Acknowledged');
    expect(acked.detectedDay).toBe(regional.detectedDay);
    expect(getScoreForDay(acked.detectedDay).composite).toBe(74);
  });
});

describe('scenario context for each view', () => {
  it('carries the simulation date used in the view labels', () => {
    expect(getScenario(4).simulationDate).toBe('2025-11-06');
    expect(getScenario(5).simulationDate).toBe('2025-11-07');
  });
});
