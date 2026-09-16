import { describe, expect, it } from 'vitest';
import {
  OBSERVATIONS,
  getObservationsForDay,
  getVisibleObservations,
} from '../../data/observations';
import { SCENARIOS, clampDay, getScenario } from '../../data/simulation';
import {
  getAllHospitalMetrics,
  getFirstSignalDay,
  getZipMetrics,
  splitPositivesByHospital,
  splitTestsByHospital,
} from '../selectors';
import { getAlerts, getRegionalAlert } from '../alerts';
import { getTrendSeries } from '../analytics';

describe('synthetic observations', () => {
  it('contains exactly 25 deterministic records', () => {
    expect(OBSERVATIONS).toHaveLength(25);
  });

  it('numbers ids OBS-001 through OBS-025 and patients SYN-P001 through SYN-P025', () => {
    expect(OBSERVATIONS[0].id).toBe('OBS-001');
    expect(OBSERVATIONS[24].id).toBe('OBS-025');
    expect(OBSERVATIONS[0].patientId).toBe('SYN-P001');
    expect(OBSERVATIONS[24].patientId).toBe('SYN-P025');
    expect(new Set(OBSERVATIONS.map((o) => o.patientId)).size).toBe(25);
  });

  it('spreads five observations across each of the five days', () => {
    [1, 2, 3, 4, 5].forEach((day) => {
      expect(getObservationsForDay(day)).toHaveLength(5);
    });
  });

  it('uses only synthetic patient identifiers', () => {
    OBSERVATIONS.forEach((observation) => {
      expect(observation.patientId).toMatch(/^SYN-P\d{3}$/);
    });
  });

  it('carries the required FHIR-style fields on every record', () => {
    OBSERVATIONS.forEach((observation) => {
      expect(observation.resourceType).toBe('Observation');
      expect(observation.status).toBe('final');
      expect(observation.fhirStatus).toBe('Received');
      expect(observation.normalized).toBe(true);
      expect(observation.syndrome).toBe('Respiratory Viral Syndrome');
      expect(['92142-9', '94500-6', '85479-4']).toContain(observation.loincCode);
      expect(observation.effectiveDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });
  });

  it('matches the blueprint result distribution for the first positive', () => {
    const first = OBSERVATIONS.find((observation) => observation.result === 'Positive');
    expect(first?.id).toBe('OBS-006');
    expect(first?.day).toBe(2);
    expect(first?.hospitalId).toBe('HOSP-A');
    expect(first?.testName).toBe('Influenza A RNA');
  });
});

describe('simulation day filtering', () => {
  it('reveals observations cumulatively as the day advances', () => {
    expect(getVisibleObservations(1)).toHaveLength(5);
    expect(getVisibleObservations(2)).toHaveLength(10);
    expect(getVisibleObservations(3)).toHaveLength(15);
    expect(getVisibleObservations(4)).toHaveLength(20);
    expect(getVisibleObservations(5)).toHaveLength(25);
  });

  it('never leaks a future observation into an earlier day', () => {
    [1, 2, 3, 4, 5].forEach((day) => {
      getVisibleObservations(day).forEach((observation) => {
        expect(observation.day).toBeLessThanOrEqual(day);
      });
    });
  });

  it('shows no positive results at all on Day 1', () => {
    expect(
      getVisibleObservations(1).every((observation) => observation.result === 'Negative'),
    ).toBe(true);
  });
});

describe('clampDay', () => {
  it('holds the simulation inside days 1 through 5', () => {
    expect(clampDay(0)).toBe(1);
    expect(clampDay(-7)).toBe(1);
    expect(clampDay(3)).toBe(3);
    expect(clampDay(6)).toBe(5);
    expect(clampDay(99)).toBe(5);
  });
});

describe('scenario table', () => {
  it('defines the five specified stages', () => {
    expect(SCENARIOS.map((scenario) => scenario.stage)).toEqual([
      'Baseline',
      'Early Local Increase',
      'Rising Positivity',
      'Multi-Site Cluster',
      'Regional Early-Warning Signal',
    ]);
  });

  it('matches the specified aggregate values', () => {
    expect(SCENARIOS.map((s) => s.totalTests)).toEqual([100, 124, 141, 158, 176]);
    expect(SCENARIOS.map((s) => s.positivityRate)).toEqual([8.0, 9.5, 13.2, 16.4, 19.1]);
    expect(SCENARIOS.map((s) => s.affectedHospitals.length)).toEqual([0, 1, 2, 3, 3]);
    expect(SCENARIOS.map((s) => s.affectedZipCodes.length)).toEqual([0, 1, 2, 3, 3]);
    expect(SCENARIOS.map((s) => s.persistenceDays)).toEqual([0, 1, 2, 3, 4]);
  });

  it('throws for a day outside the simulation', () => {
    expect(() => getScenario(9)).toThrow();
  });
});

describe('per-site allocation', () => {
  it('splits test volume so the parts sum to the regional total', () => {
    SCENARIOS.forEach((scenario) => {
      const split = splitTestsByHospital(scenario.totalTests);
      const sum = Object.values(split).reduce((total, value) => total + value, 0);
      expect(sum).toBe(scenario.totalTests);
    });
  });

  it('splits positives so the parts sum to the regional positive count', () => {
    SCENARIOS.forEach((scenario) => {
      const expected = Math.round((scenario.totalTests * scenario.positivityRate) / 100);
      const split = splitPositivesByHospital(scenario.day);
      const sum = Object.values(split).reduce((total, value) => total + value, 0);
      expect(sum).toBe(expected);
    });
  });

  it('never allocates more positives than tests at a site', () => {
    SCENARIOS.forEach((scenario) => {
      const tests = splitTestsByHospital(scenario.totalTests);
      const positives = splitPositivesByHospital(scenario.day);
      (Object.keys(tests) as Array<keyof typeof tests>).forEach((id) => {
        expect(positives[id]).toBeLessThanOrEqual(tests[id]);
      });
    });
  });
});

describe('surveillance area metrics', () => {
  it('marks no area affected on Day 1', () => {
    getZipMetrics(1).forEach((area) => {
      expect(area.isAffected).toBe(false);
      expect(area.severity).toBe('Low');
    });
  });

  it('escalates affected areas as the simulation advances', () => {
    expect(getZipMetrics(2).filter((area) => area.isAffected)).toHaveLength(1);
    expect(getZipMetrics(3).filter((area) => area.isAffected)).toHaveLength(2);
    expect(getZipMetrics(5).filter((area) => area.isAffected)).toHaveLength(3);
  });

  it('reproduces the blueprint example for 01604 on Day 5', () => {
    const area = getZipMetrics(5).find((item) => item.zipCode === '01604');
    expect(area?.totalTests).toBe(72);
    expect(area?.positiveTests).toBe(14);
    expect(area?.positivityRate).toBeCloseTo(19.4, 1);
    expect(area?.severity).toBe('Critical');
  });
});

describe('hospital metrics', () => {
  it('reports the first signal day specified for each site', () => {
    expect(getFirstSignalDay('HOSP-A')).toBe(2);
    expect(getFirstSignalDay('HOSP-B')).toBe(3);
    expect(getFirstSignalDay('HOSP-C')).toBe(4);
  });

  it('only exposes observations up to the current day', () => {
    getAllHospitalMetrics(3).forEach((metrics) => {
      metrics.observations.forEach((observation) => {
        expect(observation.day).toBeLessThanOrEqual(3);
      });
    });
  });

  it('builds a chart series that stops at the current day', () => {
    expect(getAllHospitalMetrics(3)[0].volumeSeries).toHaveLength(3);
    expect(getAllHospitalMetrics(5)[0].positivitySeries).toHaveLength(5);
  });
});

describe('alert generation', () => {
  it('raises no alerts at baseline', () => {
    expect(getAlerts(1)).toHaveLength(0);
    expect(getRegionalAlert(1)).toBeUndefined();
  });

  it('adds alerts as the outbreak develops', () => {
    expect(getAlerts(2).map((alert) => alert.kind)).toEqual(['volume']);
    expect(getAlerts(3).map((alert) => alert.kind).sort()).toEqual(['positivity', 'volume']);
    expect(getAlerts(4).map((alert) => alert.kind).sort()).toEqual([
      'cluster',
      'positivity',
      'regional',
      'volume',
    ]);
  });

  it('exposes exactly one investigable regional signal once triggered', () => {
    const alerts = getAlerts(5);
    expect(alerts.filter((alert) => alert.investigable)).toHaveLength(1);
    expect(getRegionalAlert(5)?.severity).toBe('Critical');
  });

  it('marks an alert NEW only on the day it first triggers', () => {
    expect(getAlerts(4).find((alert) => alert.kind === 'regional')?.status).toBe('NEW');
    expect(getAlerts(5).find((alert) => alert.kind === 'regional')?.status).toBe(
      'Acknowledged',
    );
  });
});

describe('analytics series', () => {
  it('runs Day 1 through the current day only', () => {
    expect(getTrendSeries(1)).toHaveLength(1);
    expect(getTrendSeries(3).map((point) => point.day)).toEqual([1, 2, 3]);
    expect(getTrendSeries(5)).toHaveLength(5);
  });

  it('carries the calculated score on every point', () => {
    expect(getTrendSeries(5).map((point) => point.score)).toEqual([0, 23, 49, 74, 86]);
  });
});
