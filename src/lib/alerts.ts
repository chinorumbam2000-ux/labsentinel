/**
 * Alert detection.
 *
 * An alert is detected on exactly one simulation day, and the values it
 * carries are a FROZEN SNAPSHOT of what was true on that day. They are
 * computed from the detection day's data, never from the current day, so an
 * alert timestamped Nov 4 keeps reporting Nov 4's numbers no matter how far
 * the simulation advances.
 *
 * Detection, "new today" and acknowledgement are three separate things:
 *   - detection      is a property of the data
 *   - "new today"    is detectedDay === currentDay
 *   - acknowledgement only ever happens through an explicit user action
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  AcknowledgementRecord,
  AlertDetectionSnapshot,
  AlertKind,
  OutbreakAlert,
  SignalScoreResult,
  SimulationDay,
  SimulationScenario,
} from '../types';
import { SCENARIOS, simulationTimestamp } from '../data/simulation';
import { getScoreForDay } from './selectors';

/** Deterministic detection times so alert history is stable across reloads. */
const DETECTION_CLOCK: Record<AlertKind, string> = {
  volume: '09:05',
  positivity: '11:40',
  cluster: '14:15',
  regional: '15:58',
};

export const VOLUME_TRIGGER_PERCENT = 15;
export const POSITIVITY_TRIGGER_POINTS = 3;
export const CLUSTER_TRIGGER_FACILITIES = 3;
export const REGIONAL_TRIGGER_SCORE = 65;

/** One scored day: what the alert rules are judged on. */
export interface ScoredDay {
  scenario: SimulationScenario;
  score: SignalScoreResult;
}

/** Does this alert kind fire on this day, judged on that day's data only? */
const firesOnDay = (kind: AlertKind, { scenario, score }: ScoredDay): boolean => {
  switch (kind) {
    case 'volume':
      return score.volumeIncreasePercent >= VOLUME_TRIGGER_PERCENT;
    case 'positivity':
      return score.positivityDeltaPoints >= POSITIVITY_TRIGGER_POINTS;
    case 'cluster':
      return scenario.affectedHospitals.length >= CLUSTER_TRIGGER_FACILITIES;
    case 'regional':
      return score.composite >= REGIONAL_TRIGGER_SCORE;
    default:
      return false;
  }
};

/** Everything the alert reports, measured on its own detection day. */
const snapshotFor = (kind: AlertKind, { scenario, score }: ScoredDay): AlertDetectionSnapshot => {

  const detail = (() => {
    switch (kind) {
      case 'volume':
        return `${score.volumeIncreasePercent >= 0 ? '+' : ''}${score.volumeIncreasePercent.toFixed(
          0,
        )}% vs baseline`;
      case 'positivity':
        return `${score.positivityDeltaPoints >= 0 ? '+' : ''}${score.positivityDeltaPoints.toFixed(
          1,
        )} percentage points vs baseline`;
      case 'cluster':
        return `${scenario.affectedHospitals.length} hospitals affected`;
      case 'regional':
      default:
        return `Composite Score: ${score.composite}`;
    }
  })();

  const severity = (() => {
    switch (kind) {
      case 'volume':
        return 'Watch' as const;
      case 'positivity':
        return 'Moderate' as const;
      case 'cluster':
        return 'High' as const;
      case 'regional':
      default:
        return score.severity;
    }
  })();

  return {
    detail,
    severity,
    geography:
      scenario.affectedZipCodes.length === 0
        ? 'Worcester County, MA'
        : scenario.affectedZipCodes.join(', '),
    facilities: `${scenario.affectedHospitals.length} of 3 facilities`,
    totalTests: scenario.totalTests,
    positivityRate: scenario.positivityRate,
    compositeScore: score.composite,
    affectedHospitals: scenario.affectedHospitals.length,
    affectedZipCodes: scenario.affectedZipCodes.length,
  };
};

const TITLES: Record<AlertKind, string> = {
  volume: 'Increased test volume',
  positivity: 'Rising positivity rate',
  cluster: 'Multi-hospital cluster detected',
  regional: 'Regional outbreak signal detected',
};

/** Display order: most severe first. */
const KIND_ORDER: AlertKind[] = ['regional', 'cluster', 'positivity', 'volume'];

export interface AlertDetection {
  id: string;
  kind: AlertKind;
  title: string;
  detectedDay: SimulationDay;
  detectedAt: string;
  detection: AlertDetectionSnapshot;
  investigable: boolean;
}

/**
 * The detections in a run of scored days: each kind at most once, on the
 * earliest day it fires, with the values frozen at that day. The same rules
 * serve every surveillance profile; only the days (and the ids) differ.
 */
export const detectionsFor = (
  days: ScoredDay[],
  idFor: (kind: AlertKind, day: SimulationDay) => string,
  investigable: (kind: AlertKind) => boolean,
): AlertDetection[] =>
  KIND_ORDER.flatMap((kind) => {
    const first = days.find((d) => firesOnDay(kind, d));
    if (!first) return [];
    const day = first.scenario.day;
    return [
      {
        id: idFor(kind, day),
        kind,
        title: TITLES[kind],
        detectedDay: day,
        detectedAt: simulationTimestamp(day, DETECTION_CLOCK[kind]),
        detection: snapshotFor(kind, first),
        investigable: investigable(kind),
      },
    ];
  });

/**
 * Every detection in the simulation, computed once. Frozen at module level so
 * the snapshot values are literally impossible to recompute against a later
 * day.
 */
export const ALL_DETECTIONS: AlertDetection[] = detectionsFor(
  SCENARIOS.map((scenario) => ({ scenario, score: getScoreForDay(scenario.day) })),
  (kind, day) => `ALERT-${kind.toUpperCase()}-D${day}`,
  (kind) => kind === 'regional',
);

/**
 * Alerts visible on the given day, with status resolved against the user's
 * acknowledgements. Moving backwards hides later detections without inventing
 * or discarding any acknowledgement.
 */
export const getAlerts = (
  currentDay: number,
  acknowledgements: Record<string, AcknowledgementRecord> = {},
): OutbreakAlert[] =>
  ALL_DETECTIONS.filter((detection) => detection.detectedDay <= currentDay).map(
    (detection) => {
      const acknowledgement = acknowledgements[detection.id] ?? null;
      return {
        ...detection,
        acknowledgement,
        status: acknowledgement
          ? 'Acknowledged'
          : detection.detectedDay === currentDay
            ? 'New'
            : 'Active',
      };
    },
  );

/**
 * Look up a detection by id regardless of the current day. Callers use this to
 * tell "no such alert" apart from "that alert has not been detected yet",
 * which need different messages.
 */
export const findDetection = (alertId: string): AlertDetection | undefined =>
  ALL_DETECTIONS.find((detection) => detection.id === alertId);

/** The single regional signal that opens the Signal Investigation view. */
export const getRegionalAlert = (
  currentDay: number,
  acknowledgements: Record<string, AcknowledgementRecord> = {},
): OutbreakAlert | undefined =>
  getAlerts(currentDay, acknowledgements).find((alert) => alert.investigable);

/** Alerts awaiting acknowledgement — what the notification badge counts. */
export const getUnacknowledgedCount = (
  currentDay: number,
  acknowledgements: Record<string, AcknowledgementRecord> = {},
): number =>
  getAlerts(currentDay, acknowledgements).filter(
    (alert) => alert.status !== 'Acknowledged',
  ).length;

/** Alerts detected on the current simulation day. */
export const getNewTodayCount = (currentDay: number): number =>
  ALL_DETECTIONS.filter((detection) => detection.detectedDay === currentDay).length;
