// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The SMART client library, mocked: no test touches a real server.
const library = vi.hoisted(() => ({
  authorize: vi.fn(async (_params: Record<string, unknown>) => undefined),
  ready: vi.fn(),
}));
vi.mock('fhirclient/browser', () => library);

import {
  LAUNCH_TYPE_KEY,
  LIBRARY_SESSION_KEY,
  beginEhrLaunch,
  beginStandaloneLaunch,
  completeAuthorization,
  endSession,
  restoreSession,
  toSession,
} from '../client';
import type { SmartEnabledConfig } from '../config';

const config: SmartEnabledConfig = {
  enabled: true,
  clientId: 'test-client',
  scopes: 'openid fhirUser patient/Observation.rs',
  redirectUri: 'http://localhost/labsentinel/smart/callback',
  launchUri: 'http://localhost/labsentinel/smart/launch',
  standaloneIss: 'https://sandbox.test/fhir',
};

const fakeLibraryClient = () => ({
  state: {
    serverUrl: 'https://sandbox.test/fhir',
    expiresAt: 2_000_000_000,
    codeVerifier: 'SECRET-VERIFIER',
    tokenResponse: {
      access_token: 'SECRET-ACCESS-TOKEN',
      refresh_token: 'SECRET-REFRESH',
      id_token: 'SECRET-ID-TOKEN',
      scope: 'launch openid fhirUser patient/Observation.rs',
      patient: 'pat-1',
    },
  },
  getPatientId: () => 'pat-1',
  getFhirUser: () => 'Practitioner/prac-1',
  request: vi.fn(async () => ({ resourceType: 'Bundle' })),
});

beforeEach(() => {
  library.authorize.mockClear();
  library.ready.mockReset();
  sessionStorage.clear();
  endSession();
});
afterEach(() => sessionStorage.clear());

describe('SMART client adapter', () => {
  it('starts an EHR launch through fhirclient with PKCE and no client secret', async () => {
    await beginEhrLaunch(config, 'https://ehr.test/fhir', 'launch-token');

    expect(library.authorize).toHaveBeenCalledTimes(1);
    const params = library.authorize.mock.calls[0][0];
    expect(params).toEqual({
      clientId: 'test-client',
      scope: 'launch openid fhirUser patient/Observation.rs',
      redirectUri: 'http://localhost/labsentinel/smart/callback',
      iss: 'https://ehr.test/fhir',
      launch: 'launch-token',
      pkceMode: 'ifSupported',
    });
    expect(Object.keys(params)).not.toContain('clientSecret');
    expect(sessionStorage.getItem(LAUNCH_TYPE_KEY)).toBe('ehr');
  });

  it('starts a standalone launch asking for patient context', async () => {
    await beginStandaloneLaunch(config);
    const params = library.authorize.mock.calls[0][0];
    expect(params.scope).toBe('launch/patient openid fhirUser patient/Observation.rs');
    expect(params.iss).toBe('https://sandbox.test/fhir');
    expect(params).not.toHaveProperty('launch');
    expect(sessionStorage.getItem(LAUNCH_TYPE_KEY)).toBe('standalone');
  });

  it('hands the UI a session with no tokens, codes or verifiers', () => {
    const session = toSession(fakeLibraryClient() as never, 'ehr');
    const serialized = JSON.stringify(session);
    for (const secret of ['SECRET-ACCESS-TOKEN', 'SECRET-REFRESH', 'SECRET-ID-TOKEN', 'SECRET-VERIFIER']) {
      expect(serialized).not.toContain(secret);
    }
    expect(session).toMatchObject({
      serverUrl: 'https://sandbox.test/fhir',
      patientId: 'pat-1',
      fhirUser: 'Practitioner/prac-1',
      grantedScopes: 'launch openid fhirUser patient/Observation.rs',
      expiresAt: 2_000_000_000,
      launchType: 'ehr',
    });
  });

  it('exchanges the authorization code only once, even when asked twice', async () => {
    library.ready.mockResolvedValue(fakeLibraryClient());
    const [a, b] = await Promise.all([completeAuthorization(), completeAuthorization()]);
    expect(library.ready).toHaveBeenCalledTimes(1);
    expect(a.patientId).toBe(b.patientId);
  });

  it('does not load a session (or the library) when this tab has none', async () => {
    expect(await restoreSession()).toBeNull();
    expect(library.ready).not.toHaveBeenCalled();
  });

  it('restores a stored session and ends it by clearing only SMART keys', async () => {
    sessionStorage.setItem(LIBRARY_SESSION_KEY, JSON.stringify('state-key-1'));
    sessionStorage.setItem('state-key-1', JSON.stringify({ serverUrl: 'x' }));
    sessionStorage.setItem(LAUNCH_TYPE_KEY, 'standalone');
    sessionStorage.setItem('unrelated', 'keep');
    library.ready.mockResolvedValue(fakeLibraryClient());

    const session = await restoreSession();
    expect(session?.launchType).toBe('standalone');

    endSession();
    expect(sessionStorage.getItem(LIBRARY_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem('state-key-1')).toBeNull();
    expect(sessionStorage.getItem(LAUNCH_TYPE_KEY)).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });
});
