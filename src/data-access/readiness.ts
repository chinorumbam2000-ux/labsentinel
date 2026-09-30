/**
 * API CAPSTONE MODE ONLY: the development-only presentation readiness
 * checklist (GET /api/readiness). Read only; the backend reports no secrets.
 */
import { ApiError, createApiClient, type FetchLike } from './apiClient';

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface ReadinessCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface Readiness {
  status: 'READY' | 'NOT READY';
  environment: string;
  checks: ReadinessCheck[];
  disclaimer: string;
}

export type ReadinessResult = { status: 'ready'; readiness: Readiness } | { status: 'disabled' };

const isCheck = (value: unknown): value is ReadinessCheck => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === 'string' &&
    typeof v.label === 'string' &&
    typeof v.detail === 'string' &&
    (v.status === 'PASS' || v.status === 'WARN' || v.status === 'FAIL')
  );
};

export const createReadinessClient = (baseUrl: string, fetchImpl?: FetchLike) => {
  const client = createApiClient(baseUrl, fetchImpl);
  return {
    /** 'disabled' when the endpoint is off in this environment (404). */
    async get(signal?: AbortSignal): Promise<ReadinessResult> {
      try {
        const value = (await client.getJson('/api/readiness', undefined, signal)) as Record<string, unknown>;
        if (
          (value?.status !== 'READY' && value?.status !== 'NOT READY') ||
          !Array.isArray(value.checks) ||
          !value.checks.every(isCheck)
        ) {
          throw new ApiError('invalid-response', 'Unexpected response from /api/readiness.');
        }
        return { status: 'ready', readiness: value as unknown as Readiness };
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return { status: 'disabled' };
        throw error;
      }
    },
  };
};
