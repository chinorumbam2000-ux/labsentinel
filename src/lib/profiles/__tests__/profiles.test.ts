/**
 * Surveillance profiles: registry, many-to-many membership, per-profile
 * derivation, status model, ranking, alerts, suppression and selection.
 */
import { describe, expect, it } from 'vitest';
import { OBSERVATIONS } from '../../../data/observations';
import { LAB_TESTS } from '../../../data/tests';
import { SCENARIOS } from '../../../data/simulation';
import { HOSPITAL_IDS, SITE_DAY_COUNTS } from '../../../data/dataset';
import { PORTFOLIO_OBSERVATIONS, PORTFOLIO_SITE_DAY_COUNTS } from '../../../data/portfolio';
import { calculateSignalScore } from '../../signalScore';
import { getAllHospitalMetrics, getScoreForDay, getZipMetrics } from '../../selectors';
import { getTrendSeries } from '../../analytics';
import { ALL_DETECTIONS } from '../../alerts';
import { AFFECTED_MARGIN_POINTS } from '../../../data/dataset';
import {
  getAreaPositivePrivacy,
  getAreaPositivityDisplay,
  getDisclosureSummary,
} from '../../geographicPrivacy';
import {
  DEFAULT_PROFILE_ID,
  PROFILES,
  PROFILE_IDS,
  PROFILE_TESTS,
  RVS_PROFILE_ID,
  TEST_PROFILE_MEMBERSHIP,
  isProfileId,
  profilesForTest,
  settingsFor,
  type ProfileId,
} from '../registry';
import {
  ALL_OBSERVATIONS,
  OBSERVATIONS_BY_PROFILE,
  PROFILE_DAYS,
  getProfileDay,
  profileHospitalMetrics,
  profileTrendSeries,
  profileZipMetrics,
  routeObservations,
  statusFor,
} from '../derive';
import {
  ALL_PROFILE_DETECTIONS,
  activeSignals,
  countStatuses,
  getProfileAlerts,
  rankProfiles,
  summarizeProfiles,
} from '../portfolio';
import {
  profileAreaPositivePrivacy,
  profileAreaPositivityDisplay,
  profileDisclosureSummary,
  areaPrivacyFor,
} from '../privacy';
import { focusProfileFor, parseSelection, withProfileParam } from '../selection';

const DAYS = [1, 2, 3, 4, 5] as const;
const scores = (id: ProfileId) => PROFILE_DAYS[id].map((d) => d.score?.composite ?? null);
const statuses = (day: number) =>
  Object.fromEntries(summarizeProfiles(day).map((s) => [s.profile.id, s.status]));

