/**
 * API CAPSTONE MODE ONLY: client for the development FHIR ingestion endpoints.
 *
 * Used exclusively by the FHIR ingestion demonstration page, and only when
 * the app is built with VITE_DATA_SOURCE=api. Local mode (and the GitHub
 * Pages build) never constructs this client, so it never sends a request.
 */
import { ApiError, createApiClient, type FetchLike } from './apiClient';

export const FHIR_CONTENT_TYPE = 'application/fhir+json';

export interface FhirExampleSummary {
  id: string;
  title: string;
  description: string;
  kind: 'valid' | 'bundle' | 'invalid';
  expected: string;
}

export interface FhirExample extends FhirExampleSummary {
  /** Exactly as stored; may be deliberately malformed. */
  content: string;
}

export interface IngestionIssue {
  code: string;
  message: string;
  resource: string | null;
  severity: 'error' | 'warning';
}

export interface IngestionOutcome {
  resource: string;
  outcome: 'created' | 'duplicate' | 'rejected';
  observation_id: number | null;
  source_system: string | null;
  source_observation_id: string | null;
  message: string | null;
  issue_code: string | null;
  facility_code: string | null;
  facility_resolution: string | null;
  warnings: string[];
}

export interface IngestionResponse {
  resources_received: number;
  observations_received: number;
  observations_validated: number;
  observations_created: number;
  duplicates: number;
  rejected: number;
  errors: IngestionIssue[];
  warnings: IngestionIssue[];
  results: IngestionOutcome[];
}

export interface IngestionReply {
  /** HTTP status: 200, or 400/413/415 for a request-level rejection. */
  status: number;
  response: IngestionResponse;
}

/** A normalized observation as GET /api/observations returns it. */
export interface NormalizedObservation {
  id: number;
  source_observation_id: string;
  source_system: string;
  facility_id: number;
  patient_reference: string;
  syndrome: string | null;
  test_name: string;
  loinc_code: string;
  terminology_status: string;
  code_display: string | null;
  result_type: string;
  result_value: string | null;
  result_unit: string | null;
  result_numeric: number | null;
  result_unit_system: string | null;
  result_unit_code: string | null;
  result_code_system: string | null;
  result_code: string | null;
  effective_datetime: string;
  received_datetime: string | null;
  geographic_unit: string;
  status: string;
  source_report_id: string | null;
  specimen_type: string | null;
}

export type IngestionAvailability = 'available' | 'disabled';

export interface ApiFacilityLabel {
  id: number;
  facility_code: string;
  name: string;
  vendor: string;
}

const invalid = (what: string): never => {
  throw new ApiError('invalid-response', `Unexpected response from ${what}.`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasStrings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => typeof value[key] === 'string');

const parseIngestion = (value: unknown): IngestionResponse => {
  const counts = [
    'resources_received',
    'observations_received',
    'observations_validated',
    'observations_created',
    'duplicates',
    'rejected',
  ];
  if (
    !isObject(value) ||
    !counts.every((key) => typeof value[key] === 'number') ||
    !Array.isArray(value.errors) ||
    !Array.isArray(value.warnings) ||
    !Array.isArray(value.results)
  ) {
    return invalid('/api/fhir/ingest');
  }
  for (const result of value.results) {
    if (!isObject(result) || !hasStrings(result, ['resource', 'outcome']) || !Array.isArray(result.warnings)) {
      invalid('/api/fhir/ingest');
    }
  }
  return value as unknown as IngestionResponse;
};

const parseNormalized = (value: unknown, where: string): NormalizedObservation => {
  if (
    !isObject(value) ||
    typeof value.id !== 'number' ||
    !hasStrings(value, ['source_observation_id', 'source_system', 'test_name', 'loinc_code', 'effective_datetime'])
  ) {
    return invalid(where);
  }
  return value as unknown as NormalizedObservation;
};

export const createFhirIngestionClient = (baseUrl: string, fetchImpl?: FetchLike) => {
  const client = createApiClient(baseUrl, fetchImpl);

  return {
    /** 'disabled' when the backend is up but not in development mode (404). */
    async availability(signal?: AbortSignal): Promise<IngestionAvailability> {
      try {
        await client.getJson('/api/fhir/examples', undefined, signal);
        return 'available';
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return 'disabled';
        throw error;
      }
    },

    async listExamples(signal?: AbortSignal): Promise<FhirExampleSummary[]> {
      const value = await client.getJson('/api/fhir/examples', undefined, signal);
      if (!Array.isArray(value) || !value.every((item) => isObject(item) && hasStrings(item, ['id', 'title', 'kind']))) {
        return invalid('/api/fhir/examples');
      }
      return value as FhirExampleSummary[];
    },

    async getExample(id: string, signal?: AbortSignal): Promise<FhirExample> {
      const value = await client.getJson(`/api/fhir/examples/${encodeURIComponent(id)}`, undefined, signal);
      if (!isObject(value) || !hasStrings(value, ['id', 'content'])) return invalid('/api/fhir/examples/{id}');
      return value as unknown as FhirExample;
    },

    async ingest(body: string, signal?: AbortSignal): Promise<IngestionReply> {
      const reply = await client.postText('/api/fhir/ingest', body, FHIR_CONTENT_TYPE, signal);
      return { status: reply.status, response: parseIngestion(reply.body) };
    },

    async getObservation(id: number, signal?: AbortSignal): Promise<NormalizedObservation> {
      return parseNormalized(
        await client.getJson(`/api/observations/${id}`, undefined, signal),
        '/api/observations/{id}',
      );
    },

    /** Facility names and vendors by API id, for labelling results. */
    async facilities(signal?: AbortSignal): Promise<ApiFacilityLabel[]> {
      const value = await client.getJson('/api/facilities', undefined, signal);
      if (
        !Array.isArray(value) ||
        !value.every((item) => isObject(item) && typeof item.id === 'number' && hasStrings(item, ['facility_code', 'name', 'vendor']))
      ) {
        return invalid('/api/facilities');
      }
      return value as ApiFacilityLabel[];
    },

    /** The most recently received FHIR-ingested observations (never the seed). */
    async recentIngestions(limit = 8, signal?: AbortSignal): Promise<NormalizedObservation[]> {
      const value = await client.getJson(
        '/api/observations',
        { origin: 'fhir', sort: 'received_datetime', order: 'desc', limit },
        signal,
      );
      if (!isObject(value) || !Array.isArray(value.items)) return invalid('/api/observations');
      return value.items.map((item) => parseNormalized(item, '/api/observations'));
    },
  };
};

export type FhirIngestionClient = ReturnType<typeof createFhirIngestionClient>;
