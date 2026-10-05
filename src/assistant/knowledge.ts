/**
 * Ask LabSentinel — curated product knowledge.
 *
 * Concise, factual descriptions of LabSentinel and of this classroom
 * demonstration. Method details (weights, severity and confidence bands) are
 * read from the scorer and the confidence model themselves, never retyped.
 * This demo runs in the browser on synthetic data; anything that only exists
 * in the intended or full-stack architecture is described as such.
 */
import { CONFIDENCE_WEIGHTS, getConfidenceLevel } from '../lib/dataConfidence';
import { SCORE_WEIGHTS, getSeverity } from '../lib/signalScore';
import type { AssistantRoute } from './types';

export const PRODUCT = {
  what:
    'LabSentinel is a vendor-agnostic outbreak intelligence and laboratory surveillance prototype. It turns routine laboratory results into early-warning public-health signals.',
  who: 'It is built for public health analysts and related surveillance users.',
  workflow: [
    'Laboratory signals',
    'Standardization (LOINC-coded, FHIR-style results)',
    'Surveillance scoring (the Composite Outbreak Signal Score)',
    'Geographic and facility intelligence',
    'Alerts',
    'Investigation and reporting',
  ],
  demo:
    'This classroom demonstration runs entirely in your browser on synthetic data: three fictional facilities, three surveillance areas and five simulated days. It has no backend and no live hospital, laboratory or FHIR connection.',
};

export interface PageInfo {
  /** The sidebar label. */
  nav: string;
  title: string;
  shows: string;
  use: string;
}

/** What each screen shows, in the words of its own headings. */
export const PAGES: Record<Exclude<AssistantRoute, 'other'>, PageInfo> = {
  dashboard: {
    nav: 'Dashboard',
    title: 'Regional Outbreak Status',
    shows:
      'the current situation (the Composite Outbreak Signal Score beside Data Confidence), epidemiological indicators, geographic intelligence, data quality, the current alert and the day-to-day change.',
    use: 'Start here for the regional picture, then follow the current alert into Signals.',
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
    nav: 'Hospitals',
    title: 'Hospitals & Vendor Sidecar',
    shows:
      'a dashboard per facility (tests, positives, positivity, trends), feed health, data confidence, interoperability status and the vendor sidecar inside each simulated EHR environment.',
    use: 'Switch between the three simulated vendor environments to compare facilities.',
  },
  analytics: {
    nav: 'Analytics',
    title: 'Trends & Analytics',
    shows: 'trends across the simulated days so far: test volume, positivity, the signal score and geographic spread, each on its own scale.',
    use: 'Use it to see how the signal developed day by day.',
  },
  simulation: {
    nav: 'Simulation',
    title: 'Respiratory Outbreak Simulation',
    shows: 'the five-day simulation controls and the day-by-day progression of the outbreak story.',
    use: 'Step, play or reset the days here or with the controls in the top bar; every page follows the same day.',
  },
  reports: {
    nav: 'Reports',
    title: 'Public Health Reports',
    shows: 'the simulated public-health reporting workflow and its audit timeline. Nothing is sent to any authority.',
    use: 'Prepare a report from an investigated alert and move it through review.',
  },
  architecture: {
    nav: 'Architecture',
    title: 'LabSentinel Architecture',
    shows:
      'the current prototype pipeline, the configurable geography, future multi-source surveillance, the next development stage and the longer-term architecture, each labelled with its status.',
    use: 'Read the status labels to separate what this prototype implements from what is planned.',
  },
};

