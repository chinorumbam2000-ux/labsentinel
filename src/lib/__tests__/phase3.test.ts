import { describe, expect, it } from 'vitest';
import {
  ACTIVE_HIERARCHY,
  AVAILABLE_HIERARCHIES,
  GEOGRAPHY_CONFIGURABILITY_NOTE,
  GLOBAL_TEMPLATE_HIERARCHY,
  US_HIERARCHY,
  describeHierarchy,
  getAncestorAtLevel,
  getAncestry,
  getBroaderLevel,
  getLevel,
  getLevelLabels,
  getUnit,
  getUnitsAtLevel,
} from '../../data/geography';
import {
  FEDERATED_NOTE,
  FUTURE_CONCEPT_LABEL,
  MULTI_SOURCE_NOTE,
  SOURCE_ADAPTERS,
  SURVEILLANCE_SOURCES,
  buildExampleAggregatePayload,
  getActiveSourceTypes,
  getAllSurveillanceSignals,
  getSourceAvailability,
  laboratoryAdapter,
} from '../surveillanceSources';
import {
  GEOGRAPHIC_HIERARCHY,
  broaderLevel,
  getAreaPositivePrivacy,
  getDisclosureSummary,
  getSuppressedAreaCount,
} from '../geographicPrivacy';
import { getScoreForDay } from '../selectors';
import { getDataConfidence } from '../dataConfidence';
import { SIMULATION_DAYS, getRegionalCounts, getSiteCounts } from '../../data/dataset';

const DAYS = SIMULATION_DAYS;

/* ============ A. CONFIGURABLE GEOGRAPHY ============ */

describe('geographic hierarchy is configurable', () => {
  it('models units with id, name, type, parentId and countryCode', () => {
    const zip = getUnit('01604');
    expect(zip).toBeDefined();
    expect(zip).toMatchObject({
      id: '01604',
      type: 'zip',
      parentId: 'US-MA-WORCESTER',
      countryCode: 'US',
    });
    expect(typeof zip?.name).toBe('string');
  });

  it('runs the US configuration with Facility to ZIP to County to State to Country', () => {
    expect(ACTIVE_HIERARCHY.id).toBe(US_HIERARCHY.id);
    expect(ACTIVE_HIERARCHY.levels.map((l) => l.id)).toEqual([
      'facility',
      'zip',
      'county',
      'state',
      'country',
    ]);
    expect(describeHierarchy(US_HIERARCHY)).toBe(
      'Participating facility → ZIP Code → County → State → Country',
    );
  });

  it('offers a global template using District and Province', () => {
    expect(GLOBAL_TEMPLATE_HIERARCHY.levels.map((l) => l.id)).toEqual([
      'facility',
      'district',
      'province',
      'country',
    ]);
    expect(describeHierarchy(GLOBAL_TEMPLATE_HIERARCHY)).toBe(
      'Participating facility → District → Province or region → Country',
    );
  });

  it('builds no second-country dataset — the template has no units', () => {
    expect(GLOBAL_TEMPLATE_HIERARCHY.units).toHaveLength(0);
    expect(AVAILABLE_HIERARCHIES).toHaveLength(2);
  });

  it('walks a facility up the full ancestry', () => {
    const chain = getAncestry('HOSP-A').map((unit) => unit.type);
    expect(chain).toEqual(['facility', 'zip', 'county', 'state', 'country']);
    expect(getAncestorAtLevel('HOSP-A', 'county')?.name).toBe('Worcester County');
    expect(getAncestorAtLevel('01545', 'state')?.name).toBe('Massachusetts');
    expect(getAncestorAtLevel('01545', 'country')?.id).toBe('US');
  });

  it('resolves the next broader level from the configuration', () => {
    expect(getBroaderLevel('zip')?.id).toBe('county');
    expect(getBroaderLevel('county')?.id).toBe('state');
    expect(getBroaderLevel('country')).toBeNull();
    // The global template resolves its own chain from the same code.
    expect(getBroaderLevel('district', GLOBAL_TEMPLATE_HIERARCHY)?.id).toBe('province');
    expect(getBroaderLevel('province', GLOBAL_TEMPLATE_HIERARCHY)?.id).toBe('country');
  });

  it('counts the configured units at each level', () => {
    expect(getUnitsAtLevel('facility')).toHaveLength(3);
    expect(getUnitsAtLevel('zip')).toHaveLength(3);
    expect(getUnitsAtLevel('county')).toHaveLength(1);
    expect(getUnitsAtLevel('state')).toHaveLength(1);
    expect(getUnitsAtLevel('country')).toHaveLength(1);
  });

  it('exposes the configurability statement', () => {
    expect(GEOGRAPHY_CONFIGURABILITY_NOTE).toMatch(/geographically configurable/i);
    expect(GEOGRAPHY_CONFIGURABILITY_NOTE).toMatch(/districts, municipalities, provinces/i);
  });

  it('has no orphaned parents and one root', () => {
    const ids = new Set(ACTIVE_HIERARCHY.units.map((u) => u.id));
    const roots = ACTIVE_HIERARCHY.units.filter((u) => u.parentId === null);
    expect(roots).toHaveLength(1);
    ACTIVE_HIERARCHY.units.forEach((unit) => {
      if (unit.parentId !== null) expect(ids.has(unit.parentId)).toBe(true);
    });
  });

  it('keeps every level definition resolvable', () => {
    ACTIVE_HIERARCHY.levels.forEach((level) => {
      expect(getLevel(level.id)?.label).toBe(level.label);
    });
  });
});

