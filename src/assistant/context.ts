/**
 * Roella — the facts for a simulation day, read through the SAME pipeline
 * that powers the UI. Nothing here restates a number: if the Dashboard says
 * 87, this says 87.
 *
 * The per-day values (scenario, composite score, severity, Data Confidence,
 * trend, day-over-day change) come from the active data source's surveillance
 * days, exactly as SimulationContext derives them: the browser's own days in
 * local mode, the API's persisted days in API mode. Facility, area, alert and
 * observation views are built from the prototype's site counts in both modes,
 * again exactly as SimulationContext builds them.
 */
import { FIRST_DAY, LAST_DAY } from '../data/simulation';
import { LAB_TESTS, SYNDROME } from '../data/tests';
import { getAlerts } from '../lib/alerts';
import { buildTrendSeries } from '../lib/analytics';
import { compareDays } from '../lib/dayOverDay';
import { formatPercent } from '../lib/format';
import {
  getAreaPositivePrivacy,
  getAreaPositivityDisplay,
  getDisclosureSummary,
  MINIMUM_DISPLAY_COUNT,
} from '../lib/geographicPrivacy';
import { getAllHospitalMetrics, getObservationCounts, getZipMetrics } from '../lib/selectors';
import { buildLocalSurveillanceDays, dataConfidenceFor, findDay, signalScoreFor } from '../lib/surveillanceDays';
import type { OutbreakAlert, Severity, SimulationDay, SurveillanceDay } from '../types';
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

export interface FactsOptions {
  /** The live alert list (with acknowledgement status), for the current day only. */
  alerts?: OutbreakAlert[];
  /** The active data source's surveillance days. Defaults to the browser's own. */
  days?: SurveillanceDay[];
}

let localDays: SurveillanceDay[] | null = null;
const defaultDays = (): SurveillanceDay[] => (localDays ??= buildLocalSurveillanceDays());

export const factsForDay = (day: SimulationDay, options: FactsOptions = {}) => {
  const days = options.days ?? defaultDays();
  const source = findDay(days, day);
  const previous = day > FIRST_DAY ? findDay(days, day - 1) : null;
  const scenario = source.scenario;
  const score = signalScoreFor(source);
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
    confidence: dataConfidenceFor(source),
    dayOverDay: compareDays(
      day,
      previous && { scenario: previous.scenario, composite: previous.compositeScore },
      { scenario, composite: source.compositeScore },
    ),
    hospitals: getAllHospitalMetrics(day),
    areas,
    disclosure: getDisclosureSummary(day),
    alerts: options.alerts ?? getAlerts(day, {}),
    observations: getObservationCounts(day),
    /** Day 1 through this day only: the trend never reveals a later day. */
    trend: buildTrendSeries(days, day),
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
  'investigations',
  'analytics',
  'simulation',
  'reports',
  'architecture',
  'overview',
  'fhir-ingestion',
  'dynamic-surveillance',
  'evaluation',
  'smart-demo',
];

/** Addresses that are another name for a known page. */
const ALIASES: Record<string, AssistantRoute> = { facilities: 'hospitals' };

/** The assistant's route from a router pathname (relative to the app base). */
export const routeFromPath = (pathname: string): AssistantRoute => {
  const first = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  if (first in ALIASES) return ALIASES[first];
  return (ROUTES as string[]).includes(first) ? (first as AssistantRoute) : 'other';
};
