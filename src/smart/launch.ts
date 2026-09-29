/**
 * SMART App Launch parameters and scopes.
 *
 * EHR launch: the EHR (here, the SMART Health IT launcher) opens the launch
 * URL with ?iss=<FHIR base>&launch=<opaque launch token>. Standalone launch:
 * the app starts on its own against a configured FHIR base, and asks the
 * authorization server to let the user pick a patient.
 */
import { isAcceptableUrl } from './config';

export type LaunchType = 'ehr' | 'standalone';

export type EhrLaunchParams =
  | { ok: true; iss: string; launch: string }
  | { ok: false; error: string };

export const parseEhrLaunch = (search: string): EhrLaunchParams => {
  const params = new URLSearchParams(search);
  const iss = params.get('iss')?.trim() ?? '';
  const launch = params.get('launch')?.trim() ?? '';
  if (!iss && !launch) {
    return {
      ok: false,
      error:
        'This page is opened by an EHR (SMART launcher) with iss and launch parameters. ' +
        'To start without an EHR, use Standalone Launch on the SMART on FHIR Sandbox page.',
    };
  }
  if (!iss) return { ok: false, error: 'The EHR launch is missing the "iss" (FHIR server) parameter.' };
  if (!launch) return { ok: false, error: 'The EHR launch is missing the "launch" context parameter.' };
  if (!isAcceptableUrl(iss)) {
    return { ok: false, error: 'The "iss" parameter must be an https URL (or http on localhost).' };
  }
  if (launch.length > 4096) return { ok: false, error: 'The "launch" parameter is too long.' };
  return { ok: true, iss: iss.replace(/\/+$/, ''), launch };
};

/** EHR launch: the launch token carries the context, so request "launch". */
export const ehrScope = (clinicalScopes: string): string => `launch ${clinicalScopes}`;

/** Standalone launch: ask the server to establish patient context. */
export const standaloneScope = (clinicalScopes: string): string => `launch/patient ${clinicalScopes}`;

export const LAUNCH_TYPE_LABEL: Record<LaunchType, string> = {
  ehr: 'EHR Launch',
  standalone: 'Standalone Launch',
};