describe('privacy still behaves exactly as before, now driven by the config', () => {
  it('derives the roll-up chain from the active hierarchy', () => {
    expect(GEOGRAPHIC_HIERARCHY).toEqual(getLevelLabels());
    expect(GEOGRAPHIC_HIERARCHY).toEqual([
      'Facility',
      'ZIP',
      'County',
      'State',
      'Country',
    ]);
  });

  it('keeps ZIP rolling up to County and County to State', () => {
    expect(broaderLevel('ZIP')).toBe('County');
    expect(broaderLevel('County')).toBe('State');
    expect(broaderLevel('State')).toBe('Country');
    expect(broaderLevel('Country')).toBeNull();
  });

  it('suppresses and rolls up exactly as it did in Phase 2', () => {
    expect(DAYS.map((day) => getSuppressedAreaCount(day))).toEqual([3, 2, 1, 0, 0]);
    const privacy = getAreaPositivePrivacy(1, 'HOSP-C');
    expect(privacy.suppressed).toBe(true);
    expect(privacy.rollupLevel).toBe('County');
    expect(privacy.rollupLabel).toBe('Worcester County');
    expect(privacy.rollupValue).toBe(String(getRegionalCounts(1).positives));
    expect(privacy.rawCount).toBeNull();
  });

  it('keeps the disclosure summaries unchanged', () => {
    expect(getDisclosureSummary(1)).toMatch(/All 3 surveillance areas report fewer than/);
    expect(getDisclosureSummary(5)).toMatch(/All 3 surveillance areas meet/);
  });
});

/* ============ B. MULTI-SOURCE HOOKS ============ */

