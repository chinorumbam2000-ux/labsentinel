import { describe, expect, it } from 'vitest';
import type { AcknowledgementRecord } from '../../types';
import { ALL_DETECTIONS, getAlerts, getNewTodayCount, getRegionalAlert, getUnacknowledgedCount } from '../alerts';
import { getScoreForDay } from '../selectors';
import { getScenario, simulationDateFor } from '../../data/simulation';

const ack = (day: 1 | 2 | 3 | 4 | 5): AcknowledgementRecord => ({
  day,
  simulationTime: `${simulationDateFor(day)}T17:00:00`,
  realTime: '2026-09-16T12:00:00.000Z',
});

describe('detection is separate from acknowledgement', () => {
  it('raises no alerts at baseline', () => {
    expect(getAlerts(1)).toHaveLength(0);
    expect(getRegionalAlert(1)).toBeUndefined();
    expect(getUnacknowledgedCount(1)).toBe(0);
  });

  it('adds alerts as the outbreak develops', () => {
    expect(getAlerts(2).map((a) => a.kind)).toEqual(['volume']);
    expect(getAlerts(3).map((a) => a.kind).sort()).toEqual(['positivity', 'volume']);
    expect(getAlerts(4).map((a) => a.kind).sort()).toEqual([
      'cluster',
      'positivity',
      'regional',
      'volume',
    ]);
    expect(getAlerts(5)).toHaveLength(4);
  });

  it('NEVER auto-acknowledges an alert as the simulation advances', () => {
    // The old behaviour flipped earlier alerts to Acknowledged on day change.
    const atDayFive = getAlerts(5);
    expect(atDayFive.every((alert) => alert.status !== 'Acknowledged')).toBe(true);
    expect(atDayFive.filter((alert) => alert.status === 'Active').length).toBeGreaterThan(0);
  });

  it('marks an alert New only on its own detection day, Active afterwards', () => {
    const volumeAtDay2 = getAlerts(2).find((a) => a.kind === 'volume');
    const volumeAtDay5 = getAlerts(5).find((a) => a.kind === 'volume');
    expect(volumeAtDay2?.status).toBe('New');
    expect(volumeAtDay5?.status).toBe('Active');
  });

  it('becomes Acknowledged only when an acknowledgement record exists', () => {
    const volume = getAlerts(5).find((a) => a.kind === 'volume');
    expect(volume?.status).toBe('Active');

    const acknowledged = getAlerts(5, { [volume!.id]: ack(5) }).find(
      (a) => a.kind === 'volume',
    );
    expect(acknowledged?.status).toBe('Acknowledged');
    expect(acknowledged?.acknowledgement?.day).toBe(5);
  });

  it('counts unacknowledged alerts, not "new today" alerts', () => {
    expect(getUnacknowledgedCount(5)).toBe(4);
    const volume = ALL_DETECTIONS.find((d) => d.kind === 'volume')!;
    expect(getUnacknowledgedCount(5, { [volume.id]: ack(5) })).toBe(3);
    // "New today" is a different number and counts only today's detections.
    expect(getNewTodayCount(5)).toBe(0);
    expect(getNewTodayCount(4)).toBe(2);
    expect(getNewTodayCount(2)).toBe(1);
  });
});

describe('detection-time values are frozen', () => {
  it('keeps the volume alert reporting its Day 2 figures at every later day', () => {
    const day2 = getScoreForDay(2);
    const expected = `+${day2.volumeIncreasePercent.toFixed(0)}% vs baseline`;

    [2, 3, 4, 5].forEach((day) => {
      const alert = getAlerts(day).find((a) => a.kind === 'volume');
      expect(alert?.detectedDay).toBe(2);
      expect(alert?.detection.detail).toBe(expected);
      expect(alert?.detection.totalTests).toBe(getScenario(2).totalTests);
      expect(alert?.detection.compositeScore).toBe(day2.composite);
    });
  });

  it('does not let a later day change any snapshot field', () => {
    const atDetection = getAlerts(4).find((a) => a.kind === 'regional');
    const later = getAlerts(5).find((a) => a.kind === 'regional');
    expect(later?.detection).toEqual(atDetection?.detection);
    expect(later?.detectedAt).toBe(atDetection?.detectedAt);
    expect(later?.detection.severity).toBe(atDetection?.detection.severity);
  });

  it('keeps the detection timestamp on the simulation calendar', () => {
    getAlerts(5).forEach((alert) => {
      expect(alert.detectedAt.startsWith(simulationDateFor(alert.detectedDay))).toBe(true);
    });
    const volume = getAlerts(5).find((a) => a.kind === 'volume');
    expect(volume?.detectedAt).toBe('2025-11-04T09:05:00');
  });
});

describe('moving backwards and forwards', () => {
  it('hides later detections when moving backwards', () => {
    expect(getAlerts(5)).toHaveLength(4);
    expect(getAlerts(2)).toHaveLength(1);
    expect(getAlerts(1)).toHaveLength(0);
  });

  it('does not invent or discard acknowledgements when moving backwards', () => {
    const volume = ALL_DETECTIONS.find((d) => d.kind === 'volume')!;
    const acknowledgements = { [volume.id]: ack(5) };

    // Acknowledged at Day 5, still acknowledged when we step back to Day 2.
    expect(getAlerts(2, acknowledgements).find((a) => a.kind === 'volume')?.status).toBe(
      'Acknowledged',
    );
    // And nothing else got acknowledged along the way.
    expect(getAlerts(5, acknowledgements).filter((a) => a.status === 'Acknowledged')).toHaveLength(1);
  });

  it('restores the full history when moving forward again', () => {
    const back = getAlerts(3);
    const forward = getAlerts(5);
    expect(back).toHaveLength(2);
    expect(forward).toHaveLength(4);
    back.forEach((alert) => {
      const later = forward.find((item) => item.id === alert.id);
      expect(later?.detection).toEqual(alert.detection);
    });
  });
});

describe('regional signal', () => {
  it('exposes exactly one investigable regional signal once triggered', () => {
    const alerts = getAlerts(5);
    expect(alerts.filter((alert) => alert.investigable)).toHaveLength(1);
    expect(getRegionalAlert(5)?.kind).toBe('regional');
  });

  it('is detected on the first day the composite reaches the trigger', () => {
    expect(getRegionalAlert(4)?.detectedDay).toBe(4);
    expect(getRegionalAlert(5)?.detectedDay).toBe(4);
  });
});
