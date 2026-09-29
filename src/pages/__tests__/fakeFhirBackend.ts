/**
 * A fake LabSentinel backend for the FHIR page tests, answering with REAL
 * responses recorded from the FastAPI app (fixtures/fhir-api-recording.json,
 * captured with FastAPI's TestClient on a freshly seeded database).
 */
import recording from './fixtures/fhir-api-recording.json';

export const BASE = 'http://api.test';

type Recording = {
  get: Record<string, unknown>;
  ingest: Record<string, { status: number; body: unknown }>;
};
const RECORDED = recording as Recording;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const exampleContent = (id: string): string =>
  (RECORDED.get[`/api/fhir/examples/${id}`] as { content: string }).content;

export interface FakeBackend {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  calls: string[];
  /** Simulate FastAPI being stopped (network failure) or back up. */
  setDown: (down: boolean) => void;
}

export const fakeBackend = ({ down = false, disabled = false } = {}): FakeBackend => {
  const calls: string[] = [];
  let isDown = down;
  let influenzaIngestions = 0;

  const ingestStep = (body: string): string => {
    if (body === exampleContent('influenza-a-positive')) {
      influenzaIngestions += 1;
      return influenzaIngestions === 1 ? 'influenza-first' : 'influenza-again';
    }
    if (body === exampleContent('respiratory-panel-bundle')) return 'bundle';
    if (body === exampleContent('vital-signs')) return 'vital-signs';
    if (body === exampleContent('malformed-json')) return 'malformed';
    throw new Error('The fake backend has no recorded reply for this body.');
  };

  const handler = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const path = url.slice(BASE.length);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    if (isDown) throw new TypeError('Failed to fetch');
    if (path === '/api/health') return json({ status: 'healthy', service: 'LabSentinel API', version: '0.1.0' });
    if (path === '/api/health/database') return json({ status: 'healthy', database: 'connected' });
    if (disabled && path.startsWith('/api/fhir/')) return json({ detail: 'Not Found' }, 404);
    if (method === 'POST' && path === '/api/fhir/ingest') {
      const reply = RECORDED.ingest[ingestStep(String(init?.body))];
      return json(reply.body, reply.status);
    }
    if (path in RECORDED.get) return json(RECORDED.get[path]);
    return json({ detail: `not recorded: ${path}` }, 404);
  };

  return { fetch: handler, calls, setDown: (value) => (isDown = value) };
};

export const recordedIngestion = (step: string) => RECORDED.ingest[step];
