import { describe, expect, it } from 'vitest';
import { ApiError } from '../apiClient';
import { FHIR_CONTENT_TYPE, createFhirIngestionClient } from '../fhirIngestion';
import { BASE, exampleContent, fakeBackend } from '../../pages/__tests__/fakeFhirBackend';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const clientFor = (options?: Parameters<typeof fakeBackend>[0]) => {
  const backend = fakeBackend(options);
  return { backend, client: createFhirIngestionClient(BASE, (url, init) => backend.fetch(url, init)) };
};

describe('FHIR ingestion client (API capstone mode)', () => {
  it('reports availability: available, disabled outside development, unreachable', async () => {
    expect(await clientFor().client.availability()).toBe('available');
    expect(await clientFor({ disabled: true }).client.availability()).toBe('disabled');
    const error = await clientFor({ down: true }).client.availability().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
  });

  it('lists and loads examples by id', async () => {
    const { client, backend } = clientFor();
    expect((await client.listExamples()).map((e) => e.id)).toContain('respiratory-panel-bundle');
    expect((await client.getExample('influenza-a-positive')).content).toBe(exampleContent('influenza-a-positive'));
    expect(backend.calls).toContain('GET /api/fhir/examples/influenza-a-positive');
  });

  it('posts FHIR JSON and returns structured replies, including 400', async () => {
    const seen: RequestInit[] = [];
    const backend = fakeBackend();
    const client = createFhirIngestionClient(BASE, (url, init) => {
      seen.push(init ?? {});
      return backend.fetch(url, init);
    });

    const created = await client.ingest(exampleContent('influenza-a-positive'));
    expect([created.status, created.response.observations_created]).toEqual([200, 1]);
    expect((seen[0].headers as Record<string, string>)['Content-Type']).toBe(FHIR_CONTENT_TYPE);
    expect(seen[0].method).toBe('POST');

    const malformed = await client.ingest(exampleContent('malformed-json'));
    expect(malformed.status).toBe(400);
    expect(malformed.response.errors[0].code).toBe('INVALID_FHIR');
  });

  it('throws on server errors and unexpected bodies', async () => {
    const serverError = createFhirIngestionClient(BASE, async () => json({ detail: 'boom' }, 500));
    expect(((await serverError.ingest('{}').catch((e: unknown) => e)) as ApiError).kind).toBe('http');

    const odd = createFhirIngestionClient(BASE, async () => json({ created: true }));
    expect(((await odd.ingest('{}').catch((e: unknown) => e)) as ApiError).kind).toBe('invalid-response');
  });

  it('asks for recent FHIR ingestions only, newest received first', async () => {
    const { client, backend } = clientFor();
    const rows = await client.recentIngestions();
    expect(backend.calls).toContain('GET /api/observations?origin=fhir&sort=received_datetime&order=desc&limit=8');
    expect(rows.every((row) => row.source_system.startsWith('fhir:'))).toBe(true);
  });

  it('loads a normalized observation and facility labels', async () => {
    const { client } = clientFor();
    const created = await client.ingest(exampleContent('influenza-a-positive'));
    const record = await client.getObservation(created.response.results[0].observation_id!);
    expect([record.loinc_code, record.result_value, record.terminology_status]).toEqual(['92142-9', 'Positive', 'mapped']);
    expect(record.received_datetime).not.toBeNull();
    expect((await client.facilities()).map((f) => f.facility_code)).toEqual(['HOSP-A', 'HOSP-B', 'HOSP-C']);
  });
});
