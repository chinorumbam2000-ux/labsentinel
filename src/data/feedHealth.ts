/**
 * Deterministic synthetic feed health for each participating facility.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 *
 * This describes the OPERATIONAL health of each simulated data feed: how
 * recently it delivered, how much of it mapped cleanly to LOINC, how complete
 * the records were, and how many failed or duplicate events arrived.
 *
 * It is deliberately independent of the epidemiological signal. A facility can
 * have a perfectly healthy feed while reporting an alarming positivity rate,
 * and vice versa — that separation is the point.
 *
 * Feed liveness is modelled separately from test volume. A site that runs
 * fewer tests is not a late feed; deriving "minutes since last event" from the
 * last observation timestamp would wrongly make the smallest site look broken
 * every single day.
 *
 * Nothing here is random. Every value is a pure function of (day, facility).
 */
import type { FacilityFeedHealth, FeedStatus, HospitalId, SimulationDay } from '../types';
import { HOSPITALS, HOSPITAL_BY_ID } from './hospitals';
import { HOSPITAL_IDS, SIMULATION_DAYS, getSiteCounts } from './dataset';
import { simulationDateFor } from './simulation';

/** Simulation-calendar time at which each day's feed health is assessed. */
export const FEED_EVALUATED_CLOCK = '20:15';

/** Thresholds that turn raw metrics into a status. */
export const FEED_THRESHOLDS = {
  /** Above this many minutes with no event, the feed is DELAYED. */
  delayedMinutes: 30,
  /** Above this many minutes, the feed is treated as OFFLINE. */
  offlineMinutes: 240,
  /** Below this mapping or completeness percentage, the feed is DEGRADED. */
  degradedQualityPercent: 85,
  /** Above this share of failed + duplicate events, the feed is DEGRADED. */
  degradedIssueRatePercent: 5,
} as const;

interface FeedProfile {
  /** Typical minutes between events for this vendor interface. */
  baseMinutesSinceLastEvent: number;
  terminologyMappedPercent: number;
  completenessPercent: number;
  /** Failed and duplicate events per 1000 delivered. */
  failedPer1000: number;
  duplicatesPer1000: number;
  baseLatencySeconds: number;
}

/**
 * Per-vendor interface characteristics. Epic's interface engine is modelled as
 * the most mature, MEDITECH's the least — a plausible spread, not a judgement
 * about any real product.
 */
const FEED_PROFILE: Record<HospitalId, FeedProfile> = {
  'HOSP-A': {
    baseMinutesSinceLastEvent: 3,
    terminologyMappedPercent: 98,
    completenessPercent: 99,
    failedPer1000: 8,
    duplicatesPer1000: 6,
    baseLatencySeconds: 42,
  },
  'HOSP-B': {
    baseMinutesSinceLastEvent: 6,
    terminologyMappedPercent: 96,
    completenessPercent: 97,
    failedPer1000: 12,
    duplicatesPer1000: 9,
    baseLatencySeconds: 78,
  },
  'HOSP-C': {
    baseMinutesSinceLastEvent: 11,
    terminologyMappedPercent: 94,
    completenessPercent: 96,
    failedPer1000: 15,
    duplicatesPer1000: 11,
    baseLatencySeconds: 132,
  },
};

interface FeedIncident {
  day: SimulationDay;
  hospitalId: HospitalId;
  minutesSinceLastEvent?: number;
  latencySeconds?: number;
  terminologyMappedPercent?: number;
  completenessPercent?: number;
  note: string;
}

/**
 * Scripted feed incidents. One delayed feed on Day 3 demonstrates that data
 * quality and epidemiological severity move independently, and exercises the
 * DELAYED presentation.
 */
const FEED_INCIDENTS: FeedIncident[] = [
  {
    day: 3,
    hospitalId: 'HOSP-C',
    minutesSinceLastEvent: 47,
    latencySeconds: 486,
    note: 'Interface engine queue backed up; delivery running behind schedule.',
  },
];

const HOSPITAL_INDEX: Record<HospitalId, number> = {
  'HOSP-A': 0,
  'HOSP-B': 1,
  'HOSP-C': 2,
};

/**
 * Small deterministic day-to-day variation so the numbers are not identical
 * every day. No randomness — the same (day, facility) always gives the same
 * result, on every render and every reload.
 */
const dayJitter = (day: number, index: number, span: number): number =>
  (day * 3 + index * 5) % span;

const pad = (value: number): string => String(value).padStart(2, '0');

