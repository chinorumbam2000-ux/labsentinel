import { describe, expect, it } from 'vitest';
import {
  OBSERVATIONS,
  getObservationsForDay,
  getObservationsForSiteDay,
  getVisibleObservations,
} from '../../data/observations';
import {
  SCENARIOS,
  clampDay,
  getScenario,
  isValidDay,
  simulationDateFor,
} from '../../data/simulation';
import {
  BASELINE_POSITIVITY_RATE,
  HOSPITAL_IDS,
  SIMULATION_DAYS,
  SITE_DAY_COUNTS,
  getAffectedHospitals,
  getCumulativeRegionalCounts,
  getCumulativeSiteCounts,
  getPersistenceDays,
  getRegionalCounts,
  getSiteCounts,
  positivityOf,
} from '../../data/dataset';
import {
  getAllHospitalMetrics,
  getFirstSignalDay,
  getHospitalMetrics,
  getScoreForDay,
  getZipMetrics,
} from '../selectors';
import { HOSPITALS } from '../../data/hospitals';
import { getTrendSeries } from '../analytics';

const DAYS = SIMULATION_DAYS;

describe('authoritative dataset: hospital totals sum to regional totals', () => {
  it.each(DAYS)('day %i site tests sum to the regional test total', (day) => {
    const regional = getRegionalCounts(day);
    const summed = HOSPITAL_IDS.reduce((sum, id) => sum + getSiteCounts(day, id).tests, 0);
    expect(summed).toBe(regional.tests);
  });

  it.each(DAYS)('day %i site positives sum to the regional positive total', (day) => {
    const regional = getRegionalCounts(day);
    const summed = HOSPITAL_IDS.reduce(
      (sum, id) => sum + getSiteCounts(day, id).positives,
      0,
    );
    expect(summed).toBe(regional.positives);
  });

  it.each(DAYS)('day %i never allocates more positives than tests at a site', (day) => {
    HOSPITAL_IDS.forEach((id) => {
      const counts = getSiteCounts(day, id);
      expect(counts.positives).toBeLessThanOrEqual(counts.tests);
      expect(counts.positives).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(counts.tests)).toBe(true);
      expect(Number.isInteger(counts.positives)).toBe(true);
    });
  });

  it('keeps the specified regional test volumes', () => {
    expect(DAYS.map((day) => getRegionalCounts(day).tests)).toEqual([
      100, 124, 141, 158, 176,
    ]);
  });
});

describe('regional positivity is positives / tests, not an average of site rates', () => {
  it.each(DAYS)('day %i regional positivity equals the pooled ratio', (day) => {
    const regional = getRegionalCounts(day);
    expect(regional.positivityRate).toBeCloseTo(
      (regional.positives / regional.tests) * 100,
      10,
    );
  });

  it.each(DAYS)('day %i regional positivity is NOT the unweighted site mean', (day) => {
    const regional = getRegionalCounts(day);
    const unweightedMean =
      HOSPITAL_IDS.reduce((sum, id) => sum + positivityOf(getSiteCounts(day, id)), 0) /
      HOSPITAL_IDS.length;
    // They may coincide by chance; the contract is that we use the pooled ratio.
    expect(regional.positivityRate).toBeCloseTo(
      (regional.positives / regional.tests) * 100,
      10,
    );
    if (day > 1) {
      expect(Math.abs(regional.positivityRate - unweightedMean)).toBeLessThan(5);
    }
  });

  it('produces the corrected displayed positivity for each day', () => {
    expect(DAYS.map((day) => getRegionalCounts(day).positivityRate.toFixed(1))).toEqual([
      '8.0',
      '9.7',
      '13.5',
      '16.5',
      '19.3',
    ]);
  });

  it('agrees with what the dashboard, analytics and sidecars all read', () => {
    DAYS.forEach((day) => {
      const scenario = getScenario(day);
      const regional = getRegionalCounts(day);
      // Scenario is the single object every screen reads from.
      expect(scenario.totalTests).toBe(regional.tests);
      expect(scenario.totalPositives).toBe(regional.positives);
      expect(scenario.positivityRate).toBe(regional.positivityRate);
      // The ratio the user can compute by hand from the displayed counts.
      expect((scenario.totalPositives / scenario.totalTests) * 100).toBeCloseTo(
        scenario.positivityRate,
        10,
      );
    });
  });
});

