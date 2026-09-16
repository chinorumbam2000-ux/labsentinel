/**
 * Alerts are generated from simulation state — they are never stored as a
 * fixed list. Changing the simulation day regenerates the whole alert set.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type { OutbreakAlert, SimulationDay } from '../types';
import { SCENARIOS, getScenario } from '../data/simulation';
import { dayToDateString } from '../data/observations';
import { getScoreForDay } from './selectors';

/** Deterministic trigger times so alert history is stable across reloads. */
const TRIGGER_TIMES: Record<OutbreakAlert['kind'], string> = {
  volume: '09:05',
  positivity: '11:40',
  cluster: '14:15',
  regional: '15:58',
};

const VOLUME_TRIGGER_PERCENT = 15;
const POSITIVITY_TRIGGER_POINTS = 3;
const CLUSTER_TRIGGER_FACILITIES = 3;
const REGIONAL_TRIGGER_SCORE = 65;

const formatTriggerTime = (day: number, kind: OutbreakAlert['kind']): string =>
  `${dayToDateString(day)}T${TRIGGER_TIMES[kind]}:00`;

/** The earliest day on which each alert kind fires, or null if it never does. */
const firstDayMatching = (
  predicate: (day: SimulationDay) => boolean,
  upToDay: number,
): SimulationDay | null => {
  const match = SCENARIOS.filter((scenario) => scenario.day <= upToDay).find((scenario) =>
    predicate(scenario.day),
  );
  return match ? match.day : null;
};

export const getAlerts = (currentDay: number): OutbreakAlert[] => {
  const alerts: OutbreakAlert[] = [];

  const push = (
    kind: OutbreakAlert['kind'],
    triggeredDay: SimulationDay,
    alert: Omit<OutbreakAlert, 'id' | 'kind' | 'triggeredDay' | 'time' | 'status'>,
  ) => {
    alerts.push({
      ...alert,
      id: `ALERT-${kind.toUpperCase()}-D${triggeredDay}`,
      kind,
      triggeredDay,
      time: formatTriggerTime(triggeredDay, kind),
      status: triggeredDay === currentDay ? 'NEW' : 'Acknowledged',
    });
  };

  // Regional early-warning signal — the investigable alert.
  const regionalDay = firstDayMatching(
    (day) => getScoreForDay(day).composite >= REGIONAL_TRIGGER_SCORE,
    currentDay,
  );
  if (regionalDay) {
    const score = getScoreForDay(currentDay);
    const scenario = getScenario(currentDay);
    push('regional', regionalDay, {
      title: 'Regional outbreak signal detected',
      detail: `Composite Score: ${score.composite}`,
      severity: score.severity,
      geography: `${scenario.affectedZipCodes.length} surveillance areas`,
      facilities: `${scenario.affectedHospitals.length} of 3 facilities`,
      investigable: true,
    });
  }

  // Multi-hospital cluster.
  const clusterDay = firstDayMatching(
    (day) => getScenario(day).affectedHospitals.length >= CLUSTER_TRIGGER_FACILITIES,
    currentDay,
  );
  if (clusterDay) {
    const scenario = getScenario(currentDay);
    push('cluster', clusterDay, {
      title: 'Multi-hospital cluster detected',
      detail: `${scenario.affectedHospitals.length} hospitals affected`,
      severity: 'High',
      geography: scenario.affectedZipCodes.join(', ') || 'None',
      facilities: `${scenario.affectedHospitals.length} of 3 facilities`,
      investigable: false,
    });
  }

  // Rising positivity.
  const positivityDay = firstDayMatching(
    (day) => getScoreForDay(day).positivityDeltaPoints >= POSITIVITY_TRIGGER_POINTS,
    currentDay,
  );
  if (positivityDay) {
    const score = getScoreForDay(currentDay);
    push('positivity', positivityDay, {
      title: 'Rising positivity rate',
      detail: `${score.positivityDeltaPoints >= 0 ? '+' : ''}${score.positivityDeltaPoints.toFixed(
        1,
      )} percentage points vs baseline`,
      severity: 'Moderate',
      geography: 'Worcester County, MA',
      facilities: `${getScenario(currentDay).affectedHospitals.length} of 3 facilities`,
      investigable: false,
    });
  }

  // Increased test volume.
  const volumeDay = firstDayMatching(
    (day) => getScoreForDay(day).volumeIncreasePercent >= VOLUME_TRIGGER_PERCENT,
    currentDay,
  );
  if (volumeDay) {
    const score = getScoreForDay(currentDay);
    push('volume', volumeDay, {
      title: 'Increased test volume',
      detail: `${score.volumeIncreasePercent >= 0 ? '+' : ''}${score.volumeIncreasePercent.toFixed(
        0,
      )}% vs baseline`,
      severity: 'Watch',
      geography: 'Worcester County, MA',
      facilities: `${getScenario(currentDay).affectedHospitals.length} of 3 facilities`,
      investigable: false,
    });
  }

  return alerts;
};

/** The single regional signal that opens the Signal Investigation view. */
export const getRegionalAlert = (currentDay: number): OutbreakAlert | undefined =>
  getAlerts(currentDay).find((alert) => alert.investigable);

export const getNewAlertCount = (currentDay: number): number =>
  getAlerts(currentDay).filter((alert) => alert.status === 'NEW').length;