describe('profile registry', () => {
  it('defines the six initial profiles, in order, with Respiratory Viral Syndrome the default', () => {
    expect(PROFILE_IDS).toEqual([
      'respiratory-viral-syndrome',
      'influenza-a',
      'covid-19',
      'rsv',
      'cholera',
      'gastrointestinal-syndrome',
    ]);
    expect(PROFILES.map((p) => p.displayName)).toEqual([
      'Respiratory Viral Syndrome',
      'Influenza A',
      'COVID-19',
      'RSV',
      'Cholera',
      'Gastrointestinal Syndrome',
    ]);
    expect(DEFAULT_PROFILE_ID).toBe(RVS_PROFILE_ID);
    for (const p of PROFILES) {
      expect(p.active).toBe(true);
      expect(p.testCodes.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(10);
      expect(['Syndrome', 'Pathogen']).toContain(p.category);
      expect(typeof p.replayAvailable).toBe('boolean');
      expect(typeof p.liveAvailable).toBe('boolean');
      expect(p.baselineConfigRef).toBe('illustrative-defaults-v1');
      expect(p.signalConfigRef).toBe('illustrative-defaults-v1');
    }
    // Only the narrated scenario has the replay narrative.
    expect(PROFILES.filter((p) => p.replayAvailable).map((p) => p.id)).toEqual([RVS_PROFILE_ID]);
    // LOINC-mapped profiles can be calculated by the backend engine; demonstration codes never are.
    expect(PROFILES.filter((p) => p.liveAvailable).map((p) => p.id)).toEqual([RVS_PROFILE_ID, 'influenza-a', 'covid-19', 'rsv']);
    expect(PROFILES.map((p) => p.engineKey)).toEqual(['Respiratory Viral Syndrome', 'influenza-a', 'covid-19', 'rsv', 'cholera', 'gastrointestinal-syndrome']);
    expect(isProfileId('covid-19')).toBe(true);
    expect(isProfileId('plague')).toBe(false);
  });

  it('agrees with the existing test catalogue, which is unchanged', () => {
    const loinc = PROFILE_TESTS.filter((t) => t.system === 'http://loinc.org');
    expect(loinc.map((t) => [t.code, t.name])).toEqual(LAB_TESTS.map((t) => [t.loincCode, t.name]));
  });

  it('gives every profile the inherited illustrative defaults', () => {
    for (const id of PROFILE_IDS) {
      const s = settingsFor(id);
      expect(s.label).toBe('Illustrative defaults');
      expect(s.note).toMatch(/Not validated/);
      expect(s.replay).toEqual({
        baselineDay: 1,
        minimumBaselineTests: 10,
        affectedMarginPoints: AFFECTED_MARGIN_POINTS,
        positivityScalePoints: 15,
        persistenceCapDays: 4,
        facilityCap: 3,
        areaCap: 3,
      });
      expect(s.engine).toMatchObject({ baselineWindowDays: 7, minimumBaselineDays: 5, facilityMinimumTests: 10 });
      expect(s.ewma).toEqual({ lambda: 0.25, k: 3, warningFraction: 2 / 3, referenceDays: 28, minimumReferenceDays: 21 });
      expect(s.cusum).toEqual({ k: 0.5, h: 5, approachingFraction: 0.75 });
    }
  });

  it('matches the scorer it feeds: a 15-point rise and 4 days are the full positivity and persistence scales', () => {
    const { replay } = settingsFor(RVS_PROFILE_ID);
    const full = calculateSignalScore({
      totalTests: 100,
      positivityRate: 8 + replay.positivityScalePoints,
      affectedFacilities: 0,
      affectedZipCodes: [],
      persistenceDays: replay.persistenceCapDays,
    });
    expect(full.components.find((c) => c.key === 'positivity')?.score).toBe(100);
    expect(full.components.find((c) => c.key === 'persistence')?.score).toBe(100);
  });
});

describe('test-to-profile membership (many-to-many)', () => {
  it('routes each test code to every profile it belongs to', () => {
    expect(profilesForTest('92142-9')).toEqual(['respiratory-viral-syndrome', 'influenza-a']);
    expect(profilesForTest('94500-6')).toEqual(['respiratory-viral-syndrome', 'covid-19']);
    expect(profilesForTest('85479-4')).toEqual(['respiratory-viral-syndrome', 'rsv']);
    expect(profilesForTest('DEMO-VCH')).toEqual(['cholera', 'gastrointestinal-syndrome']);
    expect(profilesForTest('DEMO-GIP')).toEqual(['gastrointestinal-syndrome']);
    expect(TEST_PROFILE_MEMBERSHIP).toHaveLength(9);
  });

  it('never guesses a profile for an unmapped code (no novel classifier)', () => {
    expect(profilesForTest('12345-6')).toEqual([]);
    expect(profilesForTest('')).toEqual([]);
    const routed = routeObservations([{ ...OBSERVATIONS[0], loincCode: '00000-0' }]);
    expect(Object.values(routed).every((list) => list.length === 0)).toBe(true);
  });

  it('lets one observation update every applicable profile', () => {
    const flu = OBSERVATIONS.find((o) => o.loincCode === '92142-9')!;
    const routed = routeObservations([flu]);
    expect(routed['respiratory-viral-syndrome']).toEqual([flu]);
    expect(routed['influenza-a']).toEqual([flu]);
    expect(routed['covid-19']).toEqual([]);
    const vch = PORTFOLIO_OBSERVATIONS.find((o) => o.loincCode === 'DEMO-VCH')!;
    const routed2 = routeObservations([vch]);
    expect(routed2.cholera).toEqual([vch]);
    expect(routed2['gastrointestinal-syndrome']).toEqual([vch]);
  });

  it('routes the whole feed: the syndrome holds exactly its three pathogens', () => {
    expect(ALL_OBSERVATIONS).toHaveLength(OBSERVATIONS.length + PORTFOLIO_OBSERVATIONS.length);
    expect(OBSERVATIONS_BY_PROFILE['respiratory-viral-syndrome']).toEqual(OBSERVATIONS);
    const parts =
      OBSERVATIONS_BY_PROFILE['influenza-a'].length +
      OBSERVATIONS_BY_PROFILE['covid-19'].length +
      OBSERVATIONS_BY_PROFILE.rsv.length;
    expect(parts).toBe(OBSERVATIONS.length);
    expect(OBSERVATIONS_BY_PROFILE['gastrointestinal-syndrome']).toHaveLength(280);
    expect(OBSERVATIONS_BY_PROFILE.cholera).toHaveLength(9);
  });
});

describe('the narrated scenario is preserved exactly', () => {
  it('scores Respiratory Viral Syndrome 0 / 24 / 50 / 74 / 87', () => {
    expect(scores(RVS_PROFILE_ID)).toEqual([0, 24, 50, 74, 87]);
    for (const day of DAYS) {
      const d = getProfileDay(RVS_PROFILE_ID, day);
      expect(d.score).toEqual(getScoreForDay(day));
      expect(d.scenario).toEqual(SCENARIOS[day - 1]);
      expect(d.baseline).toMatchObject({ tests: 100, positives: 8, sufficient: true });
    }
  });

  it('reproduces the area, facility and trend views exactly', () => {
    for (const day of DAYS) {
      expect(profileZipMetrics(RVS_PROFILE_ID, day)).toEqual(getZipMetrics(day));
      expect(profileHospitalMetrics(RVS_PROFILE_ID, day)).toEqual(getAllHospitalMetrics(day));
      expect(profileTrendSeries(RVS_PROFILE_ID, day)).toEqual(getTrendSeries(day));
    }
  });

  it('keeps its alerts and their ids', () => {
    expect(ALL_PROFILE_DETECTIONS.filter((d) => d.profileId === RVS_PROFILE_ID).map((d) => d.id)).toEqual(
      ALL_DETECTIONS.map((d) => d.id),
    );
  });
});

describe('per-profile scores (never merged)', () => {
  it('scores each profile against its own Day 1 baseline', () => {
    expect(scores('influenza-a')).toEqual([12, 46, 70, 86, 67]);
    expect(scores('covid-19')).toEqual([0, 20, 48, 51, 93]);
    expect(scores('rsv')).toEqual([12, 17, 28, 59, 66]);
    expect(scores('gastrointestinal-syndrome')).toEqual([0, 0, 1, 2, 1]);
    expect(scores('cholera')).toEqual([null, null, null, null, null]);
  });

  it('is deterministic synthetic data that reconciles exactly', () => {
    for (const day of DAYS) {
      for (const h of HOSPITAL_IDS) {
        const gi = OBSERVATIONS_BY_PROFILE['gastrointestinal-syndrome'].filter((o) => o.day === day && o.hospitalId === h);
        const expected = PORTFOLIO_SITE_DAY_COUNTS['DEMO-GIP'][day][h].tests + PORTFOLIO_SITE_DAY_COUNTS['DEMO-VCH'][day][h].tests;
        expect(gi).toHaveLength(expected);
      }
    }
    expect(new Set(PORTFOLIO_OBSERVATIONS.map((o) => o.id)).size).toBe(PORTFOLIO_OBSERVATIONS.length);
    expect(PORTFOLIO_OBSERVATIONS.every((o) => o.patientId.startsWith('SYN-Q'))).toBe(true);
    // The replay's own counts are untouched.
    expect(SITE_DAY_COUNTS[5]['HOSP-A']).toEqual({ tests: 72, positives: 14 });
  });
});

describe('status model', () => {
  it('derives each status in a fixed order', () => {
    expect(statusFor(false, true, true, 'Critical')).toBe('INACTIVE');
    expect(statusFor(true, false, true, null)).toBe('NO_DATA');
    expect(statusFor(true, true, false, null)).toBe('INSUFFICIENT_BASELINE');
    expect(statusFor(true, true, true, 'Low')).toBe('WITHIN_EXPECTED_RANGE');
    expect(statusFor(true, true, true, 'Watch')).toBe('ACTIVE_SIGNAL');
  });

  it('gives each profile its status on each replay day', () => {
    expect(statuses(1)).toEqual({
      'respiratory-viral-syndrome': 'WITHIN_EXPECTED_RANGE',
      'influenza-a': 'WITHIN_EXPECTED_RANGE',
      'covid-19': 'WITHIN_EXPECTED_RANGE',
      rsv: 'WITHIN_EXPECTED_RANGE',
      cholera: 'NO_DATA',
      'gastrointestinal-syndrome': 'WITHIN_EXPECTED_RANGE',
    });
    expect(statuses(3).cholera).toBe('INSUFFICIENT_BASELINE');
    expect(statuses(5)).toEqual({
      'respiratory-viral-syndrome': 'ACTIVE_SIGNAL',
      'influenza-a': 'ACTIVE_SIGNAL',
      'covid-19': 'ACTIVE_SIGNAL',
      rsv: 'ACTIVE_SIGNAL',
      cholera: 'INSUFFICIENT_BASELINE',
      'gastrointestinal-syndrome': 'WITHIN_EXPECTED_RANGE',
    });
  });

  it('never counts no data or a missing baseline as within expected range', () => {
    expect(countStatuses(summarizeProfiles(1))).toEqual({
      activeSignal: 0,
      withinExpectedRange: 5,
      insufficientBaseline: 0,
      noData: 1,
      inactive: 0,
    });
    expect(countStatuses(summarizeProfiles(5))).toEqual({
      activeSignal: 4,
      withinExpectedRange: 1,
      insufficientBaseline: 1,
      noData: 0,
      inactive: 0,
    });
    const cholera = getProfileDay('cholera', 4);
    expect(cholera.score).toBeNull();
    expect(cholera.statusReason).toMatch(/below the minimum of 10/);
    expect(getProfileDay('cholera', 1).statusReason).toMatch(/No data is not the same as normal/);
  });
});

describe('ranking', () => {
  it('sorts by severity, then score, then name, with unscored profiles last', () => {
    expect(rankProfiles(summarizeProfiles(5)).map((s) => s.profile.id)).toEqual([
      'covid-19',
      'respiratory-viral-syndrome',
      'influenza-a',
      'rsv',
      'gastrointestinal-syndrome',
      'cholera',
    ]);
    // Day 1: all Low — score, then name (Influenza A and RSV tie at 12).
    expect(rankProfiles(summarizeProfiles(1)).map((s) => s.profile.displayName)).toEqual([
      'Influenza A',
      'RSV',
      'COVID-19',
      'Gastrointestinal Syndrome',
      'Respiratory Viral Syndrome',
      'Cholera',
    ]);
    // Day 4: Influenza A (86, Critical) outranks Respiratory Viral Syndrome (74, High).
    expect(activeSignals(summarizeProfiles(4)).map((s) => s.profile.id)).toEqual([
      'influenza-a',
      'respiratory-viral-syndrome',
      'rsv',
      'covid-19',
    ]);
  });

  it('uses the data source’s figures for the narrated profile', () => {
    const d5 = getProfileDay(RVS_PROFILE_ID, 5);
    const sourceScore = { ...d5.score!, composite: 12, severity: 'Low' as const };
    const summary = summarizeProfiles(5, { current: { scenario: d5.scenario, score: sourceScore } }).find(
      (s) => s.profile.id === RVS_PROFILE_ID,
    )!;
    expect(summary.score?.composite).toBe(12);
    expect(summary.status).toBe('WITHIN_EXPECTED_RANGE');
  });
});

describe('alerts across profiles', () => {
  it('runs the same rules per profile, with ids that name the profile', () => {
    const ids = ALL_PROFILE_DETECTIONS.map((d) => d.id);
    expect(ids).toContain('ALERT-INFLUENZA-A-REGIONAL-D3');
    expect(ids).toContain('ALERT-COVID-19-REGIONAL-D5');
    expect(ids).toContain('ALERT-RSV-POSITIVITY-D4');
    expect(ALL_PROFILE_DETECTIONS.filter((d) => d.profileId === 'cholera')).toEqual([]);
    expect(ALL_PROFILE_DETECTIONS.filter((d) => d.profileId === 'gastrointestinal-syndrome')).toEqual([]);
    expect(ALL_PROFILE_DETECTIONS.filter((d) => d.investigable).map((d) => d.id)).toEqual(['ALERT-REGIONAL-D4']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves status against acknowledgements and the replay day', () => {
    const ack = { day: 3 as const, simulationTime: '2025-11-05T17:00:00', realTime: '2026-01-01T00:00:00Z' };
    const day3 = getProfileAlerts(3, { 'ALERT-INFLUENZA-A-REGIONAL-D3': ack });
    expect(day3.find((a) => a.id === 'ALERT-INFLUENZA-A-REGIONAL-D3')?.status).toBe('Acknowledged');
    expect(day3.find((a) => a.id === 'ALERT-INFLUENZA-A-VOLUME-D2')?.status).toBe('Active');
    expect(day3.some((a) => a.detectedDay > 3)).toBe(false);
  });
});

describe('small-count suppression per profile', () => {
  it('applies the unchanged rule to the narrated profile exactly as before', () => {
    for (const day of DAYS) {
      for (const h of HOSPITAL_IDS) {
        expect(profileAreaPositivePrivacy(RVS_PROFILE_ID, day, h)).toEqual(getAreaPositivePrivacy(day, h));
        expect(profileAreaPositivityDisplay(RVS_PROFILE_ID, day, h)).toEqual(getAreaPositivityDisplay(day, h));
      }
      expect(areaPrivacyFor(RVS_PROFILE_ID, day).summary).toBe(getDisclosureSummary(day));
    }
  });

  it('suppresses a pathogen’s own small counts', () => {
    // Influenza A, Day 1, HOSP-A: 1 positive — withheld, never shown.
    const p = profileAreaPositivePrivacy('influenza-a', 1, 'HOSP-A');
    expect(p.suppressed).toBe(true);
    expect(p.displayValue).toBe('<5');
    expect(p.rawCount).toBeNull();
    expect(profileAreaPositivityDisplay('influenza-a', 1, 'HOSP-A').value).toBe('<5');
    // Every Cholera count is zero or small: all withheld, county total too.
    expect(profileDisclosureSummary('cholera', 4)).toMatch(/All 3 surveillance areas.*Worcester County: <5/);
  });
});

describe('selected profile (?profile=)', () => {
  it('defaults to Respiratory Viral Syndrome and falls back from an unknown value', () => {
    expect(parseSelection(null)).toEqual({ selection: RVS_PROFILE_ID, invalid: null });
    expect(parseSelection('')).toEqual({ selection: RVS_PROFILE_ID, invalid: null });
    expect(parseSelection('rsv')).toEqual({ selection: 'rsv', invalid: null });
    expect(parseSelection('all')).toEqual({ selection: 'all', invalid: null });
    expect(parseSelection('plague')).toEqual({ selection: RVS_PROFILE_ID, invalid: 'plague' });
  });

  it('focuses portfolio views on the highest active signal', () => {
    expect(focusProfileFor('active', summarizeProfiles(5))).toBe('covid-19');
    expect(focusProfileFor('all', summarizeProfiles(4))).toBe('influenza-a');
    expect(focusProfileFor('active', summarizeProfiles(1))).toBe(RVS_PROFILE_ID);
    expect(focusProfileFor('cholera', summarizeProfiles(1))).toBe('cholera');
  });

  it('carries the selection between analyst pages only', () => {
    expect(withProfileParam('/map', '?profile=rsv')).toBe('/map?profile=rsv');
    expect(withProfileParam('/reports', '?profile=rsv')).toBe('/reports?profile=rsv');
    expect(withProfileParam('/replay', '?profile=rsv')).toBe('/replay?profile=rsv');
    expect(withProfileParam('/architecture', '?profile=rsv')).toBe('/architecture');
    expect(withProfileParam('/map', '')).toBe('/map');
    expect(withProfileParam('/map', '?profile=plague')).toBe('/map');
  });
});
