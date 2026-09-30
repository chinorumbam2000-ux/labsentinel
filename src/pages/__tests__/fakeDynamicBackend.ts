/**
 * Fake dynamic-surveillance endpoints for the UI tests, answering with REAL
 * responses recorded from the FastAPI app (fixtures/dynamic-api-recording.json:
 * a fresh SQLite database, the demo seed, the synthetic dynamic dataset
 * ingested through the FHIR pipeline, and the engine run over every date).
 */
import recording from './fixtures/dynamic-api-recording.json';
import ewmaRecording from './fixtures/ewma-api-recording.json';
import cusumRecording from './fixtures/cusum-api-recording.json';
import type { DynamicSignal, DynamicSummary } from '../../data-access/dynamicSurveillance';

type Recording = {
  empty: Record<string, unknown>;
  get: Record<string, unknown>;
  post: Record<string, unknown>;
};
export const DYNAMIC_RECORDING = recording as Recording;
export const DYNAMIC_PREFIX = '/api/surveillance/dynamic';

export const recordedSignal = (date: string | null): DynamicSignal =>
  DYNAMIC_RECORDING.get[`${DYNAMIC_PREFIX}/signals/current${date ? `?date=${date}` : ''}`] as DynamicSignal;

export const recordedSummary = (): DynamicSummary => DYNAMIC_RECORDING.get[`${DYNAMIC_PREFIX}/summary`] as DynamicSummary;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const EWMA_RECORDING = ewmaRecording as Recording;
export const EWMA_PREFIX = '/api/statistics/ewma';

export interface DynamicOptions {
  /** No dynamic signal calculated yet. */
  empty?: boolean;
  /** The backend is not in development: POST /recalculate is 404. */
  production?: boolean;
  /** No EWMA result calculated yet. */
  ewmaEmpty?: boolean;
  /** The EWMA endpoints fail (HTTP 500). */
  ewmaDown?: boolean;
  /** No CUSUM result calculated yet. */
  cusumEmpty?: boolean;
  /** The CUSUM and comparison endpoints fail (HTTP 500). */
  cusumDown?: boolean;
}

export const CUSUM_RECORDING = cusumRecording as Recording;
export const CUSUM_PREFIX = '/api/statistics/cusum';
export const COMPARISON_PREFIX = '/api/statistics/comparison';

const cusumReply = (path: string, method: string, options: DynamicOptions): Response => {
  if (options.cusumDown) return json({ detail: 'Internal Server Error' }, 500);
  if (method === 'POST' && path === `${CUSUM_PREFIX}/recalculate`) {
    return options.production ? json({ detail: 'Not Found' }, 404) : json(CUSUM_RECORDING.post.again);
  }
  const source = options.cusumEmpty ? CUSUM_RECORDING.empty : CUSUM_RECORDING.get;
  if (method === 'GET' && path in source) {
    const body = source[path];
    if (options.production && path === CUSUM_PREFIX) return json({ ...(body as object), recalculation_available: false });
    return json(body);
  }
  return json({ detail: 'No CUSUM result has been calculated for that.' }, 404);
};

const ewmaReply = (path: string, method: string, options: DynamicOptions): Response => {
  if (options.ewmaDown) return json({ detail: 'Internal Server Error' }, 500);
  if (method === 'POST' && path === `${EWMA_PREFIX}/recalculate`) {
    return options.production ? json({ detail: 'Not Found' }, 404) : json(EWMA_RECORDING.post.again);
  }
  const source = options.ewmaEmpty ? EWMA_RECORDING.empty : EWMA_RECORDING.get;
  if (method === 'GET' && path in source) {
    const body = source[path];
    if (options.production && path === EWMA_PREFIX) return json({ ...(body as object), recalculation_available: false });
    return json(body);
  }
  return json({ detail: 'No EWMA result has been calculated for that.' }, 404);
};

/** Answers a dynamic-surveillance request, or returns null for any other path. */
export const dynamicReply = (path: string, method: string, options: DynamicOptions = {}): Response | null => {
  if (path.startsWith(EWMA_PREFIX)) return ewmaReply(path, method, options);
  if (path.startsWith(CUSUM_PREFIX) || path.startsWith(COMPARISON_PREFIX)) return cusumReply(path, method, options);
  if (!path.startsWith(DYNAMIC_PREFIX)) return null;
  if (method === 'POST' && path === `${DYNAMIC_PREFIX}/recalculate`) {
    return options.production ? json({ detail: 'Not Found' }, 404) : json(DYNAMIC_RECORDING.post.again);
  }
  const source = options.empty ? DYNAMIC_RECORDING.empty : DYNAMIC_RECORDING.get;
  if (method === 'GET' && path in source) {
    const body = source[path];
    if (options.production && path === `${DYNAMIC_PREFIX}/summary`) {
      return json({ ...(body as object), recalculation_available: false });
    }
    return json(body);
  }
  return json({ detail: 'No dynamic signal has been calculated for that.' }, 404);
};