describe('geographic totals reconcile with the same population', () => {
  it.each(DAYS)('day %i area totals sum to the regional totals', (day) => {
    const areas = getZipMetrics(day);
    const regional = getRegionalCounts(day);
    expect(areas.reduce((sum, area) => sum + area.totalTests, 0)).toBe(regional.tests);
    expect(areas.reduce((sum, area) => sum + area.positiveTests, 0)).toBe(
      regional.positives,
    );
  });

  it.each(DAYS)('day %i each area matches its own hospital counts', (day) => {
    getZipMetrics(day).forEach((area) => {
      const counts = getSiteCounts(day, area.hospitalId);
      expect(area.totalTests).toBe(counts.tests);
      expect(area.positiveTests).toBe(counts.positives);
      expect(area.positivityRate).toBeCloseTo(positivityOf(counts), 10);
    });
  });

  it.each(DAYS)('day %i cumulative area totals match cumulative site counts', (day) => {
    getZipMetrics(day).forEach((area) => {
      const cumulative = getCumulativeSiteCounts(day, area.hospitalId);
      expect(area.cumulativeTests).toBe(cumulative.tests);
      expect(area.cumulativePositives).toBe(cumulative.positives);
    });
  });
});

describe('laboratory observations reconcile with the day and hospital totals', () => {
  it('generates one record per test in the dataset', () => {
    const expected = DAYS.reduce((sum, day) => sum + getRegionalCounts(day).tests, 0);
    expect(OBSERVATIONS).toHaveLength(expected);
    expect(OBSERVATIONS).toHaveLength(699);
  });

  it.each(DAYS)('day %i record count equals that day regional test total', (day) => {
    expect(getObservationsForDay(day)).toHaveLength(getRegionalCounts(day).tests);
  });

  it.each(DAYS)('day %i positive record count equals the regional positive total', (day) => {
    const positives = getObservationsForDay(day).filter(
      (observation) => observation.result === 'Positive',
    );
    expect(positives).toHaveLength(getRegionalCounts(day).positives);
  });

  it('reconciles every day-and-hospital cell exactly', () => {
    DAYS.forEach((day) => {
      HOSPITAL_IDS.forEach((hospitalId) => {
        const counts = getSiteCounts(day, hospitalId);
        const records = getObservationsForSiteDay(day, hospitalId);
        expect(records).toHaveLength(counts.tests);
        expect(
          records.filter((observation) => observation.result === 'Positive'),
        ).toHaveLength(counts.positives);
      });
    });
  });

  it('cumulative record counts match cumulative dataset totals', () => {
    DAYS.forEach((day) => {
      expect(getVisibleObservations(day)).toHaveLength(
        getCumulativeRegionalCounts(day).tests,
      );
    });
  });

  it('uses only synthetic patient identifiers, all unique', () => {
    OBSERVATIONS.forEach((observation) => {
      expect(observation.patientId).toMatch(/^SYN-P\d{4}$/);
      expect(observation.id).toMatch(/^OBS-\d{4}$/);
    });
    expect(new Set(OBSERVATIONS.map((o) => o.patientId)).size).toBe(OBSERVATIONS.length);
    expect(new Set(OBSERVATIONS.map((o) => o.id)).size).toBe(OBSERVATIONS.length);
  });

  it('carries the required FHIR-style fields and known LOINC codes', () => {
    OBSERVATIONS.forEach((observation) => {
      expect(observation.resourceType).toBe('Observation');
      expect(observation.status).toBe('final');
      expect(observation.fhirStatus).toBe('Received');
      expect(observation.normalized).toBe(true);
      expect(observation.syndrome).toBe('Respiratory Viral Syndrome');
      expect(['92142-9', '94500-6', '85479-4']).toContain(observation.loincCode);
      expect(observation.effectiveDateTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
      );
    });
  });

  it('is deterministic — regenerating yields identical records', async () => {
    const again = await import('../../data/observations');
    expect(again.OBSERVATIONS[0]).toEqual(OBSERVATIONS[0]);
    expect(again.OBSERVATIONS[again.OBSERVATIONS.length - 1]).toEqual(
      OBSERVATIONS[OBSERVATIONS.length - 1],
    );
  });

  it('retains the blueprint sample records as the first five of each day', () => {
    const dayOne = getObservationsForDay(1).slice(0, 5);
    expect(dayOne.map((o) => o.hospitalId)).toEqual([
      'HOSP-A',
      'HOSP-A',
      'HOSP-B',
      'HOSP-B',
      'HOSP-C',
    ]);
    expect(dayOne.every((o) => o.result === 'Negative')).toBe(true);

    const dayTwo = getObservationsForDay(2).slice(0, 1)[0];
    expect(dayTwo.hospitalId).toBe('HOSP-A');
    expect(dayTwo.testName).toBe('Influenza A RNA');
    expect(dayTwo.result).toBe('Positive');
  });

  it('stamps records with the simulation calendar, not the real date', () => {
    DAYS.forEach((day) => {
      const expectedDate = simulationDateFor(day);
      getObservationsForDay(day).forEach((observation) => {
        expect(observation.effectiveDateTime.startsWith(expectedDate)).toBe(true);
      });
    });
    expect(simulationDateFor(1)).toBe('2025-11-03');
    expect(simulationDateFor(5)).toBe('2025-11-07');
  });
});

