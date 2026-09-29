/**
 * The one interface the React application reads data through.
 *
 * Pages and the simulation context never know whether a value came from the
 * prototype's TypeScript modules or from FastAPI and PostgreSQL. Both sources
 * return the same frontend domain objects (src/types); any naming differences
 * are mapped inside the source.
 */
import type {
  Hospital,
  HospitalId,
  LabObservation,
  ObservationPage,
  ObservationQuery,
  SimulationDay,
  SurveillanceDay,
} from '../types';
import type { DataSourceMode } from './config';

/** The persisted signal values for a day, without the demo narrative. */
export type SignalValues = Omit<SurveillanceDay, 'scenario'> & {
  scenario: Omit<SurveillanceDay['scenario'], 'stage' | 'description'>;
};

export interface BackendHealth {
  api: 'connected' | 'unavailable';
  database: 'connected' | 'unavailable' | 'unknown';
  checkedAt: Date;
}

/**
 * Synchronous access, offered only by a source whose data is already in
 * memory (the local prototype data). Lets local mode render its first paint
 * immediately, exactly as the prototype always has.
 */
export interface SyncDataAccess {
  facilities(): Hospital[];
  signals(): SurveillanceDay[];
  demoSummary(day: SimulationDay): SurveillanceDay;
  observations(query: ObservationQuery): ObservationPage;
}

export interface LabSentinelDataSource {
  readonly mode: DataSourceMode;
  /** Short human description, e.g. the API base URL. */
  readonly label: string;
  readonly sync?: SyncDataAccess;

  getFacilities(signal?: AbortSignal): Promise<Hospital[]>;
  getFacility(id: HospitalId, signal?: AbortSignal): Promise<Hospital | undefined>;
  getObservations(query: ObservationQuery, signal?: AbortSignal): Promise<ObservationPage>;
  /** By source observation id, e.g. "OBS-0001". */
  getObservation(id: string, signal?: AbortSignal): Promise<LabObservation | undefined>;
  /** Every day's signal with its narrative, Day 1 first. */
  getSignals(signal?: AbortSignal): Promise<SurveillanceDay[]>;
  getCurrentSignal(day: SimulationDay, signal?: AbortSignal): Promise<SignalValues>;
  /** CAPSTONE DEMONSTRATION: one simulated day as the dashboard shows it. */
  getDemoSummary(day: SimulationDay, signal?: AbortSignal): Promise<SurveillanceDay>;
  /** Local mode has no backend and reports no health. */
  checkHealth(signal?: AbortSignal): Promise<BackendHealth | null>;
}
