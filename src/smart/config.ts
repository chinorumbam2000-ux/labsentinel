/**
 * SMART sandbox configuration, read from Vite environment variables.
 *
 *   VITE_SMART_ENABLED         false (default) | true
 *   VITE_SMART_CLIENT_ID       public client id (the SMART Health IT sandbox accepts any)
 *   VITE_SMART_SCOPES          clinical scopes; "launch" / "launch/patient" are added per launch type
 *   VITE_SMART_REDIRECT_URI    default <origin><base>smart/callback
 *   VITE_SMART_STANDALONE_ISS  FHIR base for standalone launch (default: SMART Health IT R4 sandbox, patient picker)
 *
 * LabSentinel is a PUBLIC browser client: there is no client secret, and any
 * configuration that asks for write access or long-lived (offline) tokens is
 * rejected rather than quietly accepted.
 */

export const DEFAULT_CLIENT_ID = 'labsentinel-capstone-sandbox';
/** Least privilege: identity of the launching user, and read/search of Observations only. */
export const DEFAULT_SCOPES = 'openid fhirUser patient/Observation.rs';
export const SMART_HEALTH_IT_R4 = 'https://launch.smarthealthit.org/v/r4/fhir';
export const SMART_HEALTH_IT_LAUNCHER = 'https://launch.smarthealthit.org/';

/**
 * The SMART Health IT sandbox reads its launch options from the issuer URL
 * for a standalone launch (its plain R4 base rejects one as "Invalid launch
 * options"). These options ask for a patient standalone launch: the sandbox
 * shows its own login and synthetic-patient picker, then the approval screen.
 * Base64url of the launcher's option array:
 *   [3 = patient-standalone, patient "", provider "", encounter "",
 *    skip_login 0, skip_auth 0, sim_ehr 0, scope "", redirect_uris "",
 *    client_id "", client_secret "", auth_error "", jwks_url "", jwks "",
 *    client_type 0 = public, pkce 1 = auto, fhir_server ""]
 */
export const SMART_HEALTH_IT_STANDALONE =
  'https://launch.smarthealthit.org/v/r4/sim/WzMsIiIsIiIsIiIsMCwwLDAsIiIsIiIsIiIsIiIsIiIsIiIsIiIsMCwxLCIiXQ/fhir';

export interface SmartEnabledConfig {
  enabled: true;
  clientId: string;
  /** Clinical scopes, without the launch-context scope. */
  scopes: string;
  redirectUri: string;
  launchUri: string;
  standaloneIss: string;
}

export type SmartConfig = { enabled: false } | SmartEnabledConfig;
export type SmartConfigResult = { ok: true; config: SmartConfig } | { ok: false; error: string };

interface SmartEnv {
  VITE_SMART_ENABLED?: string;
  VITE_SMART_CLIENT_ID?: string;
  VITE_SMART_SCOPES?: string;
  VITE_SMART_REDIRECT_URI?: string;
  VITE_SMART_STANDALONE_ISS?: string;
}

/** Scopes the app may request: identity, and read/search of patient or user data. */
const ALLOWED_SCOPE = /^(openid|fhirUser|profile|(patient|user)\/[A-Za-z]+\.(read|r|s|rs))$/;

export const validateScopes = (scopes: string): string | null => {
  const tokens = scopes.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 'VITE_SMART_SCOPES is empty.';
  for (const token of tokens) {
    if (token === 'launch' || token.startsWith('launch/')) {
      return `Do not list "${token}" in VITE_SMART_SCOPES; the launch scope is added per launch type.`;
    }
    if (token === 'offline_access' || token === 'online_access') {
      return `"${token}" is not requested: this sandbox demo avoids long-lived tokens.`;
    }
    if (!ALLOWED_SCOPE.test(token)) {
      return `Scope "${token}" is not allowed: only read/search scopes (e.g. patient/Observation.rs) and openid/fhirUser.`;
    }
  }
  return null;
};

/** https everywhere; plain http only for a local development host. */
export const isAcceptableUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
};

export const parseSmartConfig = (
  env: SmartEnv,
  location: { origin: string; baseUrl: string },
): SmartConfigResult => {
  const flag = (env.VITE_SMART_ENABLED ?? '').trim();
  if (flag === '' || flag === 'false') return { ok: true, config: { enabled: false } };
  if (flag !== 'true') {
    return { ok: false, error: `VITE_SMART_ENABLED must be "true" or "false"; received "${flag}".` };
  }

  const appBase = `${location.origin}${location.baseUrl.endsWith('/') ? location.baseUrl : `${location.baseUrl}/`}`;
  const clientId = (env.VITE_SMART_CLIENT_ID ?? '').trim() || DEFAULT_CLIENT_ID;
  const scopes = (env.VITE_SMART_SCOPES ?? '').trim().replace(/\s+/g, ' ') || DEFAULT_SCOPES;
  const redirectUri = (env.VITE_SMART_REDIRECT_URI ?? '').trim() || `${appBase}smart/callback`;
  const standaloneIss = (env.VITE_SMART_STANDALONE_ISS ?? '').trim().replace(/\/+$/, '') || SMART_HEALTH_IT_STANDALONE;

  if (!/^[A-Za-z0-9._~-]{1,100}$/.test(clientId)) {
    return { ok: false, error: 'VITE_SMART_CLIENT_ID may contain only letters, digits, ".", "_", "~" and "-".' };
  }
  const scopeError = validateScopes(scopes);
  if (scopeError) return { ok: false, error: scopeError };
  if (!isAcceptableUrl(redirectUri)) {
    return { ok: false, error: `VITE_SMART_REDIRECT_URI must be an https (or local http) URL: "${redirectUri}".` };
  }
  if (!isAcceptableUrl(standaloneIss)) {
    return { ok: false, error: `VITE_SMART_STANDALONE_ISS must be an https (or local http) URL: "${standaloneIss}".` };
  }

  return {
    ok: true,
    config: {
      enabled: true,
      clientId,
      scopes,
      redirectUri,
      launchUri: `${appBase}smart/launch`,
      standaloneIss,
    },
  };
};

export const SMART_BUILD_CONFIG: SmartConfigResult = parseSmartConfig(import.meta.env, {
  origin: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  baseUrl: import.meta.env.BASE_URL,
});