/** Subtracts minutes from the day's evaluation time, on the simulation clock. */
const timestampMinutesBefore = (day: number, minutes: number): string => {
  const [hours, mins] = FEED_EVALUATED_CLOCK.split(':').map(Number);
  const total = hours * 60 + mins - minutes;
  // Days in this simulation always evaluate well after midnight, so a negative
  // result would mean an unreasonably stale feed; clamp rather than roll back.
  const safe = Math.max(total, 0);
  return `${simulationDateFor(day)}T${pad(Math.floor(safe / 60))}:${pad(safe % 60)}:00`;
};

/** Simulation-calendar timestamp at which the feeds were assessed. */
export const getFeedEvaluatedAt = (day: number): string =>
  `${simulationDateFor(day)}T${FEED_EVALUATED_CLOCK}:00`;

/** Derives the feed status from the raw metrics, most severe condition first. */
export const deriveFeedStatus = (metrics: {
  minutesSinceLastEvent: number;
  eventsReceived: number;
  terminologyMappedPercent: number;
  completenessPercent: number;
  failedEvents: number;
  duplicateEvents: number;
}): FeedStatus => {
  if (
    metrics.eventsReceived === 0 ||
    metrics.minutesSinceLastEvent > FEED_THRESHOLDS.offlineMinutes
  ) {
    return 'OFFLINE';
  }

  const issueRate =
    metrics.eventsReceived === 0
      ? 0
      : ((metrics.failedEvents + metrics.duplicateEvents) / metrics.eventsReceived) * 100;

  if (
    metrics.terminologyMappedPercent < FEED_THRESHOLDS.degradedQualityPercent ||
    metrics.completenessPercent < FEED_THRESHOLDS.degradedQualityPercent ||
    issueRate > FEED_THRESHOLDS.degradedIssueRatePercent
  ) {
    return 'DEGRADED';
  }

  if (metrics.minutesSinceLastEvent > FEED_THRESHOLDS.delayedMinutes) {
    return 'DELAYED';
  }

  return 'HEALTHY';
};

const STATUS_NOTE: Record<FeedStatus, string> = {
  HEALTHY: 'Delivering normally.',
  DELAYED: 'Events are arriving later than expected.',
  DEGRADED: 'Events are arriving, but quality checks are failing.',
  OFFLINE: 'No data currently available from this facility.',
};

/** Feed health for one facility on one simulation day. */
export const getFacilityFeedHealth = (
  day: number,
  hospitalId: HospitalId,
): FacilityFeedHealth => {
  const hospital = HOSPITAL_BY_ID[hospitalId];
  const profile = FEED_PROFILE[hospitalId];
  const index = HOSPITAL_INDEX[hospitalId];
  const incident = FEED_INCIDENTS.find(
    (item) => item.day === day && item.hospitalId === hospitalId,
  );

  const eventsReceived = getSiteCounts(day, hospitalId).tests;

  const minutesSinceLastEvent =
    incident?.minutesSinceLastEvent ??
    profile.baseMinutesSinceLastEvent + dayJitter(day, index, 4);

  const terminologyMappedPercent =
    incident?.terminologyMappedPercent ?? profile.terminologyMappedPercent;
  const completenessPercent =
    incident?.completenessPercent ?? profile.completenessPercent;

  const failedEvents = Math.round((eventsReceived * profile.failedPer1000) / 1000);
  const duplicateEvents = Math.round((eventsReceived * profile.duplicatesPer1000) / 1000);

  const latencySeconds =
    incident?.latencySeconds ?? profile.baseLatencySeconds + dayJitter(day, index, 20);

  const status = deriveFeedStatus({
    minutesSinceLastEvent,
    eventsReceived,
    terminologyMappedPercent,
    completenessPercent,
    failedEvents,
    duplicateEvents,
  });

  return {
    hospitalId,
    facilityName: hospital.name,
    vendor: hospital.vendor,
    status,
    lastEventAt: timestampMinutesBefore(day, minutesSinceLastEvent),
    minutesSinceLastEvent,
    // An offline feed has delivered nothing we can rely on.
    eventsReceived: status === 'OFFLINE' ? 0 : eventsReceived,
    terminologyMappedPercent,
    completenessPercent,
    failedEvents,
    duplicateEvents,
    latencySeconds,
    isReporting: status !== 'OFFLINE',
    note: incident?.note ?? STATUS_NOTE[status],
  };
};

/** Feed health for every participating facility on the given day. */
export const getAllFeedHealth = (day: number): FacilityFeedHealth[] =>
  HOSPITAL_IDS.map((id) => getFacilityFeedHealth(day, id));

export const getReportingFacilityCount = (day: number): number =>
  getAllFeedHealth(day).filter((feed) => feed.isReporting).length;

export const TOTAL_FACILITIES = HOSPITALS.length;

export { SIMULATION_DAYS };
