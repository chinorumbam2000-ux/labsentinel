/**
 * Surveillance profile registry.
 *
 * A profile is one surveillance target: a syndrome (Respiratory Viral
 * Syndrome) or a single pathogen (Influenza A). Profiles, their tests and the
 * test-to-profile membership are defined ONCE, in
 * backend/app/profiles/registry.json, which the backend also reads (and its
 * migration 0008 stores). Nothing else may define a profile.
 *
 * Membership is many-to-many: an Influenza A RNA result counts towards both
 * Influenza A and Respiratory Viral Syndrome. `profilesForTest` is the routing
 * rule, so a single observation updates every profile it belongs to.
 *
 * DEMO ENVIRONMENT — Synthetic data only. Every setting is an illustrative
 * default inherited from the current configuration; none is validated.
 */
import raw from '../../../backend/app/profiles/registry.json';

export type ProfileId =
  | 'respiratory-viral-syndrome'
  | 'influenza-a'
  | 'covid-19'
  | 'rsv'
  | 'cholera'
  | 'gastrointestinal-syndrome';

export type ProfileCategory = 'Syndrome' | 'Pathogen';

/**
 * Where a profile's replay-period figures come from:
 *  - replay-scenario:   the narrated five-day Scenario Replay itself
 *  - replay-derived:    the same replay results, filtered to the profile's tests
 *  - portfolio-fixture: deterministic synthetic results for tests the replay
 *                       does not include
 */
export type DataOrigin = 'replay-scenario' | 'replay-derived' | 'portfolio-fixture';

export interface ProfileTest {
  code: string;
  system: string;
  name: string;
  shortName: string;
  specimen: string;
}

export interface ProfileSettings {
  label: string;
  note: string;
  baselineConfigRef: string;
  signalConfigRef: string;
  replay: {
    baselineDay: number;
    minimumBaselineTests: number;
    affectedMarginPoints: number;
    positivityScalePoints: number;
    persistenceCapDays: number;
    facilityCap: number;
    areaCap: number;
  };
  engine: {
    baselineWindowDays: number;
    minimumBaselineDays: number;
    facilityMinimumTests: number;
    volumeIncreasePercent: number;
    positivityIncreasePoints: number;
    timezone: string;
  };
  ewma: {
    lambda: number;
    k: number;
    warningFraction: number;
    referenceDays: number;
    minimumReferenceDays: number;
  };
  cusum: { k: number; h: number; approachingFraction: number };
}

export interface SurveillanceProfile {
  id: ProfileId;
  displayName: string;
  shortName: string;
  category: ProfileCategory;
  active: boolean;
  description: string;
  /** The single-valued `syndrome` the dynamic engine calculates it under, if any. */
  legacySyndrome: string | null;
  baselineConfigRef: string;
  signalConfigRef: string;
  /** Has the narrated five-day Scenario Replay. */
  replayAvailable: boolean;
  /** The backend's dynamic engine calculates it from ingested results. */
  liveAvailable: boolean;
  dataOrigin: DataOrigin;
  /** Derived from the membership list — never listed separately. */
  testCodes: string[];
}

interface RawConfig {
  label: string;
  note: string;
  replay: ProfileSettings['replay'];
  engine: ProfileSettings['engine'];
  ewma: ProfileSettings['ewma'];
  cusum: ProfileSettings['cusum'];
}

const configs = raw.configs as Record<string, RawConfig>;

export const PROFILE_TESTS: ProfileTest[] = raw.tests;

export const TEST_PROFILE_MEMBERSHIP: Array<{ testCode: string; profileId: ProfileId }> =
  raw.memberships as Array<{ testCode: string; profileId: ProfileId }>;

export const PROFILES: SurveillanceProfile[] = raw.profiles.map((profile) => ({
  ...profile,
  id: profile.id as ProfileId,
  category: profile.category as ProfileCategory,
  dataOrigin: profile.dataOrigin as DataOrigin,
  testCodes: TEST_PROFILE_MEMBERSHIP.filter((m) => m.profileId === profile.id).map((m) => m.testCode),
}));

export const PROFILE_IDS: ProfileId[] = PROFILES.map((profile) => profile.id);

export const DEFAULT_PROFILE_ID = raw.defaultProfileId as ProfileId;

/** The narrated scenario's profile. Its five-day replay is preserved exactly. */
export const RVS_PROFILE_ID: ProfileId = 'respiratory-viral-syndrome';

export const isProfileId = (value: unknown): value is ProfileId =>
  typeof value === 'string' && (PROFILE_IDS as string[]).includes(value);

export const PROFILE_BY_ID = Object.fromEntries(PROFILES.map((p) => [p.id, p])) as Record<
  ProfileId,
  SurveillanceProfile
>;

export const getProfile = (id: ProfileId): SurveillanceProfile => PROFILE_BY_ID[id];

export const TEST_BY_CODE: Record<string, ProfileTest> = Object.fromEntries(
  PROFILE_TESTS.map((test) => [test.code, test]),
);

/** Every profile one result for this test code updates, in registry order. Empty when unmapped. */
export const profilesForTest = (code: string): ProfileId[] => {
  const memberOf = new Set(TEST_PROFILE_MEMBERSHIP.filter((m) => m.testCode === code).map((m) => m.profileId));
  return PROFILE_IDS.filter((id) => memberOf.has(id));
};

/** A profile's resolved settings: its baseline and signal configuration. */
export const settingsFor = (id: ProfileId): ProfileSettings => {
  const profile = PROFILE_BY_ID[id];
  const baseline = configs[profile.baselineConfigRef];
  const signal = configs[profile.signalConfigRef];
  return {
    label: signal.label,
    note: signal.note,
    baselineConfigRef: profile.baselineConfigRef,
    signalConfigRef: profile.signalConfigRef,
    replay: baseline.replay,
    engine: baseline.engine,
    ewma: signal.ewma,
    cusum: signal.cusum,
  };
};

export const DATA_ORIGIN_LABEL: Record<DataOrigin, string> = {
  'replay-scenario': 'Scenario Replay data',
  'replay-derived': 'Derived from the replay results',
  'portfolio-fixture': 'Synthetic portfolio data',
};

/** Profiles whose test codes are not LOINC are demonstration codes, not real terminology. */
export const isDemoTestCode = (code: string): boolean =>
  TEST_BY_CODE[code]?.system !== 'http://loinc.org';
