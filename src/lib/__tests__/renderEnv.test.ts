import { describe, expect, it } from 'vitest';
import { renderEnvProblems } from '../renderEnv';

const GOOD = {
  VITE_DATA_SOURCE: 'api',
  VITE_API_BASE_URL: 'https://labsentinel-api.onrender.com',
  LABSENTINEL_BASE_PATH: '/',
  VITE_SMART_ENABLED: 'true',
  VITE_SMART_CLIENT_ID: 'labsentinel-capstone-sandbox',
  VITE_SMART_SCOPES: 'openid fhirUser patient/Observation.rs',
  VITE_SMART_REDIRECT_URI: 'https://labsentinel.onrender.com/smart/callback',
};

describe('Render static-site build guard', () => {
  it('accepts a complete https full-stack configuration', () => {
    expect(renderEnvProblems(GOOD)).toEqual([]);
    // The redirect URI may be left empty: the app derives <origin>/smart/callback at run time.
    expect(renderEnvProblems({ ...GOOD, VITE_SMART_REDIRECT_URI: '' })).toEqual([]);
    expect(renderEnvProblems({ ...GOOD, VITE_SMART_ENABLED: 'false', VITE_SMART_CLIENT_ID: '' })).toEqual([]);
  });

  it.each([
    ['http://127.0.0.1:8000', 'must use https'],
    ['https://localhost:8000', 'local address'],
    ['http://labsentinel-api.onrender.com', 'must use https'],
    ['https://YOUR-API-HOST', 'placeholder'],
    ['https://api.example.invalid', 'placeholder'],
    ['https://labsentinel-api.onrender.com/api', 'no path'],
    ['', 'is not set'],
  ])('rejects VITE_API_BASE_URL=%s', (value, message) => {
    expect(renderEnvProblems({ ...GOOD, VITE_API_BASE_URL: value }).join(' ')).toContain(message);
  });

  it('requires API mode, the root base path and a valid SMART redirect', () => {
    expect(renderEnvProblems({ ...GOOD, VITE_DATA_SOURCE: 'local' }).join(' ')).toContain('VITE_DATA_SOURCE must be "api"');
    expect(renderEnvProblems({ ...GOOD, LABSENTINEL_BASE_PATH: '/labsentinel/' }).join(' ')).toContain('LABSENTINEL_BASE_PATH must be "/"');
    expect(renderEnvProblems({ ...GOOD, VITE_SMART_REDIRECT_URI: 'http://localhost:5173/labsentinel/smart/callback' }).join(' ')).toContain('must use https');
    expect(renderEnvProblems({ ...GOOD, VITE_SMART_REDIRECT_URI: 'https://labsentinel.onrender.com/callback' }).join(' ')).toContain('/smart/callback');
    expect(renderEnvProblems({ ...GOOD, VITE_SMART_CLIENT_ID: '' }).join(' ')).toContain('VITE_SMART_CLIENT_ID is required');
  });

  it('refuses anything secret-looking in the public bundle', () => {
    const problems = renderEnvProblems({ ...GOOD, VITE_SMART_CLIENT_SECRET: 'abc', VITE_API_TOKEN: 'xyz' }).join(' ');
    expect(problems).toContain('VITE_SMART_CLIENT_SECRET looks like a secret');
    expect(problems).toContain('VITE_API_TOKEN looks like a secret');
    expect(problems).not.toContain('abc');
    expect(problems).not.toContain('xyz');
  });
});
