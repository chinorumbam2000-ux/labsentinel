/**
 * LOCAL DEMO MODE: the prototype's own TypeScript data.
 *
 * A thin adapter over the existing source-of-truth modules (src/data,
 * src/lib). Nothing is copied; every value is exactly what the standalone
 * prototype has always shown. This is the default mode and the one the
 * GitHub Pages build uses.
 */
import type { HospitalId, SimulationDay, SurveillanceDay } from '../types';
import { HOSPITALS } from '../data/hospitals';
import { OBSERVATIONS, getVisibleObservations } from '../data/observations';
import { buildLocalSurveillanceDays, findDay } from '../lib/surveillanceDays';
import { queryObservations } from './observationQuery';
import type { LabSentinelDataSource, SignalValues, SyncDataAccess } from './types';

export const createLocalDataSource = (): LabSentinelDataSource => {
  // Built once; the prototype's data never changes at run time.
  const days = buildLocalSurveillanceDays();

  const sync: SyncDataAccess = {
    facilities: () => HOSPITALS.map((hospital) => ({ ...hospital })),
    signals: () => days,
    demoSummary: (day: SimulationDay) => findDay(days, day),
    observations: (query) => queryObservations(getVisibleObservations(query.currentDay), query),
  };

  const signalValues = ({ scenario, ...rest }: SurveillanceDay): SignalValues => {
    const { stage: _stage, description: _description, ...values } = scenario;
    return { ...rest, scenario: values };
  };

  return {
    mode: 'local',
    label: 'Synthetic demo data (in-browser)',
    sync,
    getFacilities: async () => sync.facilities(),
    getFacility: async (id: HospitalId) => sync.facilities().find((h) => h.id === id),
    getObservations: async (query) => sync.observations(query),
    getObservation: async (id) => OBSERVATIONS.find((observation) => observation.id === id),
    getSignals: async () => sync.signals(),
    getCurrentSignal: async (day) => signalValues(sync.demoSummary(day)),
    getDemoSummary: async (day) => sync.demoSummary(day),
    checkHealth: async () => null,
  };
};
