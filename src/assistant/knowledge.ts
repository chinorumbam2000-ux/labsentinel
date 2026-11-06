/**
 * Roella — curated product knowledge.
 *
 * Concise, factual descriptions of Signal by ProbeSyQ and of the build it is
 * running in. Method details (weights, severity and confidence bands) are
 * read from the scorer and the confidence model themselves, never retyped.
 * What the build can do depends on its data source: local mode runs in the
 * browser with no backend, API mode reads the FastAPI + PostgreSQL backend.
 * Every statement below says only what is true of the mode it is used in.
 */
import { CONFIDENCE_WEIGHTS, getConfidenceLevel } from '../lib/dataConfidence';
import { SCORE_WEIGHTS, getSeverity } from '../lib/signalScore';
import type { AssistantRoute, DataMode } from './types';

export const PRODUCT = {
  name: 'Signal by ProbeSyQ',
  what:
    'Signal by ProbeSyQ is a vendor-agnostic outbreak intelligence and laboratory surveillance application. It turns routine laboratory results into early-warning public-health signals.',
  who: 'It is built for public health analysts and related surveillance users.',
  workflow: [
    'Laboratory signals',
    'Standardization (LOINC-coded, FHIR-style results)',
    'Surveillance scoring (the Composite Outbreak Signal Score)',
    'Geographic and facility intelligence',
    'Alerts',
    'Investigation and reporting',
  ],
};

/** What this build runs on. Synthetic data in both modes; never a live hospital connection. */
export const buildStatement = (mode: DataMode): string =>
  mode === 'api'
    ? 'This build reads its data from the Signal by ProbeSyQ API (FastAPI and PostgreSQL), on synthetic data: three fictional facilities, three surveillance areas and five simulated days. No live hospital, laboratory or EHR system is connected.'
    : 'This build runs entirely in your browser on synthetic data: three fictional facilities, three surveillance areas and five simulated days. It has no backend and no live hospital, laboratory or FHIR connection.';

export interface PageInfo {
  /** The sidebar label. */
  nav: string;
  title: string;
  shows: string;
  use: string;
  /** What the page needs to show its content: the API backend, or the SMART sandbox build flag. */
  requires?: 'api' | 'smart';
  /** The sidebar section the page sits in, when it is not part of the analyst workflow. */
  section?: 'System';
}

