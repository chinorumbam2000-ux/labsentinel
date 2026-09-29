/**
 * Minimal JSON client for the LabSentinel FastAPI backend, on native fetch.
 */

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid-response';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export type QueryParams = Record<string, string | number | undefined>;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClient {
  readonly baseUrl: string;
  getJson(path: string, params?: QueryParams, signal?: AbortSignal): Promise<unknown>;
  /**
   * POST a text body. A 4xx response whose body is JSON is returned, not
   * thrown: endpoints such as FHIR ingestion describe a rejected request in
   * a structured body. Network failures, timeouts, 5xx and non-JSON bodies
   * still throw ApiError.
   */
  postText(
    path: string,
    body: string,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: unknown }>;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export const buildUrl = (baseUrl: string, path: string, params: QueryParams = {}): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return `${baseUrl}${path}${query ? `?${query}` : ''}`;
};

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

export const createApiClient = (
  baseUrl: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = DEFAULT_TIMEOUT_MS,
): ApiClient => ({
  baseUrl,

  async getJson(path, params, signal) {
    const response = await send(baseUrl, fetchImpl, timeoutMs, path, buildUrl(baseUrl, path, params), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }, signal);
    if (!response.ok) {
      throw new ApiError('http', `${path} returned HTTP ${response.status}.`, response.status);
    }
    return readJson(response, path);
  },

  async postText(path, body, contentType, signal) {
    const response = await send(baseUrl, fetchImpl, timeoutMs, path, buildUrl(baseUrl, path), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': contentType },
      body,
    }, signal);
    if (response.status >= 500) {
      throw new ApiError('http', `${path} returned HTTP ${response.status}.`, response.status);
    }
    const json = await readJson(response, path);
    if (!response.ok && (json === null || typeof json !== 'object')) {
      throw new ApiError('http', `${path} returned HTTP ${response.status}.`, response.status);
    }
    return { status: response.status, body: json };
  },
});

const readJson = async (response: Response, path: string): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new ApiError('invalid-response', `${path} did not return valid JSON.`);
  }
};

/** One request, with a timeout and the caller's cancellation. */
const send = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  path: string,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> => {
  // Our own controller, so a timeout can abort without touching the caller's.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ApiError('timeout', `Request timed out: ${path}`);
    // The caller cancelled; let that surface as an ordinary AbortError.
    if (signal?.aborted || isAbort(error)) throw error;
    throw new ApiError('network', `Could not reach the LabSentinel API at ${baseUrl}.`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
};

export const isAbortError = isAbort;