describe('multi-source surveillance hooks', () => {
  it('declares all six stream types', () => {
    expect(SURVEILLANCE_SOURCES.map((s) => s.type).sort()).toEqual([
      'EMERGENCY_DEPARTMENT',
      'HOSPITALIZATION',
      'LABORATORY',
      'OTHER',
      'PHARMACY',
      'WASTEWATER',
    ]);
  });

  it('keeps LABORATORY as the only active source', () => {
    expect(getActiveSourceTypes()).toEqual(['LABORATORY']);
    expect(getSourceAvailability('LABORATORY')).toBe('ACTIVE');
    (['EMERGENCY_DEPARTMENT', 'HOSPITALIZATION', 'WASTEWATER', 'PHARMACY', 'OTHER'] as const).forEach(
      (type) => expect(getSourceAvailability(type)).toBe('PLANNED'),
    );
  });

  it('never fabricates data for a planned source', () => {
    SOURCE_ADAPTERS.filter((a) => a.availability === 'PLANNED').forEach((adapter) => {
      DAYS.forEach((day) => {
        expect(adapter.getSignals(day)).toHaveLength(0);
      });
    });
  });

  it('maps the existing laboratory data into the generic signal shape', () => {
    const signals = laboratoryAdapter.getSignals(5);
    // Two metrics per facility, three facilities.
    expect(signals).toHaveLength(6);

    signals.forEach((signal) => {
      expect(signal.sourceType).toBe('LABORATORY');
      expect(signal.syndrome).toBe('Respiratory Viral Syndrome');
      expect(signal.geography.countryCode).toBe('US');
      expect(signal.geography.level).toBe('zip');
      expect(signal.timestamp.startsWith('2025-11-07')).toBe(true);
      expect(signal.quality).toBeGreaterThan(0);
      expect(signal.quality).toBeLessThanOrEqual(100);
      expect(typeof signal.organization.name).toBe('string');
    });
  });

  it('carries values that match the authoritative dataset', () => {
    const signals = laboratoryAdapter.getSignals(5);
    const volume = signals.find(
      (s) => s.metric === 'test_volume' && s.organization.id === 'HOSP-A',
    );
    expect(volume?.value).toBe(getSiteCounts(5, 'HOSP-A').tests);
    expect(volume?.value).toBe(72);
  });

  it('returns only laboratory signals from the combined feed', () => {
    DAYS.forEach((day) => {
      const all = getAllSurveillanceSignals(day);
      expect(all.every((signal) => signal.sourceType === 'LABORATORY')).toBe(true);
      expect(all).toHaveLength(6);
    });
  });

  it('exposes the laboratory-first statement', () => {
    expect(MULTI_SOURCE_NOTE).toMatch(/laboratory-first/i);
    expect(MULTI_SOURCE_NOTE).toMatch(/future versions/i);
  });
});

/* ============ C. FEDERATED CONCEPT ============ */

describe('federated surveillance concept', () => {
  it('is labelled as a future concept', () => {
    expect(FUTURE_CONCEPT_LABEL).toMatch(/not implemented in the current prototype/i);
    expect(FEDERATED_NOTE).toMatch(/reduce unnecessary movement of patient-level/i);
  });

  it('builds an example payload with every documented field', () => {
    const payload = buildExampleAggregatePayload(5, 'HOSP-A');
    expect(Object.keys(payload).sort()).toEqual([
      'anomalyScore',
      'confidenceScore',
      'facilityId',
      'geography',
      'positivityRate',
      'syndrome',
      'testVolume',
      'timestamp',
    ]);
    expect(payload.facilityId).toBe('HOSP-A');
    expect(payload.geography).toBe('01604');
    expect(payload.testVolume).toBe(72);
    expect(payload.positivityRate).toBeCloseTo(19.44, 1);
  });

  it('carries no patient-level content', () => {
    const serialised = JSON.stringify(buildExampleAggregatePayload(5, 'HOSP-B'));
    expect(serialised).not.toMatch(/SYN-P/);
    expect(serialised).not.toMatch(/patientId/i);
    expect(serialised).not.toMatch(/OBS-/);
  });

  it('is deterministic', () => {
    expect(buildExampleAggregatePayload(3, 'HOSP-C')).toEqual(
      buildExampleAggregatePayload(3, 'HOSP-C'),
    );
  });
});

/* ============ EARLIER PHASES ============ */

describe('earlier phases remain intact', () => {
  it('leaves the composite outbreak signal score unchanged', () => {
    expect(DAYS.map((day) => getScoreForDay(day).composite)).toEqual([0, 24, 50, 74, 87]);
    expect(DAYS.map((day) => getScoreForDay(day).severity)).toEqual([
      'Low',
      'Watch',
      'Moderate',
      'High',
      'Critical',
    ]);
  });

  it('leaves data confidence unchanged', () => {
    expect(DAYS.map((day) => getDataConfidence(day).score)).toEqual([98, 97, 94, 97, 97]);
  });

  it('leaves the regional aggregates unchanged', () => {
    expect(DAYS.map((day) => getRegionalCounts(day).tests)).toEqual([
      100, 124, 141, 158, 176,
    ]);
    expect(DAYS.map((day) => getRegionalCounts(day).positives)).toEqual([
      8, 12, 19, 26, 34,
    ]);
  });
});
