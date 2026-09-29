/**
 * Pure presentation logic for the SMART sandbox: connection states, safe
 * technical details, laboratory Observation filtering and the ingestion
 * bridge. Nothing here sees or returns a token.
 */
import type { IngestionReply } from '../data-access/fhirIngestion';
import { LAUNCH_TYPE_LABEL } from './launch';
import type { SmartSession } from './client';

export type SmartStatus =
  | 'not-configured'
  | 'ready'
  | 'authorizing'
  | 'connected'
  | 'denied'
  | 'server-error'
  | 'expired'
  | 'config-error';

/** Plain-language label and explanation per state; icon + text, never color alone. */
export const SMART_STATUS: Record<SmartStatus, { icon: string; label: string; message: string }> = {
  'not-configured': {
    icon: '–',
    label: 'Not Configured',
    message: 'SMART sandbox integration is not enabled in this build (VITE_SMART_ENABLED is not "true").',
  },
  ready: { icon: '○', label: 'Ready to Launch', message: 'No SMART session in this tab yet. Launch from the SMART sandbox.' },
  authorizing: { icon: '…', label: 'Authorizing', message: 'Completing SMART authorization with the sandbox…' },
  connected: { icon: '●', label: 'Connected', message: 'Authorized SMART session with the sandbox FHIR server.' },
  denied: {
    icon: '✕',
    label: 'Authorization Denied',
    message: 'The sandbox authorization server did not grant access, so no session was created.',
  },
  'server-error': {
    icon: '✕',
    label: 'FHIR Server Error',
    message: 'The sandbox FHIR server could not be reached or returned an error.',
  },
  expired: {
    icon: '!',
    label: 'Session Expired',
    message: 'The SMART access token has expired. Launch again from the sandbox to continue.',
  },
  'config-error': {
    icon: '✕',
    label: 'SMART Configuration Error',
    message: 'LabSentinel could not start SMART authorization with this configuration or server.',
  },
};

/** Expired once the access token's expiry has passed (10 s of clock skew allowed). */
export const isExpired = (expiresAt: number | null, nowSeconds = Date.now() / 1000): boolean =>
  expiresAt !== null && expiresAt - 10 < nowSeconds;

