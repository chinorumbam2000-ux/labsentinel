import { describe, expect, it } from 'vitest';
import { DEFAULT_API_BASE_URL, parseDataSourceConfig } from '../config';
import { createDataSource } from '../DataSourceProvider';

describe('data-source configuration', () => {
  it('defaults to local mode when VITE_DATA_SOURCE is unset or blank', () => {
    for (const env of [{}, { VITE_DATA_SOURCE: '' }, { VITE_DATA_SOURCE: '   ' }]) {
      const result = parseDataSourceConfig(env);
      expect(result).toEqual({
        ok: true,
        config: { mode: 'local', apiBaseUrl: DEFAULT_API_BASE_URL },
      });
    }
  });

  it('accepts local and api', () => {
    expect(parseDataSourceConfig({ VITE_DATA_SOURCE: 'local' })).toMatchObject({ ok: true, config: { mode: 'local' } });
    expect(parseDataSourceConfig({ VITE_DATA_SOURCE: 'api' })).toMatchObject({ ok: true, config: { mode: 'api' } });
  });

  it.each(['API', 'Local', 'remote', 'postgres', 'true', 'local,api'])(
    'rejects the unknown mode %j instead of guessing',
    (value) => {
      const result = parseDataSourceConfig({ VITE_DATA_SOURCE: value });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(`received "${value}"`);
    },
  );

  it('uses the configured API base URL without a trailing slash', () => {
    expect(
      parseDataSourceConfig({ VITE_DATA_SOURCE: 'api', VITE_API_BASE_URL: 'http://localhost:9000/' }),
    ).toMatchObject({ ok: true, config: { apiBaseUrl: 'http://localhost:9000' } });
  });

  it.each(['not a url', 'ftp://127.0.0.1:8000', 'javascript:alert(1)'])(
    'rejects the invalid API base URL %j',
    (url) => {
      expect(parseDataSourceConfig({ VITE_DATA_SOURCE: 'api', VITE_API_BASE_URL: url }).ok).toBe(false);
    },
  );

  it('builds the data source for the selected mode', () => {
    expect(createDataSource({ mode: 'local', apiBaseUrl: DEFAULT_API_BASE_URL }).mode).toBe('local');
    const api = createDataSource({ mode: 'api', apiBaseUrl: 'http://127.0.0.1:8000' });
    expect(api.mode).toBe('api');
    expect(api.label).toBe('http://127.0.0.1:8000');
    expect(api.sync).toBeUndefined();
  });
});
