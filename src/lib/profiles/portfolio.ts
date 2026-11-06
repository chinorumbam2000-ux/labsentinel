/**
 * The surveillance portfolio on one replay day: every profile's status,
 * ranked, counted and alerted on. Pure functions of the replay day.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  AcknowledgementRecord,
  OutbreakAlert,
  Severity,
  SignalScoreResult,
  SimulationScenario,
} from '../../types';
import { ALL_DETECTIONS, detectionsFor, type AlertDetection } from '../alerts';
import {
  PROFILES,
  PROFILE_BY_ID,
  RVS_PROFILE_ID,
  type ProfileId,
  type SurveillanceProfile,
} from './registry';
import { PROFILE_DAYS, getProfileDay, statusFor, type ProfileDay, type ProfileStatus } from './derive';

export const SEVERITY_RANK: Record<Severity, number> = {
  Low: 0,
  Watch: 1,
  Moderate: 2,
  High: 3,
  Critical: 4,
};

/** Unscored statuses after every scored one, in this order. */
const UNSCORED_ORDER: ProfileStatus[] = ['INSUFFICIENT_BASELINE', 'NO_DATA', 'INACTIVE'];

export interface ProfileSummary {
  profile: SurveillanceProfile;
  current: ProfileDay;
  previous: ProfileDay | null;
  status: ProfileStatus;
  score: SignalScoreResult | null;
  /** Score change since the previous day, when both days are scored. */
  scoreChange: number | null;
}

/**
 * The day's figures for the narrated profile as the active data source
 * supplied them (in API mode, the API's). They replace the browser's own
 * derivation — which equals them in local mode — so every screen shows the
 * source's numbers.
 */
export interface SourceDay {
  scenario: SimulationScenario;
  score: SignalScoreResult;
}

const withSource = (day: ProfileDay, source: SourceDay | undefined): ProfileDay => {
  if (!source) return day;
  const status = statusFor(
    PROFILE_BY_ID[day.profileId].active,
    source.scenario.totalTests > 0,
    day.baseline.sufficient,
    source.score.severity,
  );
  return {
    ...day,
    scenario: source.scenario,
    score: status === 'ACTIVE_SIGNAL' || status === 'WITHIN_EXPECTED_RANGE' ? source.score : null,
    status,
    statusReason:
      status === day.status && source.score.composite === day.score?.composite
        ? day.statusReason
        : `${PROFILE_BY_ID[day.profileId].displayName} scores ${source.score.composite} (${source.score.severity}) against its own Day ${day.baseline.day} baseline.`,
  };
};

export const summarizeProfiles = (
  day: number,
  rvs?: { current?: SourceDay; previous?: SourceDay },
): ProfileSummary[] =>
  PROFILES.map((profile) => {
    const isRvs = profile.id === RVS_PROFILE_ID;
    const current = withSource(getProfileDay(profile.id, day), isRvs ? rvs?.current : undefined);
    const previous =
      day > 1 ? withSource(getProfileDay(profile.id, day - 1), isRvs ? rvs?.previous : undefined) : null;
    return {
      profile,
      current,
      previous,
      status: current.status,
      score: current.score,
      scoreChange: current.score && previous?.score ? current.score.composite - previous.score.composite : null,
    };
  });

/** Severity, then score, then name; unscored profiles after, by status, then name. */
export const compareSummaries = (a: ProfileSummary, b: ProfileSummary): number => {
  if (a.score && b.score) {
    return (
      SEVERITY_RANK[b.score.severity] - SEVERITY_RANK[a.score.severity] ||
      b.score.composite - a.score.composite ||
      a.profile.displayName.localeCompare(b.profile.displayName)
    );
  }
  if (a.score) return -1;
  if (b.score) return 1;
  return (
    UNSCORED_ORDER.indexOf(a.status) - UNSCORED_ORDER.indexOf(b.status) ||
    a.profile.displayName.localeCompare(b.profile.displayName)
  );
};

export const rankProfiles = (summaries: ProfileSummary[]): ProfileSummary[] =>
  [...summaries].sort(compareSummaries);

export const activeSignals = (summaries: ProfileSummary[]): ProfileSummary[] =>
  rankProfiles(summaries.filter((s) => s.status === 'ACTIVE_SIGNAL'));

export interface StatusCounts {
  activeSignal: number;
  withinExpectedRange: number;
  insufficientBaseline: number;
  noData: number;
  inactive: number;
}

/** Each status counted on its own: missing data and missing baselines are never "normal". */
export const countStatuses = (summaries: ProfileSummary[]): StatusCounts => ({
  activeSignal: summaries.filter((s) => s.status === 'ACTIVE_SIGNAL').length,
  withinExpectedRange: summaries.filter((s) => s.status === 'WITHIN_EXPECTED_RANGE').length,
  insufficientBaseline: summaries.filter((s) => s.status === 'INSUFFICIENT_BASELINE').length,
  noData: summaries.filter((s) => s.status === 'NO_DATA').length,
  inactive: summaries.filter((s) => s.status === 'INACTIVE').length,
});

/* ------------------------------------------------------------------------ *
 * Alerts across profiles.
 * ------------------------------------------------------------------------ */

export interface ProfileAlertDetection extends AlertDetection {
  profileId: ProfileId;
}

export type ProfileAlert = OutbreakAlert & { profileId: ProfileId };

const idKey = (id: ProfileId) => id.toUpperCase();

/**
 * Every profile's detections. The narrated profile keeps its original
 * detections and ids (ALERT-REGIONAL-D4 ...), so stored acknowledgements and
 * investigations still apply. Other profiles use the same rules on their own
 * scored days, with ids that name the profile. Only the narrated profile's
 * regional signal opens the full investigation view in this release.
 */
export const ALL_PROFILE_DETECTIONS: ProfileAlertDetection[] = PROFILES.flatMap((profile) => {
  if (profile.id === RVS_PROFILE_ID) {
    return ALL_DETECTIONS.map((d) => ({ ...d, profileId: profile.id }));
  }
  if (!profile.active) return [];
  const scored = PROFILE_DAYS[profile.id].flatMap((d) => (d.score ? [{ scenario: d.scenario, score: d.score }] : []));
  return detectionsFor(
    scored,
    (kind, day) => `ALERT-${idKey(profile.id)}-${kind.toUpperCase()}-D${day}`,
    () => false,
  ).map((d) => ({ ...d, profileId: profile.id }));
});

export const getProfileAlerts = (
  currentDay: number,
  acknowledgements: Record<string, AcknowledgementRecord> = {},
): ProfileAlert[] =>
  ALL_PROFILE_DETECTIONS.filter((d) => d.detectedDay <= currentDay).map((detection) => {
    const acknowledgement = acknowledgements[detection.id] ?? null;
    return {
      ...detection,
      acknowledgement,
      status: acknowledgement ? 'Acknowledged' : detection.detectedDay === currentDay ? 'New' : 'Active',
    };
  });

export const findProfileDetection = (alertId: string): ProfileAlertDetection | undefined =>
  ALL_PROFILE_DETECTIONS.find((d) => d.id === alertId);