/** What each screen shows, in the words of its own headings. */
export const PAGES: Record<Exclude<AssistantRoute, 'other'>, PageInfo> = {
  dashboard: {
    nav: 'Dashboard',
    title: 'Regional Outbreak Status',
    shows:
      'Active Surveillance — every surveillance profile (Respiratory Viral Syndrome, Influenza A, COVID-19, RSV, Cholera and Gastrointestinal Syndrome), each scored against its own baseline — then, for the selected profile, the current situation (the Composite Outbreak Signal Score beside Data Confidence), epidemiological indicators, geographic intelligence, data quality, the current alert and the day-to-day change.',
    use: 'Start with Active Surveillance to see which profiles need attention, choose one with the Surveillance profile selector, then follow its alert into Signals.',
  },
  map: {
    nav: 'Outbreak Map',
    title: 'Outbreak Map',
    shows:
      'the synthetic surveillance areas, coloured by severity, with a legend and a privacy-aware detail panel for each area. Small counts are suppressed.',
    use: 'Click an area to see its tests, positives, positivity, trend and the facility behind it.',
  },
  'laboratory-data': {
    nav: 'Laboratory Data',
    title: 'Laboratory Observations',
    shows:
      'the synthetic FHIR-style laboratory Observation records received up to the current day, with search, filters, sorting and pagination.',
    use: 'Filter by facility, test or result, or search a synthetic patient or observation ID.',
  },
  signals: {
    nav: 'Signals',
    title: 'Signals & Alerts',
    shows:
      'the alert table with acknowledgement, the signal investigation breakdown ("Why this signal"), and the human-in-the-loop investigation workflow.',
    use: 'Acknowledge new alerts, then open Investigate to see the detection-time evidence and record review steps.',
  },
  hospitals: {
    nav: 'Facilities',
    title: 'Facilities',
    shows:
      'every participating facility\'s status (reporting, freshness, completeness, LOINC mapping, contribution to the signal), then a dashboard for the selected facility, its data confidence and feed health, and the clinician sidecar inside each simulated EHR environment.',
    use: 'Choose a facility in the status table to see its details.',
  },
  investigations: {
    nav: 'Investigations',
    title: 'Investigations',
    shows: 'every detected signal with the status of its human review and of its public-health report.',
    use: 'Open an investigation to review the detection-time evidence and record review steps; reports follow on Reports.',
  },
  analytics: {
    nav: 'Analytics',
    title: 'Trends & Analytics',
    shows: 'trends across the simulated days so far: test volume, positivity, the signal score and geographic spread, each on its own scale.',
    use: 'Use it to see how the signal developed day by day.',
  },
  simulation: {
    nav: 'Scenario Replay',
    title: 'Scenario Replay',
    shows: 'the five-day simulated respiratory outbreak scenario, its day-by-day progression and the replay controls.',
    use: 'Step, play or reset the replay days here or with the controls in the top bar; every analyst page follows the same replay day.',
  },
  reports: {
    nav: 'Reports',
    title: 'Public Health Reports',
    shows: 'the simulated public-health reporting workflow and its audit timeline. Nothing is sent to any authority.',
    use: 'Prepare a report from an investigated alert and move it through review.',
  },
  architecture: {
    nav: 'Architecture',
    section: 'System',
    title: 'Signal by ProbeSyQ Architecture',
    shows:
      'the current prototype pipeline, the configurable geography, future multi-source surveillance, the next development stage and the longer-term architecture, each labelled with its status.',
    use: 'Read the status labels to separate what this prototype implements from what is planned.',
  },
  overview: {
    nav: 'Project Overview',
    section: 'System',
    title: 'Laboratory-First Public Health Early Warning',
    shows: 'the end-to-end workflow, the routes to every part of the application, and the status of this build.',
    use: 'Start here for a tour, then follow a card to the screen it describes.',
  },
  'fhir-ingestion': {
    nav: 'Data Ingestion',
    section: 'System',
    title: 'FHIR Laboratory Ingestion',
    shows:
      'the development FHIR R4 ingestion pipeline: a synthetic Observation or Bundle is validated, its facility and LOINC test are resolved, and the normalized record is compared with the original.',
    use: 'Load a synthetic example, submit it, and review the normalized record and recent ingestions. Never paste real patient data.',
    requires: 'api',
  },
  'dynamic-surveillance': {
    nav: 'Detection Methods',
    section: 'System',
    title: 'Dynamic Surveillance',
    shows:
      'signals calculated by the dynamic engine from stored observations against a rolling baseline, with the EWMA and CUSUM statistical detectors alongside.',
    use: 'Pick a date to see its signal, the facilities that crossed their thresholds and how the statistical methods compare.',
    requires: 'api',
  },
  evaluation: {
    nav: 'Validation',
    section: 'System',
    title: 'Capstone Evaluation',
    shows: 'how the surveillance methods performed on synthetic scenarios with known ground truth: sensitivity, timeliness and false alerts.',
    use: 'Compare the methods scenario by scenario; the results describe synthetic data only.',
    requires: 'api',
  },
  'smart-demo': {
    nav: 'Integration Testing',
    section: 'System',
    title: 'SMART on FHIR Sandbox',
    shows: 'the SMART on FHIR configuration and the launch into the public SMART Health IT synthetic sandbox.',
    use: 'Launch from here to see the clinician-facing sidecar read synthetic Observations.',
    requires: 'smart',
  },
};

/** Why a page cannot show its content in this build, or null when it can. */
export const pageUnavailable = (page: PageInfo, mode: DataMode, smartEnabled: boolean): string | null => {
  if (page.requires === 'api' && mode !== 'api') {
    return `In this build (local mode, no backend) the ${page.nav} page shows a notice instead: it needs the Signal by ProbeSyQ API.`;
  }
  if (page.requires === 'smart' && !smartEnabled) {
    return `The SMART sandbox is not enabled in this build, so the ${page.nav} page shows a notice instead.`;
  }
  return null;
};

