/**
 * Synthetic participating organizations.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 * These three hospitals are FICTIONAL. They do not exist and are not modelled
 * on any real healthcare organization. Vendor names identify the simulated
 * environment style only; no live Epic, Oracle Health or MEDITECH system is
 * connected to this prototype.
 */
import type { Hospital, HospitalId } from '../types';

export const HOSPITALS: Hospital[] = [
  {
    id: 'HOSP-A',
    name: 'Worcester Central Medical Center',
    vendor: 'Epic',
    zipCode: '01604',
    city: 'Worcester',
    county: 'Worcester County',
    state: 'MA',
    environmentLabel: 'Simulated Epic Environment',
  },
  {
    id: 'HOSP-B',
    name: 'Central Massachusetts Regional Hospital',
    vendor: 'Oracle Health',
    zipCode: '01605',
    city: 'Worcester',
    county: 'Worcester County',
    state: 'MA',
    environmentLabel: 'Simulated Oracle Health Environment',
  },
  {
    id: 'HOSP-C',
    name: 'Shrewsbury Community Medical Center',
    vendor: 'MEDITECH',
    zipCode: '01545',
    city: 'Shrewsbury',
    county: 'Worcester County',
    state: 'MA',
    environmentLabel: 'Simulated MEDITECH Environment',
  },
];

export const HOSPITAL_BY_ID: Record<HospitalId, Hospital> = HOSPITALS.reduce(
  (acc, hospital) => {
    acc[hospital.id] = hospital;
    return acc;
  },
  {} as Record<HospitalId, Hospital>,
);
