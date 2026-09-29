/**
 * Data-source configuration, read from Vite environment variables at build
 * time.
 *
 *   VITE_DATA_SOURCE   local (default) | api
 *   VITE_API_BASE_URL  FastAPI base URL for api mode (default http://127.0.0.1:8000)
 *
 * Local mode is the default so the public GitHub Pages build keeps working
 * with no backend. Any other VITE_DATA_SOURCE value is rejected, never
 * guessed at: an app that quietly ran in a different mode than intended would
 * make it impossible to prove which data it is showing.
 */

export type DataSourceMode = 'local' | 'api';

export interface DataSourceConfig {
  mode: DataSourceMode;
  /** Only meaningful in api mode. No trailing slash. */
  apiBaseUrl: string;
}

export type ConfigResult =
  | { ok: true; config: DataSourceConfig }
  | { ok: false; error: string };

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

interface EnvLike {
  VITE_DATA_SOURCE?: string;
  VITE_API_BASE_URL?: string;
}

export const parseDataSourceConfig = (env: EnvLike): ConfigResult => {
  const rawMode = (env.VITE_DATA_SOURCE ?? '').trim();
  const mode = rawMode === '' ? 'local' : rawMode;
  if (mode !== 'local' && mode !== 'api') {
    return {
      ok: false,
      error: `VITE_DATA_SOURCE must be "local" or "api"; received "${rawMode}".`,
    };
  }

  const rawUrl = (env.VITE_API_BASE_URL ?? '').trim() || DEFAULT_API_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: `VITE_API_BASE_URL is not a valid URL: "${rawUrl}".` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: `VITE_API_BASE_URL must use http or https: "${rawUrl}".` };
  }

  return { ok: true, config: { mode, apiBaseUrl: rawUrl.replace(/\/+$/, '') } };
};

/** The configuration this build was made with. */
export const BUILD_CONFIG: ConfigResult = parseDataSourceConfig(import.meta.env);
