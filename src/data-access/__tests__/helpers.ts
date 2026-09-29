import recording from './fixtures/api-recording.json';
import type { FetchLike } from '../apiClient';

export const BASE_URL = 'http://api.test';

const RECORDED = recording as Record<string, unknown>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Serves the real API responses recorded by scripts/verify-api-parity.ts
 * --record. A request that was not recorded gets a 404, so a test cannot pass
 * by accident on a URL the real API was never asked.
 */
export const replayFetch = (overrides: Record<string, () => Response | Promise<Response>> = {}) => {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    const path = input.slice(BASE_URL.length);
    calls.push(path);
    if (path in overrides) return overrides[path]();
    if (path in RECORDED) return json(RECORDED[path]);
    return json({ detail: `not recorded: ${path}` }, 404);
  };
  return { fetchImpl, calls };
};

export const recorded = <T>(path: string): T => {
  if (!(path in RECORDED)) throw new Error(`No recorded response for ${path}`);
  return structuredClone(RECORDED[path]) as T;
};

export { json };
