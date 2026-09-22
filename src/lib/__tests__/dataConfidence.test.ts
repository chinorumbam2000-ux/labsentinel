import { describe, expect, it } from 'vitest';
import type { FacilityFeedHealth } from '../../types';
import {
  CONFIDENCE_WEIGHTS,
  calculateDataConfidence,
  freshnessFor,
  getConfidenceLevel,
  getDataConfidence,
} from '../dataConfidence';
import {
  deriveFeedStatus,
  getAllFeedHealth,
  getFacilityFeedHealth,
} from '../../data/feedHealth';
import { SIMULATION_DAYS, getSiteCounts } from '../../data/dataset';
import { getScoreForDay } from '../selectors';

const DAYS = SIMULATION_DAYS;

const feed = (over: Partial<FacilityFeedHealth> = {}): FacilityFeedHealth => ({
  hospitalId: 'HOSP-A',
  facilityName: 'Worcester Central Medical Center',
  vendor: 'Epic',
  status: 'HEALTHY',
  lastEventAt: '2025-11-07T20:12:00',
  minutesSinceLastEvent: 3,
  eventsReceived: 100,
  terminologyMappedPercent: 98,
  completenessPercent: 99,
  failedEvents: 0,
  duplicateEvents: 0,
  latencySeconds: 40,
  isReporting: true,
  note: 'Delivering normally.',
  ...over,
});