describe('no future records or first-signal dates leak', () => {
  it.each(DAYS)('day %i never exposes an observation from a later day', (day) => {
    getVisibleObservations(day).forEach((observation) => {
      expect(observation.day).toBeLessThanOrEqual(day);
    });
  });

  it('reveals each facility first-signal day only once reached', () => {
    // HOSP-A signals on Day 2, HOSP-B on Day 3, HOSP-C on Day 4.
    expect(getFirstSignalDay('HOSP-A', 1)).toBeNull();
    expect(getFirstSignalDay('HOSP-A', 2)).toBe(2);
    expect(getFirstSignalDay('HOSP-B', 2)).toBeNull();
    expect(getFirstSignalDay('HOSP-B', 3)).toBe(3);
    expect(getFirstSignalDay('HOSP-C', 3)).toBeNull();
    expect(getFirstSignalDay('HOSP-C', 4)).toBe(4);
  });

  it('reports no first-signal day at all on Day 1', () => {
    getAllHospitalMetrics(1).forEach((metrics) => {
      expect(metrics.firstSignalDay).toBeNull();
      expect(metrics.isAffected).toBe(false);
    });
  });

  it('never returns a first-signal day later than the current day', () => {
    DAYS.forEach((day) => {
      getAllHospitalMetrics(day).forEach((metrics) => {
        if (metrics.firstSignalDay !== null) {
          expect(metrics.firstSignalDay).toBeLessThanOrEqual(day);
        }
      });
    });
  });

  it('limits every hospital chart series to the current day', () => {
    DAYS.forEach((day) => {
      getAllHospitalMetrics(day).forEach((metrics) => {
        expect(metrics.volumeSeries).toHaveLength(day);
        expect(metrics.positivitySeries).toHaveLength(day);
        metrics.observations.forEach((observation) => {
          expect(observation.day).toBeLessThanOrEqual(day);
        });
      });
    });
  });
});

