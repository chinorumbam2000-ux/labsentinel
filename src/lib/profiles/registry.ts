/**
 * Surveillance profile registry.
 *
 * A profile is one surveillance target of one of two types:
 *  - Aggregate — a combined view over several tests (Respiratory Viral
 *    Activity: Influenza A, SARS-CoV-2 and RSV results together);
 *  - Pathogen — one pathogen's own tests (Influenza A, COVID-19, RSV, Cholera).
 * Both are intentional: an aggregate is not a separate disease, and a
 * pathogen profile is not duplicate monitoring.
 *
 * Profiles, their tests and the test-to-profile membership are defined ONCE,
 * in backend/app/profiles/registry.json, which the backend also reads (and its
 * migration 0008 stores). Nothing else may define a profile.
 *
 * Membership is many-to-many: an Influenza A RNA result counts towards both
 * Influenza A and Respiratory Viral Activity, once each. `profilesForTest` is
 * the routing rule, so a single observation updates every profile it belongs to.
 *
 * NAMES. registry.json — and so the backend, the database rows from migration
 * 0008 and the engine key — still calls the aggregate respiratory profile
 * "Respiratory Viral Syndrome" (with the id `respiratory-viral-syndrome`).
 * Those are compatibility identifiers and stay as they are. What people see
 * comes from PRESENTATION below, in this one place.
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

/** What a profile represents: several tests combined, or one pathogen. */
export type ProfileType = 'Aggregate' | 'Pathogen';

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
  /** The name people see. */
  displayName: string;
  shortName: string;
  /** The registry's (backend and database) name — a compatibility identifier, not shown. */
  registryName: string;
  category: ProfileCategory;
  /** Aggregate (a combined view) or Pathogen (one pathogen's tests). */
  type: ProfileType;
  /** "Aggregate respiratory surveillance", "Pathogen-specific surveillance". */
  typeDescriptor: string;
  active: boolean;
  description: string;
  /** The single-valued `syndrome` the dynamic engine calculates it under, if any. */
  legacySyndrome: string | null;
  /** The key the backend's dynamic, EWMA and CUSUM results for this profile are stored under. */
  engineKey: string | null;
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

/**
 * Registry names that are no longer shown, and what is shown instead. Applied
 * to profile names and descriptions, and to names that arrive with stored or
 * API data (an observation's or a signal's `syndrome`).
 */
const LEGACY_DISPLAY_NAMES: Record<string, string> = {
  'Respiratory Viral Syndrome': 'Respiratory Viral Activity',
};

/** The current name for a profile name that may be a legacy registry/API one. */
export const currentProfileName = (name: string | null | undefined): string => {
  let out = name ?? '';
  for (const [legacy, current] of Object.entries(LEGACY_DISPLAY_NAMES)) out = out.split(legacy).join(current);
  return out;
};

/** What people see, where it differs from registry.json. */
const PRESENTATION: Partial<Record<ProfileId, { description: string; typeDescriptor: string }>> = {
  'respiratory-viral-syndrome': {
    description:
      'Respiratory Viral Activity aggregates configured respiratory viral laboratory tests, including Influenza A, COVID-19 and RSV, to show overall respiratory viral activity across participating facilities and areas.',
    typeDescriptor: 'Aggregate respiratory surveillance',
  },
  'gastrointestinal-syndrome': {
    description:
      'Gastrointestinal Syndrome aggregates the gastrointestinal pathogen panel and Vibrio cholerae results into one syndrome-level view. Synthetic portfolio data.',
    typeDescriptor: 'Aggregate syndrome-level surveillance',
  },
};

const typeOf = (category: ProfileCategory): ProfileType => (category === 'Syndrome' ? 'Aggregate' : 'Pathogen');

export const PROFILES: SurveillanceProfile[] = raw.profiles.map((profile) => {
  const id = profile.id as ProfileId;
  const category = profile.category as ProfileCategory;
  return {
    ...profile,
    id,
    displayName: currentProfileName(profile.displayName),
    registryName: profile.displayName,
    description: PRESENTATION[id]?.description ?? currentProfileName(profile.description),
    category,
    type: typeOf(category),
    typeDescriptor: PRESENTATION[id]?.typeDescriptor ?? (typeOf(category) === 'Aggregate' ? 'Aggregate surveillance' : 'Pathogen-specific surveillance'),
    dataOrigin: profile.dataOrigin as DataOrigin,
    testCodes: TEST_PROFILE_MEMBERSHIP.filter((m) => m.profileId === profile.id).map((m) => m.testCode),
  };
});

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

/** "Aggregate" / "Pathogen" — always said in words. */
export const PROFILE_TYPE_LABEL: Record<ProfileType, string> = {
  Aggregate: 'Aggregate',
  Pathogen: 'Pathogen',
};

/**
 * The pathogen profiles whose every test is part of this aggregate — derived
 * from the membership, never listed separately. Respiratory Viral Activity:
 * Influenza A, COVID-19 and RSV. Empty for a pathogen profile.
 */
export const constituentProfiles = (id: ProfileId): SurveillanceProfile[] => {
  const aggregate = PROFILE_BY_ID[id];
  if (aggregate.type !== 'Aggregate') return [];
  return PROFILES.filter(
    (p) => p.type === 'Pathogen' && p.testCodes.length > 0 && p.testCodes.every((code) => aggregate.testCodes.includes(code)),
  );
};

/** The aggregate profiles a pathogen profile's results also count towards. */
export const aggregatesContaining = (id: ProfileId): SurveillanceProfile[] => {
  const profile = PROFILE_BY_ID[id];
  if (profile.type !== 'Pathogen') return [];
  return PROFILES.filter((p) => p.type === 'Aggregate' && profile.testCodes.every((code) => p.testCodes.includes(code)));
};

const joinNames = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * One sentence on what the profile's figures cover, for the page header:
 * "This aggregate profile combines Influenza A, COVID-19 and RSV laboratory
 * activity." or "COVID-19 results only (SARS-CoV-2 RNA)."
 */
export const profileScopeText = (id: ProfileId): string => {
  const profile = PROFILE_BY_ID[id];
  const testNames = profile.testCodes.map((code) => TEST_BY_CODE[code]?.name ?? code);
  if (profile.type === 'Aggregate') {
    const members = constituentProfiles(id);
    const covered = new Set(members.flatMap((m) => m.testCodes));
    const others = profile.testCodes.filter((code) => !covered.has(code)).map((code) => TEST_BY_CODE[code]?.name ?? code);
    return `This aggregate profile combines ${joinNames([...members.map((m) => m.displayName), ...others])} laboratory activity.`;
  }
  const within = aggregatesContaining(id).map((p) => p.displayName);
  return `${profile.displayName} results only (${joinNames(testNames)})${within.length ? `; they also count towards ${joinNames(within)}` : ''}.`;
};

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