/** Navigation targets: words in a question, and the screen that answers them. */
export const NAVIGATION: Array<{ words: string[]; route: Exclude<AssistantRoute, 'other'>; what: string }> = [
  { words: ['map', 'zip', 'area', 'geograph', 'where is the outbreak'], route: 'map', what: 'surveillance areas and ZIP-level detail' },
  { words: ['hospital', 'facility', 'facilities', 'vendor', 'sidecar', 'feed'], route: 'hospitals', what: 'facility-level details, feed health and the vendor sidecar' },
  { words: ['trend', 'chart', 'over time', 'history', 'analytics'], route: 'analytics', what: 'score, volume, positivity and spread trends across the simulated days' },
  { words: ['observation', 'lab data', 'laboratory', 'records', 'results', 'loinc'], route: 'laboratory-data', what: 'the synthetic laboratory Observation records' },
  { words: ['investigation', 'investigat', 'case review'], route: 'investigations', what: 'every detected signal and the status of its review' },
  { words: ['alert', 'signal', 'acknowledge'], route: 'signals', what: 'alerts, acknowledgement and each signal\'s evidence' },
  { words: ['report'], route: 'reports', what: 'the simulated public-health reporting workflow' },
  { words: ['fhir ingestion', 'ingest', 'upload a fhir', 'submit a fhir'], route: 'fhir-ingestion', what: 'the development FHIR R4 ingestion pipeline' },
  { words: ['ewma', 'cusum', 'dynamic surveillance', 'statistical'], route: 'dynamic-surveillance', what: 'dynamic signals and the EWMA and CUSUM detectors' },
  { words: ['evaluation'], route: 'evaluation', what: 'how the surveillance methods performed on synthetic scenarios' },
  { words: ['smart sandbox', 'smart launch', 'launch smart'], route: 'smart-demo', what: 'the SMART on FHIR sandbox launch' },
  { words: ['architecture', 'design', 'roadmap', 'planned'], route: 'architecture', what: 'the architecture and status of each component' },
  { words: ['scenario replay', 'replay', 'simulation', 'change the day', 'next day', 'previous day', 'play', 'reset'], route: 'simulation', what: 'the five-day scenario and its replay controls' },
  { words: ['dashboard', 'overview', 'home'], route: 'dashboard', what: 'the regional status overview' },
];

export const CONCEPTS = {
  fhir:
    'FHIR (Fast Healthcare Interoperability Resources) is the HL7 standard for exchanging health data as structured resources; laboratory results are FHIR Observation resources.',
  smart:
    'SMART on FHIR is the standard way for an app to launch inside, or alongside, an EHR and read FHIR data with OAuth 2.0 authorization, so the same app can run across different EHR vendors.',
  loinc:
    'LOINC is the standard code system for laboratory tests. Signal by ProbeSyQ groups results by LOINC code into a surveillance syndrome, so the same test counts the same way whichever system sent it.',
  vendorAgnostic:
    'Vendor-agnostic means one Signal by ProbeSyQ view works across EHR vendors. The Facilities page shows the same sidecar inside simulated Epic, Oracle Health and MEDITECH environments; these are simulations, not connections to those vendors.',
};

/** The score's components and weights, from the scorer. */
export const SCORE_COMPONENTS: Array<{ key: keyof typeof SCORE_WEIGHTS; label: string; weight: number; measures: string }> = [
  { key: 'volume', label: 'Test Volume', weight: SCORE_WEIGHTS.volume, measures: 'test volume against the baseline' },
  { key: 'positivity', label: 'Positivity', weight: SCORE_WEIGHTS.positivity, measures: 'positivity rise above the baseline' },
  { key: 'facilities', label: 'Affected Facilities', weight: SCORE_WEIGHTS.facilities, measures: 'how many participating facilities show elevated activity' },
  { key: 'geography', label: 'Geographic Spread', weight: SCORE_WEIGHTS.geography, measures: 'how many surveillance areas are affected' },
  { key: 'persistence', label: 'Persistence', weight: SCORE_WEIGHTS.persistence, measures: 'consecutive days above baseline' },
];

export const CONFIDENCE_COMPONENTS: Array<{ label: string; weight: number }> = [
  { label: 'Feed Freshness', weight: CONFIDENCE_WEIGHTS.freshness },
  { label: 'Data Completeness', weight: CONFIDENCE_WEIGHTS.completeness },
  { label: 'Terminology Mapping Quality', weight: CONFIDENCE_WEIGHTS.terminology },
  { label: 'Facility Participation', weight: CONFIDENCE_WEIGHTS.participation },
  { label: 'Data Integrity', weight: CONFIDENCE_WEIGHTS.integrity },
];