describe('derived detection inputs', () => {
  it('derives affected facilities from each site own positivity', () => {
    expect(DAYS.map((day) => getAffectedHospitals(day).length)).toEqual([0, 1, 2, 3, 3]);
  });

  it('only flags a facility whose positivity is above the detection margin', () => {
    DAYS.forEach((day) => {
      const affected = getAffectedHospitals(day);
      HOSPITAL_IDS.forEach((id) => {
        const delta = positivityOf(getSiteCounts(day, id)) - BASELINE_POSITIVITY_RATE;
        expect(affected.includes(id)).toBe(delta >= 3 - 1e-9);
      });
    });
  });

  it('derives persistence from consecutive above-baseline days', () => {
    expect(DAYS.map((day) => getPersistenceDays(day))).toEqual([0, 1, 2, 3, 4]);
  });

  it('maps affected ZIP codes to affected facilities', () => {
    DAYS.forEach((day) => {
      const scenario = getScenario(day);
      expect(scenario.affectedZipCodes).toHaveLength(scenario.affectedHospitals.length);
      scenario.affectedHospitals.forEach((id) => {
        const hospital = HOSPITALS.find((item) => item.id === id);
        expect(scenario.affectedZipCodes).toContain(hospital?.zipCode);
      });
    });
  });
});

describe('every screen reads the same regional metrics and score', () => {
  it.each(DAYS)('day %i score is identical across all consumers', (day) => {
    const direct = getScoreForDay(day);
    const viaScenario = getScoreForDay(getScenario(day).day);
    const trend = getTrendSeries(day);
    const viaTrend = trend[trend.length - 1];
    expect(viaScenario.composite).toBe(direct.composite);
    expect(viaTrend?.score).toBe(direct.composite);
    expect(viaTrend?.tests).toBe(getRegionalCounts(day).tests);
    expect(viaTrend?.positivity).toBe(getRegionalCounts(day).positivityRate);
  });

  it.each(DAYS)('day %i hospital metrics agree with the dataset', (day) => {
    HOSPITALS.forEach((hospital) => {
      const metrics = getHospitalMetrics(hospital, day);
      const counts = getSiteCounts(day, hospital.id);
      const cumulative = getCumulativeSiteCounts(day, hospital.id);
      expect(metrics.totalTests).toBe(counts.tests);
      expect(metrics.positiveTests).toBe(counts.positives);
      expect(metrics.positivityRate).toBeCloseTo(positivityOf(counts), 10);
      expect(metrics.cumulativeTests).toBe(cumulative.tests);
      expect(metrics.cumulativePositives).toBe(cumulative.positives);
      expect(metrics.observations).toHaveLength(cumulative.tests);
      expect(metrics.dayObservations).toHaveLength(counts.tests);
    });
  });

  it.each(DAYS)('day %i hospital metrics sum back to the regional totals', (day) => {
    const all = getAllHospitalMetrics(day);
    const regional = getRegionalCounts(day);
    expect(all.reduce((sum, m) => sum + m.totalTests, 0)).toBe(regional.tests);
    expect(all.reduce((sum, m) => sum + m.positiveTests, 0)).toBe(regional.positives);
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

  it('throws for a day outside the simulation', () => {
    expect(() => getScenario(9)).toThrow();
  });

  it('exposes the simulation calendar date per day', () => {
    expect(SCENARIOS.map((s) => s.simulationDate)).toEqual([
      '2025-11-03',
      '2025-11-04',
      '2025-11-05',
      '2025-11-06',
      '2025-11-07',
    ]);
  });
});

describe('day bounds', () => {
  it('clamps into 1..5', () => {
    expect(clampDay(0)).toBe(1);
    expect(clampDay(-7)).toBe(1);
    expect(clampDay(3)).toBe(3);
    expect(clampDay(6)).toBe(5);
    expect(clampDay(99)).toBe(5);
  });

  it('validates stored day values strictly', () => {
    expect(isValidDay(1)).toBe(true);
    expect(isValidDay(5)).toBe(true);
    expect(isValidDay(0)).toBe(false);
    expect(isValidDay(6)).toBe(false);
    expect(isValidDay(2.5)).toBe(false);
    expect(isValidDay('3')).toBe(false);
    expect(isValidDay(null)).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
    expect(isValidDay(Number.NaN)).toBe(false);
  });
});

describe('the dataset shape itself', () => {
  it('covers every day and every hospital', () => {
    DAYS.forEach((day) => {
      HOSPITAL_IDS.forEach((id) => {
        expect(SITE_DAY_COUNTS[day][id]).toBeDefined();
      });
    });
  });
});
