import { describe, expect, it } from 'vitest';
import {
  NO_FACILITY_MAPPING,
  authorizationError,
  bridgeOutcome,
  bridgePayload,
  fhirUserLabel,
  isExpired,
  laboratoryObservations,
  laboratorySearch,
  serverLabel,
  technicalDetails,
} from '../context';
import type { SmartSession } from '../client';
import type { IngestionReply } from '../../data-access/fhirIngestion';

const session: SmartSession = {
  serverUrl: 'https://launch.smarthealthit.org/v/r4/fhir',
  launchType: 'ehr',
  patientId: 'patient-123',
  fhirUser: 'https://launch.smarthealthit.org/v/r4/fhir/Practitioner/prac-9',
  grantedScopes: 'launch openid fhirUser patient/Observation.rs',
  expiresAt: 2_000_000_000,
  request: async <T,>() => ({}) as T,
};

const lab = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  resourceType: 'Observation',
  id,
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
  code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }], text: 'Hemoglobin' },
  effectiveDateTime: '2020-01-01T10:00:00-05:00',
  valueQuantity: { value: 13.2, unit: 'g/dL' },
  ...extra,
});

describe('SMART technical details', () => {
  it('shows only safe, whitelisted fields', () => {
    const details = technicalDetails(session, { pkceMethods: ['S256'] });
    expect(details.map((d) => d.label)).toEqual([
      'SMART profile', 'FHIR base URL', 'FHIR version', 'Launch type', 'Granted scopes',
      'Patient context available', 'FHIR user context available', 'PKCE', 'Authorization status',
      'Access token expires',
    ]);
    const text = JSON.stringify(details);
    for (const secret of ['access_token', 'refresh_token', 'code_verifier', 'client_secret', 'Bearer']) {
      expect(text).not.toContain(secret);
    }
    expect(details.find((d) => d.label === 'PKCE')?.value).toContain('S256');
    expect(details.find((d) => d.label === 'Launch type')?.value).toBe('EHR Launch');
  });

  it('never has a path to a token, even if one were attached to the session object', () => {
    const leaky = { ...session, accessToken: 'SECRET-TOKEN', tokenResponse: { access_token: 'SECRET-TOKEN' } } as SmartSession;
    expect(JSON.stringify(technicalDetails(leaky, null))).not.toContain('SECRET-TOKEN');
  });
});

describe('SMART context display', () => {
  it('labels the server and the user without demographics', () => {
    expect(serverLabel(session.serverUrl)).toBe('launch.smarthealthit.org');
    expect(serverLabel('nonsense')).toBe('Unknown server');
    expect(fhirUserLabel(session.fhirUser)).toBe('Practitioner/prac-9');
    expect(fhirUserLabel(null)).toBeNull();
  });

  it('detects an expired access token', () => {
    expect(isExpired(1000, 2000)).toBe(true);
    expect(isExpired(5000, 2000)).toBe(false);
    expect(isExpired(null, 2000)).toBe(false);
  });

  it('reduces authorization errors to safe text', () => {
    expect(authorizationError('?error=access_denied&error_description=User%20said%20no<script>')).toEqual({
      error: 'access_denied',
      description: 'User said noscript',
    });
    expect(authorizationError('?code=abc&state=xyz')).toBeNull();
  });
});

describe('sandbox laboratory Observations', () => {
  it('keeps only laboratory Observations, at most the limit', () => {
    const bundle = {
      entry: [
        { resource: lab('a') },
        { resource: { ...lab('vitals'), category: [{ coding: [{ code: 'vital-signs' }] }] } },
        { resource: { resourceType: 'Patient', id: 'p' } },
        { resource: lab('b', { valueQuantity: undefined, valueCodeableConcept: { text: 'Detected' } }) },
        { resource: lab('c') },
      ],
    };
    const rows = laboratoryObservations(bundle, 2);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ test: 'Hemoglobin', loinc: '718-7', result: '13.2 g/dL' });
    expect(rows[1].result).toBe('Detected');
    expect(laboratoryObservations(null)).toEqual([]);
  });

  it('asks the sandbox for a small, laboratory-only page', () => {
    expect(laboratorySearch('pat 1')).toBe('Observation?patient=pat%201&category=laboratory&_sort=-date&_count=10');
  });
});

describe('SMART to LabSentinel ingestion bridge', () => {
  it('only records the source server, without changing the original resource', () => {
    const resource = lab('a', { meta: { versionId: '3' } });
    const payload = bridgePayload(resource, session.serverUrl);
    expect(payload.meta).toEqual({ versionId: '3', source: session.serverUrl });
    expect(resource.meta).toEqual({ versionId: '3' });
    expect({ ...payload, meta: undefined }).toEqual({ ...resource, meta: undefined });
  });

  const reply = (result: Record<string, unknown> | null, error?: Record<string, unknown>): IngestionReply => ({
    status: 200,
    response: {
      resources_received: 1, observations_received: 1, observations_validated: 0, observations_created: 0,
      duplicates: 0, rejected: 0, errors: error ? [error as never] : [], warnings: [],
      results: result ? [result as never] : [],
    },
  });

  it('explains every outcome, including the missing facility mapping', () => {
    expect(bridgeOutcome(reply({ outcome: 'created', observation_id: 7, facility_code: 'SMART-SANDBOX' })).tone).toBe('success');
    expect(bridgeOutcome(reply({ outcome: 'duplicate' })).message).toContain('did not create a duplicate');
    expect(bridgeOutcome(reply({ outcome: 'rejected', issue_code: 'UNRESOLVED_FACILITY' }))).toEqual({
      tone: 'warning', title: 'Not stored', message: NO_FACILITY_MAPPING,
    });
    expect(bridgeOutcome(reply({ outcome: 'rejected', issue_code: 'INVALID_RESULT', message: 'bad' })).title).toContain('INVALID_RESULT');
    expect(bridgeOutcome(reply(null, { code: 'INVALID_FHIR', message: 'x' })).message).toContain('INVALID_FHIR');
  });
});