/** Reduce an authorization server's error text to something safe to show. */
export const authorizationError = (search: string): { error: string; description: string | null } | null => {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (!error) return null;
  const clean = (value: string | null) =>
    value ? value.replace(/[^\w .,:;'()\-/]/g, '').slice(0, 200) || null : null;
  return { error: clean(error) ?? 'error', description: clean(params.get('error_description')) };
};

/** A server's display label: its host (the path is shown only in technical details). */
export const serverLabel = (serverUrl: string): string => {
  try {
    return new URL(serverUrl).host;
  } catch {
    return 'Unknown server';
  }
};

export interface TechnicalDetail {
  label: string;
  value: string;
}

/**
 * The technical details shown for a session. Built from an explicit list of
 * safe fields: there is no path by which a token, code or verifier reaches it.
 */
export const technicalDetails = (
  session: SmartSession,
  discovery: { pkceMethods: string[] | null } | null,
): TechnicalDetail[] => [
  { label: 'SMART profile', value: 'SMART App Launch 2.2.0 (public client, authorization code flow)' },
  { label: 'FHIR base URL', value: session.serverUrl },
  { label: 'FHIR version', value: 'R4' },
  { label: 'Launch type', value: session.launchType ? LAUNCH_TYPE_LABEL[session.launchType] : 'Unknown' },
  { label: 'Granted scopes', value: session.grantedScopes ?? 'Not reported by the server' },
  { label: 'Patient context available', value: session.patientId ? 'Yes' : 'No' },
  { label: 'FHIR user context available', value: session.fhirUser ? 'Yes' : 'No' },
  {
    label: 'PKCE',
    value:
      discovery === null
        ? 'Server capabilities not loaded'
        : discovery.pkceMethods?.includes('S256')
          ? 'S256 (supported by the server; used)'
          : 'Not advertised by the server',
  },
  { label: 'Authorization status', value: 'Authorized' },
  {
    label: 'Access token expires',
    value: session.expiresAt ? new Date(session.expiresAt * 1000).toLocaleTimeString('en-US') : 'Not reported',
  },
];

/** The fhirUser reference with its resource type, e.g. "Practitioner/123". */
export const fhirUserLabel = (fhirUser: string | null): string | null => {
  if (!fhirUser) return null;
  const parts = fhirUser.split('/');
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : fhirUser;
};

type Json = Record<string, unknown>;

export interface SandboxLabRow {
  id: string;
  test: string;
  loinc: string | null;
  result: string;
  effective: string | null;
  resource: Json;
}

const LAB_CATEGORY = 'laboratory';

const isLaboratory = (resource: Json): boolean =>
  ((resource.category as Json[] | undefined) ?? []).some((concept) =>
    ((concept.coding as Json[] | undefined) ?? []).some((coding) => coding.code === LAB_CATEGORY),
  );

export const resultText = (resource: Json): string => {
  const quantity = resource.valueQuantity as Json | undefined;
  if (quantity && quantity.value !== undefined) {
    return `${quantity.comparator ?? ''}${quantity.value} ${quantity.unit ?? quantity.code ?? ''}`.trim();
  }
  const concept = resource.valueCodeableConcept as Json | undefined;
  if (concept) {
    const coding = (concept.coding as Json[] | undefined)?.[0];
    return String(concept.text ?? coding?.display ?? coding?.code ?? 'Coded result');
  }
  if (typeof resource.valueString === 'string') return resource.valueString;
  if (typeof resource.valueBoolean === 'boolean') return String(resource.valueBoolean);
  return 'No value';
};

/** Laboratory Observations from a search Bundle, newest first, at most `limit`. */
export const laboratoryObservations = (bundle: unknown, limit = 10): SandboxLabRow[] => {
  const entries = ((bundle as Json | null)?.entry as Json[] | undefined) ?? [];
  return entries
    .map((entry) => entry.resource as Json | undefined)
    .filter((resource): resource is Json => resource?.resourceType === 'Observation' && isLaboratory(resource))
    .slice(0, limit)
    .map((resource) => {
      const code = resource.code as Json | undefined;
      const codings = (code?.coding as Json[] | undefined) ?? [];
      const loinc = codings.find((coding) => coding.system === 'http://loinc.org');
      return {
        id: String(resource.id ?? ''),
        test: String(code?.text ?? loinc?.display ?? codings[0]?.display ?? 'Laboratory observation'),
        loinc: loinc?.code ? String(loinc.code) : null,
        result: resultText(resource),
        effective: (resource.effectiveDateTime as string | undefined) ?? null,
        resource,
      };
    });
};

/** Search URL for the patient's laboratory Observations (kept deliberately small). */
export const laboratorySearch = (patientId: string, limit = 10): string =>
  `Observation?patient=${encodeURIComponent(patientId)}&category=laboratory&_sort=-date&_count=${limit}`;

/**
 * The resource sent to LabSentinel's ingestion endpoint: the sandbox
 * Observation unchanged except for meta.source, which records the FHIR
 * server it was read from (FHIR's element for a resource's source system).
 * The original object is not modified.
 */
export const bridgePayload = (resource: Json, issuer: string): Json => ({
  ...resource,
  meta: { ...((resource.meta as Json | undefined) ?? {}), source: issuer },
});

export const NO_FACILITY_MAPPING =
  'SMART source connected, but no LabSentinel participating-facility mapping is configured.';

export interface BridgeOutcome {
  tone: 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

/** Explain an ingestion reply for a bridged sandbox Observation. */
export const bridgeOutcome = (reply: IngestionReply): BridgeOutcome => {
  const result = reply.response.results[0];
  const error = reply.response.errors[0];
  if (!result) {
    return { tone: 'error', title: 'Rejected', message: error ? `${error.code}: ${error.message}` : `HTTP ${reply.status}` };
  }
  if (result.outcome === 'created') {
    return {
      tone: 'success',
      title: 'Ingested into LabSentinel',
      message: `Validated, normalized and stored as observation ${result.observation_id} (${result.facility_code}).`,
    };
  }
  if (result.outcome === 'duplicate') {
    return {
      tone: 'warning',
      title: 'Already ingested',
      message: 'LabSentinel detected the same source system + source observation ID and did not create a duplicate record.',
    };
  }
  if (result.issue_code === 'UNRESOLVED_FACILITY') {
    return { tone: 'warning', title: 'Not stored', message: NO_FACILITY_MAPPING };
  }
  return {
    tone: 'error',
    title: `Rejected — ${result.issue_code ?? 'error'}`,
    message: result.message ?? 'The Observation did not pass LabSentinel validation.',
  };
};
