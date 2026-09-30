/**
 * Presentation Mode: the final capstone demonstration as ten steps through
 * the REAL application. It changes nothing about how any page behaves; it
 * only adds a step bar, enlarges the type a little and hides developer
 * details (elements marked data-dev-detail).
 *
 *   any URL + ?presentation=true    turn on (remembered for the browser session)
 *   any URL + ?presentation=false   turn off
 */

export type StepRequirement = 'api' | 'smart';

export interface PresentationStep {
  title: string;
  route: string;
  /** Element id to scroll to after navigating, if any. */
  anchor?: string;
  cue: string;
  requires?: StepRequirement;
}

export const PRESENTATION_STEPS: PresentationStep[] = [
  {
    title: 'Problem and overview',
    route: '/overview',
    cue: 'Laboratory results arrive before case reports. LabSentinel turns them into early, explainable, privacy-aware signals.',
  },
  {
    title: 'Frozen classroom demo',
    route: '/dashboard',
    cue: 'Step Day 1 → Day 5 with ›: the Composite Outbreak Signal Score rises 0 / 24 / 50 / 74 / 87.',
  },
  {
    title: 'Vendor-agnostic sidecar',
    route: '/hospitals',
    cue: 'One sidecar component inside simulated Epic, Oracle Health and MEDITECH environments. No live vendor connection.',
  },
  {
    title: 'FHIR ingestion',
    route: '/fhir-ingestion',
    cue: 'Load the synthetic Influenza A Observation and ingest it through validation, facility resolution and pseudonymisation.',
    requires: 'api',
  },
  {
    title: 'Normalization',
    route: '/fhir-ingestion',
    anchor: 'source-fhir',
    cue: 'Source FHIR vs normalized record: LOINC 92142-9, SNOMED CT result → Positive, effective vs received time.',
    requires: 'api',
  },
  {
    title: 'Dynamic surveillance',
    route: '/dynamic-surveillance',
    cue: 'Recalculate from the persisted observations: rolling baseline, five components, Data Confidence kept separate.',
    requires: 'api',
  },
  {
    title: 'Statistical comparison',
    route: '/dynamic-surveillance',
    anchor: 'method-comparison',
    cue: 'Composite, EWMA and CUSUM side by side: an agreement count, never one combined score.',
    requires: 'api',
  },
  {
    title: 'SMART on FHIR',
    route: '/smart-demo',
    cue: 'Launch against the public SMART Health IT sandbox (PKCE, read-only scope) and open the sidecar with synthetic patients.',
    requires: 'smart',
  },
  {
    title: 'Evaluation',
    route: '/evaluation',
    cue: '15 synthetic scenarios × 100 runs: sensitivity, timeliness and false alerts — tradeoffs, no winner.',
    requires: 'api',
  },
  {
    title: 'Architecture and future work',
    route: '/architecture',
    anchor: 'future-work',
    cue: 'What is implemented, what is prototype, what is planned — and what real-world validation would need.',
  },
];

export const STORAGE_KEY = 'labsentinel.presentation';

/** true / false when the query string says so, otherwise null. */
export const presentationFromQuery = (search: string): boolean | null => {
  const value = new URLSearchParams(search).get('presentation');
  if (value === null) return null;
  return value === 'true' || value === '1';
};

export const clampStep = (step: number): number =>
  Math.min(PRESENTATION_STEPS.length - 1, Math.max(0, Math.trunc(Number.isFinite(step) ? step : 0)));

/** The first step shown on a path, when the presenter navigated there directly. */
export const stepForPath = (pathname: string, current: number): number => {
  if (PRESENTATION_STEPS[current]?.route === pathname) return current;
  const index = PRESENTATION_STEPS.findIndex((s) => s.route === pathname);
  return index === -1 ? current : index;
};