/** Score ranges per band, derived by probing the scorer's own getSeverity(). */
const bands = <T extends string>(classify: (score: number) => T): Array<{ label: T; from: number; to: number }> => {
  const out: Array<{ label: T; from: number; to: number }> = [];
  for (let score = 0; score <= 100; score += 1) {
    const label = classify(score);
    const last = out[out.length - 1];
    if (last && last.label === label) last.to = score;
    else out.push({ label, from: score, to: score });
  }
  return out;
};

export const SEVERITY_BANDS = bands(getSeverity);
export const CONFIDENCE_BANDS = bands(getConfidenceLevel);

/** FHIR in this build: what actually happens, and nothing more. */
export const fhirInThisBuild = (mode: DataMode): string =>
  mode === 'api'
    ? 'In this build, the backend has a development FHIR R4 ingestion endpoint: synthetic Observations or Bundles can be validated, resolved to a facility and a LOINC-coded test, and stored (FHIR Ingestion page, where the deployment enables it). The Day 1–5 records on Laboratory Data are the synthetic dataset. No hospital or EHR FHIR server is connected.'
    : "In this build, every laboratory result is a synthetic FHIR-style Observation generated in your browser and shown on Laboratory Data. No FHIR server is contacted. FHIR R4 ingestion runs in the full-stack (API) mode of Signal by ProbeSyQ.";

/** SMART in this build. */
export const smartInThisBuild = (smartEnabled: boolean): string =>
  smartEnabled
    ? 'In this build, the SMART Sandbox page can launch Signal by ProbeSyQ against the public SMART Health IT synthetic sandbox, with read-only access to Observations. No real EHR is involved.'
    : "In this build no SMART launch happens: the vendor sidecar on the Facilities page shows where a SMART-launched view would sit inside each simulated EHR environment. The full-stack build of Signal by ProbeSyQ can enable a SMART launch against a public synthetic sandbox.";

export const OUT_OF_SCOPE =
  'I can help with Signal by ProbeSyQ, its surveillance data, outbreak signals, facilities, trends, analytics, and how the application works.';
export const MEDICAL_ADVICE =
  "I can explain the surveillance information shown in Signal by ProbeSyQ, but I don't provide individual medical diagnosis or treatment advice.";
export const NOT_ENOUGH =
  "I don't have enough information in the current Signal by ProbeSyQ data to answer that reliably.";

/** Starter questions per screen (the panel adds day-aware ones). */
export const PAGE_QUESTIONS: Record<AssistantRoute, string[]> = {
  dashboard: ['Which profiles need attention?', 'Why is the score this high?', 'Summarize the current outbreak situation.', 'What does Data Confidence mean?'],
  map: ['Which ZIP codes are affected?', 'Which area is most affected?', 'Why are some counts shown as <5?'],
  'laboratory-data': ['How many laboratory observations are there?', 'Which LOINC tests are included?', 'What is the positivity rate?'],
  signals: ['Which alerts are active?', 'What should I investigate next?', 'Why is the score this high?'],
  hospitals: ['Which facilities are affected?', 'Which facility has the highest positivity?', 'What vendor environment does each facility represent?'],
  investigations: ['What should I investigate next?', 'Which alerts are active?', 'What does this page show?'],
  analytics: ['What trend do you see?', 'Is positivity increasing?', 'When did the signal become High?'],
  simulation: ['What changed since the previous day?', 'What happens on Day 1?', 'Summarize the current outbreak situation.'],
  reports: ['What does the Reports page show?', 'What should I investigate next?', 'Summarize the current outbreak situation.'],
  architecture: ['How does Signal by ProbeSyQ work?', 'What is FHIR?', 'What is SMART on FHIR?'],
  overview: ['What is Signal by ProbeSyQ?', 'Summarize the current outbreak situation.', 'What does this page show?'],
  'fhir-ingestion': ['What does this page show?', 'What is FHIR?', 'What is LOINC?'],
  'dynamic-surveillance': ['What does this page show?', 'How is the Composite Score calculated?', 'What does Data Confidence mean?'],
  evaluation: ['What does this page show?', 'How is the Composite Score calculated?', 'What is Signal by ProbeSyQ?'],
  'smart-demo': ['What is SMART on FHIR?', 'What is FHIR?', 'What does this page show?'],
  other: ['What is Signal by ProbeSyQ?', 'Summarize the current outbreak situation.', 'How does the Composite Outbreak Signal Score work?'],
};