describe('confidence weights and levels', () => {
  it('uses the specified weights, summing to 1.0', () => {
    expect(CONFIDENCE_WEIGHTS.freshness).toBe(0.3);
    expect(CONFIDENCE_WEIGHTS.completeness).toBe(0.25);
    expect(CONFIDENCE_WEIGHTS.terminology).toBe(0.2);
    expect(CONFIDENCE_WEIGHTS.participation).toBe(0.15);
    expect(CONFIDENCE_WEIGHTS.integrity).toBe(0.1);
    const total = Object.values(CONFIDENCE_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('maps each band to the specified level', () => {
    expect(getConfidenceLevel(100)).toBe('Very High');
    expect(getConfidenceLevel(90)).toBe('Very High');
    expect(getConfidenceLevel(89)).toBe('High');
    expect(getConfidenceLevel(75)).toBe('High');
    expect(getConfidenceLevel(74)).toBe('Moderate');
    expect(getConfidenceLevel(50)).toBe('Moderate');
    expect(getConfidenceLevel(49)).toBe('Low');
    expect(getConfidenceLevel(0)).toBe('Low');
  });

  it('exposes five components with the specified maximum points', () => {
    const result = calculateDataConfidence([feed()], 1);
    expect(result.components).toHaveLength(5);
    expect(result.components.map((c) => c.maxPoints)).toEqual([30, 25, 20, 15, 10]);
    expect(result.components.map((c) => c.key)).toEqual([
      'freshness',
      'completeness',
      'terminology',
      'participation',
      'integrity',
    ]);
  });
});

describe('component behaviour', () => {
  it('scores a very fresh feed at full marks and a stale one at zero', () => {
    expect(freshnessFor(0)).toBe(100);
    expect(freshnessFor(5)).toBe(100);
    expect(freshnessFor(120)).toBe(0);
    expect(freshnessFor(500)).toBe(0);
    expect(freshnessFor(62)).toBeGreaterThan(0);
    expect(freshnessFor(62)).toBeLessThan(100);
  });

  it('gives a perfect score when everything is ideal', () => {
    const result = calculateDataConfidence(
      [feed({ minutesSinceLastEvent: 1, terminologyMappedPercent: 100, completenessPercent: 100 })],
      1,
    );
    expect(result.score).toBe(100);
    expect(result.level).toBe('Very High');
  });

  it('weights completeness and mapping by how many events each feed delivered', () => {
    const result = calculateDataConfidence(
      [
        feed({ hospitalId: 'HOSP-A', eventsReceived: 90, terminologyMappedPercent: 100 }),
        feed({ hospitalId: 'HOSP-B', eventsReceived: 10, terminologyMappedPercent: 50 }),
      ],
      2,
    );
    // Weighted: (90*100 + 10*50) / 100 = 95, not the unweighted mean of 75.
    expect(result.terminologyMappedPercent).toBeCloseTo(95, 6);
  });

  it('drops participation when a facility is offline', () => {
    const result = calculateDataConfidence(
      [feed({ hospitalId: 'HOSP-A' }), feed({ hospitalId: 'HOSP-B', isReporting: false, status: 'OFFLINE', eventsReceived: 0 })],
      2,
    );
    const participation = result.components.find((c) => c.key === 'participation');
    expect(participation?.score).toBe(50);
    expect(result.facilitiesReporting).toBe(1);
    expect(result.hasOfflineFacility).toBe(true);
  });

  it('penalises failed and duplicate events', () => {
    const clean = calculateDataConfidence([feed()], 1);
    const dirty = calculateDataConfidence(
      [feed({ failedEvents: 3, duplicateEvents: 2 })],
      1,
    );
    expect(dirty.score).toBeLessThan(clean.score);
    expect(dirty.totalIssues).toBe(5);
  });

  it('returns a zero score when nothing is reporting', () => {
    const result = calculateDataConfidence(
      [feed({ isReporting: false, status: 'OFFLINE', eventsReceived: 0 })],
      1,
    );
    expect(result.score).toBe(0);
    expect(result.level).toBe('Low');
    expect(result.facilitiesReporting).toBe(0);
  });

  it('never describes missing data as an absence of abnormal activity', () => {
    const result = calculateDataConfidence(
      [feed({ isReporting: false, status: 'OFFLINE', eventsReceived: 0 })],
      1,
    );
    expect(result.explanation).toMatch(/not evidence that activity is normal/i);
    expect(result.explanation).not.toMatch(/no abnormal activity/i);
  });

  it('reconciles the weighted contributions with the total', () => {
    DAYS.forEach((day) => {
      const result = getDataConfidence(day);
      const summed = result.components.reduce((sum, c) => sum + c.points, 0);
      expect(Math.abs(summed - result.score)).toBeLessThanOrEqual(2);
    });
  });
});

describe('the five-day simulation', () => {
  it('produces a deterministic score on every call', () => {
    DAYS.forEach((day) => {
      expect(getDataConfidence(day)).toEqual(getDataConfidence(day));
    });
  });

  it('reports all three facilities as participating on every day', () => {
    DAYS.forEach((day) => {
      const result = getDataConfidence(day);
      expect(result.facilitiesReporting).toBe(3);
      expect(result.facilitiesTotal).toBe(3);
      expect(result.hasOfflineFacility).toBe(false);
    });
  });

  it('stays in a plausible High or Very High band throughout', () => {
    DAYS.forEach((day) => {
      const result = getDataConfidence(day);
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(['High', 'Very High']).toContain(result.level);
    });
  });

  it('dips on Day 3, when a facility feed is delayed', () => {
    expect(getDataConfidence(3).score).toBeLessThan(getDataConfidence(2).score);
    expect(getDataConfidence(3).score).toBeLessThan(getDataConfidence(4).score);
  });
});

describe('separation from the outbreak signal score', () => {
  it('does not alter the composite outbreak signal score', () => {
    // The scores the simulation has always produced, unchanged by this phase.
    expect(DAYS.map((day) => getScoreForDay(day).composite)).toEqual([0, 24, 50, 74, 87]);
  });

  it('moves independently of severity', () => {
    // Severity climbs Low -> Critical while confidence stays high: the two
    // readings must not track each other.
    const severities = DAYS.map((day) => getScoreForDay(day).severity);
    const confidences = DAYS.map((day) => getDataConfidence(day).score);
    expect(severities).toEqual(['Low', 'Watch', 'Moderate', 'High', 'Critical']);
    expect(Math.max(...confidences) - Math.min(...confidences)).toBeLessThan(20);
  });

  it('never returns the outbreak score from the confidence model', () => {
    DAYS.forEach((day) => {
      const confidence = getDataConfidence(day);
      const outbreak = getScoreForDay(day);
      expect(confidence).not.toHaveProperty('composite');
      expect(confidence).not.toHaveProperty('severity');
      if (day > 1) expect(confidence.score).not.toBe(outbreak.composite);
    });
  });
});

describe('feed health', () => {
  it('derives status from the raw metrics', () => {
    const base = {
      minutesSinceLastEvent: 3,
      eventsReceived: 100,
      terminologyMappedPercent: 98,
      completenessPercent: 99,
      failedEvents: 0,
      duplicateEvents: 0,
    };
    expect(deriveFeedStatus(base)).toBe('HEALTHY');
    expect(deriveFeedStatus({ ...base, minutesSinceLastEvent: 45 })).toBe('DELAYED');
    expect(deriveFeedStatus({ ...base, minutesSinceLastEvent: 999 })).toBe('OFFLINE');
    expect(deriveFeedStatus({ ...base, eventsReceived: 0 })).toBe('OFFLINE');
    expect(deriveFeedStatus({ ...base, terminologyMappedPercent: 60 })).toBe('DEGRADED');
    expect(deriveFeedStatus({ ...base, completenessPercent: 60 })).toBe('DEGRADED');
    expect(deriveFeedStatus({ ...base, failedEvents: 10 })).toBe('DEGRADED');
  });

  it('treats offline as non-reporting with no usable events', () => {
    const offline = { ...feed(), status: 'OFFLINE' as const, isReporting: false, eventsReceived: 0 };
    expect(offline.isReporting).toBe(false);
    expect(offline.eventsReceived).toBe(0);
  });

  it('matches event counts to the authoritative dataset', () => {
    DAYS.forEach((day) => {
      getAllFeedHealth(day).forEach((item) => {
        expect(item.eventsReceived).toBe(getSiteCounts(day, item.hospitalId).tests);
      });
    });
  });

  it('is deterministic for a given day and facility', () => {
    expect(getFacilityFeedHealth(4, 'HOSP-B')).toEqual(getFacilityFeedHealth(4, 'HOSP-B'));
    expect(getAllFeedHealth(2)).toEqual(getAllFeedHealth(2));
  });

  it('keeps every facility reporting across the five-day simulation', () => {
    DAYS.forEach((day) => {
      getAllFeedHealth(day).forEach((item) => {
        expect(item.isReporting).toBe(true);
        expect(item.status).not.toBe('OFFLINE');
      });
    });
  });

  it('shows the scripted Day 3 delay at the MEDITECH site only', () => {
    const dayThree = getAllFeedHealth(3);
    expect(dayThree.find((f) => f.hospitalId === 'HOSP-C')?.status).toBe('DELAYED');
    expect(dayThree.find((f) => f.hospitalId === 'HOSP-A')?.status).toBe('HEALTHY');
    expect(dayThree.find((f) => f.hospitalId === 'HOSP-B')?.status).toBe('HEALTHY');
    // And it is confined to Day 3.
    expect(getAllFeedHealth(2).find((f) => f.hospitalId === 'HOSP-C')?.status).toBe('HEALTHY');
    expect(getAllFeedHealth(4).find((f) => f.hospitalId === 'HOSP-C')?.status).toBe('HEALTHY');
  });

  it('stamps last-event times on the simulation calendar', () => {
    getAllFeedHealth(5).forEach((item) => {
      expect(item.lastEventAt.startsWith('2025-11-07')).toBe(true);
    });
  });
});
