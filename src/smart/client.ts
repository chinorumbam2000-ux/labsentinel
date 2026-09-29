/**
 * The only module that talks to the SMART client library (fhirclient).
 *
 * - The library is loaded lazily, so builds with SMART disabled (including
 *   the GitHub Pages build) never execute it and never contact a server.
 * - Authorization uses the library's authorize() / ready() flow with PKCE
 *   when the server supports it; LabSentinel is a public client (no secret).
 * - The library keeps its session state in sessionStorage (its intended
 *   browser behaviour). LabSentinel adds no token storage of its own, and
 *   the session object handed to the UI deliberately carries no token.
 *
 * fhirclient 3.0.0 ships incomplete TypeScript declarations, so the small
 * surface used here is typed explicitly below.
 */
import type { SmartEnabledConfig } from './config';
import { ehrScope, standaloneScope, type LaunchType } from './launch';

/** What the UI receives: identifiers and context, never credentials. */
export interface SmartSession {
  serverUrl: string;
  launchType: LaunchType | null;
  patientId: string | null;
  fhirUser: string | null;
  grantedScopes: string | null;
  /** Access-token expiry, seconds since the epoch, if the server said. */
  expiresAt: number | null;
  /** Read from the connected FHIR server (relative URLs resolve against it). */
  request: <T = unknown>(url: string) => Promise<T>;
}

/** The parts of fhirclient's Client this module relies on. */
interface LibraryClient {
  state: {
    serverUrl: string;
    expiresAt?: number;
    tokenResponse?: { scope?: string };
  };
  getPatientId(): string | null;
  getFhirUser(): string | null;
  request<T>(url: string): Promise<T>;
}

interface LibraryAuthorizeParams {
  clientId: string;
  scope: string;
  redirectUri: string;
  iss: string;
  launch?: string;
  pkceMode: 'ifSupported' | 'required' | 'disabled';
}

interface Library {
  authorize(params: LibraryAuthorizeParams): Promise<string | void>;
  ready(): Promise<LibraryClient>;
}

const loadLibrary = async (): Promise<Library> =>
  (await import('fhirclient/browser')) as unknown as Library;

/** fhirclient's own sessionStorage key pointing at its state entry. */
export const LIBRARY_SESSION_KEY = 'SMART_KEY';
/** Non-sensitive note of how this session was launched. */
export const LAUNCH_TYPE_KEY = 'labsentinel.smart.launchType';

const rememberLaunchType = (type: LaunchType) => {
  try {
    sessionStorage.setItem(LAUNCH_TYPE_KEY, type);
  } catch {
    // Storage may be unavailable; the label simply shows as unknown.
  }
};

const recalledLaunchType = (): LaunchType | null => {
  try {
    const value = sessionStorage.getItem(LAUNCH_TYPE_KEY);
    return value === 'ehr' || value === 'standalone' ? value : null;
  } catch {
    return null;
  }
};

/** Map the library client to the session the UI may see. No token leaves here. */
export const toSession = (client: LibraryClient, launchType: LaunchType | null): SmartSession => ({
  serverUrl: client.state.serverUrl,
  launchType,
  patientId: client.getPatientId(),
  fhirUser: client.getFhirUser(),
  grantedScopes: client.state.tokenResponse?.scope ?? null,
  expiresAt: typeof client.state.expiresAt === 'number' ? client.state.expiresAt : null,
  request: <T,>(url: string) => client.request<T>(url),
});

/** Start an EHR launch: iss and launch came from the EHR's launch URL. */
export const beginEhrLaunch = async (config: SmartEnabledConfig, iss: string, launch: string): Promise<void> => {
  rememberLaunchType('ehr');
  const library = await loadLibrary();
  await library.authorize({
    clientId: config.clientId,
    scope: ehrScope(config.scopes),
    redirectUri: config.redirectUri,
    iss,
    launch,
    pkceMode: 'ifSupported',
  });
};

/** Start a standalone launch against the configured sandbox FHIR base. */
export const beginStandaloneLaunch = async (config: SmartEnabledConfig): Promise<void> => {
  rememberLaunchType('standalone');
  const library = await loadLibrary();
  await library.authorize({
    clientId: config.clientId,
    scope: standaloneScope(config.scopes),
    redirectUri: config.redirectUri,
    iss: config.standaloneIss,
    pkceMode: 'ifSupported',
  });
};

// ready() exchanges the one-time authorization code. React StrictMode (and a
// double render) must not run that exchange twice, so it is shared.
let authorization: Promise<SmartSession> | null = null;

/** Finish authorization on the redirect (callback) page. */
export const completeAuthorization = (): Promise<SmartSession> => {
  if (!authorization) {
    authorization = loadLibrary()
      .then((library) => library.ready())
      .then((client) => toSession(client, recalledLaunchType()));
    authorization.catch(() => {
      authorization = null;
    });
  }
  return authorization;
};

/** The current session, if this tab has one; null when there is none. */
export const restoreSession = async (): Promise<SmartSession | null> => {
  if (!hasStoredSession()) return null;
  const library = await loadLibrary();
  return toSession(await library.ready(), recalledLaunchType());
};

export const hasStoredSession = (): boolean => {
  try {
    return sessionStorage.getItem(LIBRARY_SESSION_KEY) !== null;
  } catch {
    return false;
  }
};

/** Forget this tab's SMART session: the library's state and our launch note. */
export const endSession = (): void => {
  authorization = null;
  try {
    const pointer = sessionStorage.getItem(LIBRARY_SESSION_KEY);
    if (pointer) {
      const stateKey = JSON.parse(pointer) as unknown;
      if (typeof stateKey === 'string') sessionStorage.removeItem(stateKey);
    }
    sessionStorage.removeItem(LIBRARY_SESSION_KEY);
    sessionStorage.removeItem(LAUNCH_TYPE_KEY);
  } catch {
    // Nothing to clear.
  }
};
