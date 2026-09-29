/**
 * FastAPI response shapes (backend/app/schemas) and runtime checks for them.
 *
 * A response that does not have the documented shape is rejected here with an
 * 'invalid-response' ApiError, rather than flowing into the UI and failing
 * somewhere far from the cause.
 */
import { ApiError } from './apiClient';

export interface ApiFacility {
  id: number;
  facility_code: string;
  name: string;
  vendor: string;
  city: string;
  postal_code: string | null;
  subregion: string | null;
  region: string;
  country_code: string;
  active: boolean;
}

export interface ApiObservation {
  id: number;
  source_observation_id: string;
  facility_id: number;
  patient_reference: string;
  syndrome: string;
  test_name: string;
  loinc_code: string;
  result_value: string | null;
  effective_datetime: string;
  geographic_unit: string;
  source_system: string;
  status: string;
}

export interface ApiObservationPage {
  items: ApiObservation[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiSignal {
  id: number;
  syndrome: string;
  signal_date: string;
  test_volume: number;
  baseline_volume: number;
  positive_count: number;
  positivity_rate: number;
  baseline_positivity_rate: number;
  affected_facilities: number;
  affected_geographies: string[];
  persistence_days: number;
  composite_score: number;
  severity: string;
  data_confidence_score: number | null;
  data_confidence_level: string | null;
  status: string;
}

export interface ApiDemoSummary {
  day: number;
  simulation_date: string;
  stage: string;
  description: string;
  signal_id: number;
  syndrome: string;
  test_volume: number;
  positive_count: number;
  negative_count: number;
  positivity_rate: number;
  baseline_volume: number;
  baseline_positivity_rate: number;
  affected_facilities: number;
  affected_geographies: string[];
  persistence_days: number;
  composite_score: number;
  severity: string;
  data_confidence_score: number | null;
  data_confidence_level: string | null;
}

type Kind = 'string' | 'number' | 'boolean' | 'string?' | 'number?' | 'string[]';

const invalid = (where: string, detail: string): never => {
  throw new ApiError('invalid-response', `Unexpected API response from ${where}: ${detail}.`);
};

const matches = (value: unknown, kind: Kind): boolean => {
  switch (kind) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string?':
      return value === null || typeof value === 'string';
    case 'number?':
      return value === null || (typeof value === 'number' && Number.isFinite(value));
    case 'string[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
};

const checkObject = <T>(value: unknown, fields: Record<string, Kind>, where: string): T => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(where, 'expected an object');
  }
  const record = value as Record<string, unknown>;
  for (const [field, kind] of Object.entries(fields)) {
    if (!matches(record[field], kind)) invalid(where, `"${field}" is not ${kind}`);
  }
  return value as T;
};

const checkArray = <T>(value: unknown, check: (item: unknown) => T, where: string): T[] => {
  if (!Array.isArray(value)) return invalid(where, 'expected an array');
  return value.map(check);
};

const FACILITY: Record<string, Kind> = {
  id: 'number',
  facility_code: 'string',
  name: 'string',
  vendor: 'string',
  city: 'string',
  postal_code: 'string?',
  subregion: 'string?',
  region: 'string',
  country_code: 'string',
  active: 'boolean',
};

const OBSERVATION: Record<string, Kind> = {
  id: 'number',
  source_observation_id: 'string',
  facility_id: 'number',
  patient_reference: 'string',
  syndrome: 'string',
  test_name: 'string',
  loinc_code: 'string',
  result_value: 'string?',
  effective_datetime: 'string',
  geographic_unit: 'string',
  source_system: 'string',
  status: 'string',
};

const SIGNAL_VALUES: Record<string, Kind> = {
  syndrome: 'string',
  test_volume: 'number',
  baseline_volume: 'number',
  positive_count: 'number',
  positivity_rate: 'number',
  baseline_positivity_rate: 'number',
  affected_facilities: 'number',
  affected_geographies: 'string[]',
  persistence_days: 'number',
  composite_score: 'number',
  severity: 'string',
  data_confidence_score: 'number?',
  data_confidence_level: 'string?',
};

export const parseFacility = (value: unknown, where = '/api/facilities/{id}') =>
  checkObject<ApiFacility>(value, FACILITY, where);

export const parseFacilities = (value: unknown) =>
  checkArray(value, (item) => parseFacility(item, '/api/facilities'), '/api/facilities');

export const parseObservation = (value: unknown, where = '/api/observations/{id}') =>
  checkObject<ApiObservation>(value, OBSERVATION, where);

export const parseObservationPage = (value: unknown): ApiObservationPage => {
  const page = checkObject<ApiObservationPage>(
    value,
    { total: 'number', limit: 'number', offset: 'number' },
    '/api/observations',
  );
  checkArray(page.items, (item) => parseObservation(item, '/api/observations'), '/api/observations');
  return page;
};

export const parseSignal = (value: unknown, where = '/api/signals') =>
  checkObject<ApiSignal>(value, { ...SIGNAL_VALUES, id: 'number', signal_date: 'string', status: 'string' }, where);

export const parseSignals = (value: unknown) =>
  checkArray(value, (item) => parseSignal(item), '/api/signals');

export const parseDemoSummary = (value: unknown, where = '/api/demo/summary') =>
  checkObject<ApiDemoSummary>(
    value,
    {
      ...SIGNAL_VALUES,
      day: 'number',
      simulation_date: 'string',
      stage: 'string',
      description: 'string',
      signal_id: 'number',
      negative_count: 'number',
    },
    where,
  );

export const parseDemoDays = (value: unknown) =>
  checkArray(value, (item) => parseDemoSummary(item, '/api/demo/days'), '/api/demo/days');