/** Navigation targets: words in a question, and the screen that answers them. */
export const NAVIGATION: Array<{ words: string[]; route: Exclude<AssistantRoute, 'other'>; what: string }> = [
  { words: ['map', 'zip', 'area', 'geograph', 'where is the outbreak'], route: 'map', what: 'surveillance areas and ZIP-level detail' },
  { words: ['hospital', 'facility', 'facilities', 'vendor', 'sidecar', 'feed'], route: 'hospitals', what: 'facility-level details, feed health and the vendor sidecar' },
  { words: ['trend', 'chart', 'over time', 'history', 'analytics'], route: 'analytics', what: 'score, volume, positivity and spread trends across the simulated days' },
  { words: ['observation', 'lab data', 'laboratory', 'records', 'results', 'loinc'], route: 'laboratory-data', what: 'the synthetic laboratory Observation records' },
  { words: ['alert', 'signal', 'investigat', 'acknowledge'], route: 'signals', what: 'alerts, acknowledgement and the investigation workflow' },
  { words: ['report'], route: 'reports', what: 'the simulated public-health reporting workflow' },
  { words: ['architecture', 'design', 'roadmap', 'planned'], route: 'architecture', what: 'the architecture and status of each component' },
  { words: ['simulation', 'change the day', 'next day', 'previous day', 'play', 'reset'], route: 'simulation', what: 'the day-by-day simulation controls' },
  { words: ['dashboard', 'overview', 'home'], route: 'dashboard', what: 'the regional status overview' },
];

export const CONCEPTS = {
  fhir:
    'FHIR (Fast Healthcare Interoperability Resources) is the HL7 standard for exchanging health data as structured resources; laboratory results are FHIR Observation resources.',
  fhirDemo:
    'In this demo, every laboratory result is a synthetic FHIR-style Observation generated in your browser and shown on Laboratory Data. No FHIR server is contacted. Real FHIR endpoints are part of the intended architecture (see Architecture), and the separate full-stack capstone build demonstrates FHIR ingestion.',
  smart:
    'SMART on FHIR is the standard way for an app to launch inside, or alongside, an EHR and read FHIR data with OAuth 2.0 authorization, so the same app can run across different EHR vendors.',
  smartDemo:
    'In this demo, the vendor sidecar on the Hospitals page shows where a SMART-launched view would sit inside each simulated EHR environment; no SMART launch happens here. The separate full-stack capstone build demonstrates a SMART launch against a public synthetic sandbox.',
  loinc:
    'LOINC is the standard code system for laboratory tests. LabSentinel groups results by LOINC code into a surveillance syndrome, so the same test counts the same way whichever system sent it.',
  vendorAgnostic:
    'Vendor-agnostic means one LabSentinel view works across EHR vendors. The demo shows the same sidecar inside simulated Epic, Oracle Health and MEDITECH environments; these are simulations, not connections to those vendors.',
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

export const OUT_OF_SCOPE =
  'I can help with LabSentinel, its surveillance data, outbreak signals, facilities, trends, analytics, and how the application works.';
export const MEDICAL_ADVICE =
  "I can explain the surveillance information shown in LabSentinel, but I don't provide individual medical diagnosis or treatment advice.";
export const NOT_ENOUGH =
  "I don't have enough information in the current LabSentinel demo to answer that reliably.";

/** Starter questions per screen (the panel adds day-aware ones). */
export const PAGE_QUESTIONS: Record<AssistantRoute, string[]> = {
  dashboard: ['Why is the score this high?', 'Summarize the current outbreak situation.', 'What does Data Confidence mean?'],
  map: ['Which ZIP codes are affected?', 'Which area is most affected?', 'Why are some counts shown as <5?'],
  'laboratory-data': ['How many laboratory observations are there?', 'Which LOINC tests are included?', 'What is the positivity rate?'],
  signals: ['Which alerts are active?', 'What should I investigate next?', 'Why is the score this high?'],
  hospitals: ['Which hospitals are affected?', 'Which facility has the highest positivity?', 'What vendor environment does each facility represent?'],
  analytics: ['What trend do you see?', 'Is positivity increasing?', 'When did the signal become High?'],
  simulation: ['What changed since the previous day?', 'What happens on Day 1?', 'Summarize the current outbreak situation.'],
  reports: ['What does the Reports page show?', 'What should I investigate next?', 'Summarize the current outbreak situation.'],
  architecture: ['How does LabSentinel work?', 'What is FHIR?', 'What is SMART on FHIR?'],
  other: ['What is LabSentinel?', 'Summarize the current outbreak situation.', 'How does the Composite Outbreak Signal Score work?'],
};
