import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLIENT_ID,
  DEFAULT_SCOPES,
  SMART_HEALTH_IT_STANDALONE,
  parseSmartConfig,
  validateScopes,
} from '../config';
import { ehrScope, parseEhrLaunch, standaloneScope } from '../launch';

const LOCATION = { origin: 'http://localhost:5173', baseUrl: '/labsentinel/' };

describe('SMART configuration', () => {
  it('is disabled by default, so nothing SMART runs', () => {
    expect(parseSmartConfig({}, LOCATION)).toEqual({ ok: true, config: { enabled: false } });
    expect(parseSmartConfig({ VITE_SMART_ENABLED: 'false' }, LOCATION)).toEqual({ ok: true, config: { enabled: false } });
  });

  it('derives launch and redirect URLs from the Vite base path', () => {
    const result = parseSmartConfig({ VITE_SMART_ENABLED: 'true' }, LOCATION);
    expect(result).toEqual({
      ok: true,
      config: {
        enabled: true,
        clientId: DEFAULT_CLIENT_ID,
        scopes: DEFAULT_SCOPES,
        redirectUri: 'http://localhost:5173/labsentinel/smart/callback',
        launchUri: 'http://localhost:5173/labsentinel/smart/launch',
        standaloneIss: SMART_HEALTH_IT_STANDALONE,
      },
    });
  });

  it('defaults the standalone issuer to a sandbox patient-picker launch, public client, PKCE', () => {
    const encoded = SMART_HEALTH_IT_STANDALONE.match(/\/v\/r4\/sim\/([A-Za-z0-9_-]+)\/fhir$/)?.[1];
    expect(encoded).toBeTruthy();
    const options = JSON.parse(atob(encoded!.replace(/-/g, '+').replace(/_/g, '/')));
    // patient-standalone, no preselected patient, login + approval shown,
    // no client secret, public client, PKCE auto.
    expect(options).toEqual([3, '', '', '', 0, 0, 0, '', '', '', '', '', '', '', 0, 1, '']);
  });

  it.each(['yes', 'TRUE', '1', 'on'])('rejects the unknown flag %j', (flag) => {
    expect(parseSmartConfig({ VITE_SMART_ENABLED: flag }, LOCATION).ok).toBe(false);
  });

  it.each([
    'patient/Observation.write',
    'patient/*.*',
    'user/*.cruds',
    'patient/Observation.cud',
    'offline_access',
    'launch openid',
    'system/Observation.rs',
  ])('rejects the scope set %j', (scopes) => {
    expect(validateScopes(scopes)).not.toBeNull();
    expect(parseSmartConfig({ VITE_SMART_ENABLED: 'true', VITE_SMART_SCOPES: scopes }, LOCATION).ok).toBe(false);
  });

  it('accepts read/search scopes, openid and fhirUser', () => {
    expect(validateScopes(DEFAULT_SCOPES)).toBeNull();
    expect(validateScopes('openid fhirUser patient/Observation.read patient/Patient.r')).toBeNull();
  });

  it('requires https (or local http) redirect and issuer URLs', () => {
    expect(parseSmartConfig({ VITE_SMART_ENABLED: 'true', VITE_SMART_REDIRECT_URI: 'http://evil.example/cb' }, LOCATION).ok).toBe(false);
    expect(parseSmartConfig({ VITE_SMART_ENABLED: 'true', VITE_SMART_STANDALONE_ISS: 'ftp://x' }, LOCATION).ok).toBe(false);
    expect(
      parseSmartConfig({ VITE_SMART_ENABLED: 'true', VITE_SMART_REDIRECT_URI: 'http://127.0.0.1:5173/labsentinel/smart/callback' }, LOCATION).ok,
    ).toBe(true);
  });

  it('rejects client ids that are not simple tokens', () => {
    expect(parseSmartConfig({ VITE_SMART_ENABLED: 'true', VITE_SMART_CLIENT_ID: 'a b' }, LOCATION).ok).toBe(false);
  });
});

describe('SMART launch parameters', () => {
  it('accepts an EHR launch with iss and launch', () => {
    expect(parseEhrLaunch('?iss=https://launch.smarthealthit.org/v/r4/fhir/&launch=abc123')).toEqual({
      ok: true,
      iss: 'https://launch.smarthealthit.org/v/r4/fhir',
      launch: 'abc123',
    });
  });

  it.each([
    ['', 'Standalone Launch'],
    ['?launch=abc', '"iss"'],
    ['?iss=https://x.test/fhir', '"launch"'],
    ['?iss=http://evil.example/fhir&launch=abc', 'https'],
    ['?iss=not-a-url&launch=abc', 'https'],
  ])('explains an invalid launch %j', (search, text) => {
    const result = parseEhrLaunch(search);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(text);
  });

  it('requests the launch-context scope for each launch type', () => {
    expect(ehrScope(DEFAULT_SCOPES)).toBe('launch openid fhirUser patient/Observation.rs');
    expect(standaloneScope(DEFAULT_SCOPES)).toBe('launch/patient openid fhirUser patient/Observation.rs');
  });
});
