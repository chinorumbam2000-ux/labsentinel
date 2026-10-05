/**
 * Ask LabSentinel — the facts for a simulation day, read from the SAME
 * modules that power the UI. Nothing here restates a number: if the Dashboard
 * says 87, this says 87, because both call getScoreForDay().
 */
import { FIRST_DAY, LAST_DAY, getScenario } from '../data/simulation';
import { LAB_TESTS, SYNDROME } from '../data/tests';
import { getAlerts } from '../lib/alerts';
import { getTrendSeries } from '../lib/analytics';
import { getDataConfidence } from '../lib/dataConfidence';
import { getDayOverDayComparison } from '../lib/dayOverDay';
import { formatPercent } from '../lib/format';
import {
  getAreaPositivePrivacy,
  getAreaPositivityDisplay,
  getDisclosureSummary,
  MINIMUM_DISPLAY_COUNT,
} from '../lib/geographicPrivacy';
import { getAllHospitalMetrics, getObservationCounts, getScoreForDay, getZipMetrics } from '../lib/selectors';
import type { OutbreakAlert, Severity, SimulationDay } from '../types';
import type { AssistantRoute } from './types';

export interface AreaFact {
  zipCode: string;
  city: string;
  hospitalName: string;
  isAffected: boolean;
  severity: Severity;
  trend: string;
  /** What the Map shows: the exact count, or "<5" when suppressed. */
  positivesDisplay: string;
  positivityDisplay: string;
  suppressed: boolean;
  /** Only set when the UI shows the number (never for suppressed areas). */
  positivityValue: number | null;
}

export const factsForDay = (day: SimulationDay, alertsOverride?: OutbreakAlert[]) => {
  const scenario = getScenario(day);
  const score = getScoreForDay(day);
  const areas: AreaFact[] = getZipMetrics(day).map((zip) => {
    const privacy = getAreaPositivePrivacy(day, zip.hospitalId);
    const positivity = getAreaPositivityDisplay(day, zip.hospitalId);
    return {
      zipCode: zip.zipCode,
      city: zip.city,
      hospitalName: zip.hospitalName,
      isAffected: zip.isAffected,
      severity: zip.severity,
      trend: zip.trend,
      positivesDisplay: privacy.displayValue,
      positivityDisplay: positivity.value,
      suppressed: privacy.suppressed,
      positivityValue: positivity.suppressed ? null : zip.positivityRate,
    };
  });
  return {
    day,
    scenario,
    score,
    confidence: getDataConfidence(day),
    dayOverDay: getDayOverDayComparison(day),
    hospitals: getAllHospitalMetrics(day),
    areas,
    disclosure: getDisclosureSummary(day),
    alerts: alertsOverride ?? getAlerts(day, {}),
    observations: getObservationCounts(day),
    /** Day 1 through this day only: the trend never reveals a later day. */
    trend: getTrendSeries(day),
    /** Positivity exactly as the Dashboard formats it. */
    positivityText: formatPercent(scenario.positivityRate),
  };
};

export type DayFacts = ReturnType<typeof factsForDay>;

export const ALL_DAYS: SimulationDay[] = Array.from(
  { length: LAST_DAY - FIRST_DAY + 1 },
  (_, i) => (FIRST_DAY + i) as SimulationDay,
);

export const isSimulationDay = (value: number): value is SimulationDay =>
  Number.isInteger(value) && value >= FIRST_DAY && value <= LAST_DAY;

export { LAB_TESTS, SYNDROME, MINIMUM_DISPLAY_COUNT };

const ROUTES: AssistantRoute[] = [
  'dashboard',
  'map',
  'laboratory-data',
  'signals',
  'hospitals',
  'analytics',
  'simulation',
  'reports',
  'architecture',
];

/** The assistant's route from a router pathname (relative to the app base). */
export const routeFromPath = (pathname: string): AssistantRoute => {
  const first = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  return (ROUTES as string[]).includes(first) ? (first as AssistantRoute) : 'other';
};
