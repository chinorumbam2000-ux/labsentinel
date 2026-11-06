/**
 * The concepts LabSentinel shows, which must never be confused with one
 * another. Every route belongs to exactly one; the top bar names it.
 *
 * The data source (Local Demo Mode vs API Capstone Mode) is a separate,
 * build-time axis. It is an implementation detail, so the data-source
 * indicator appears only on the System (technical) pages.
 */

export type AppMode = 'overview' | 'classroom' | 'api' | 'dynamic' | 'smart' | 'evaluation';

export interface ModeDefinition {
  label: string;
  description: string;
  /** Tailwind classes for the chip: text never relies on colour alone. */
  chip: string;
}

export const MODES: Record<AppMode, ModeDefinition> = {
  overview: {
    label: 'Project Overview',
    description: 'How Signal by ProbeSyQ fits together: workflow, architecture and status',
    chip: 'border-hairline bg-canvas text-ink',
  },
  // The five-day Scenario Replay (internal key kept from the first release).
  classroom: {
    label: 'Scenario Replay',
    description: 'Simulated surveillance data',
    chip: 'border-brand/30 bg-brand-light text-brand',
  },
  api: {
    label: 'Data Ingestion',
    description: 'React + FastAPI + PostgreSQL',
    chip: 'border-[#0F766E]/30 bg-[#F0FDFA] text-[#115E59]',
  },
  dynamic: {
    label: 'Detection Methods',
    description: 'Signals calculated from stored laboratory observations',
    chip: 'border-[#1D4ED8]/30 bg-[#EFF6FF] text-[#1E40AF]',
  },
  smart: {
    label: 'Integration Testing',
    description: 'SMART on FHIR synthetic sandbox context',
    chip: 'border-[#7C3AED]/30 bg-[#F5F3FF] text-[#5B21B6]',
  },
  evaluation: {
    label: 'Validation',
    description: 'Synthetic evaluation scenarios',
    chip: 'border-[#B45309]/30 bg-[#FFFBEB] text-[#92400E]',
  },
};

// 'hospitals' and 'simulation' are former addresses of Facilities and Scenario Replay (they redirect).
const CLASSROOM_ROUTES = [
  'dashboard', 'map', 'laboratory-data', 'signals', 'facilities', 'hospitals', 'investigations', 'analytics', 'replay', 'simulation', 'reports',
];

/** The mode a path (relative to the router basename) belongs to. */
export const modeForPath = (pathname: string): AppMode => {
  const first = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  if (CLASSROOM_ROUTES.includes(first)) return 'classroom';
  if (first === 'fhir-ingestion') return 'api';
  if (first === 'dynamic-surveillance') return 'dynamic';
  if (first === 'smart-demo' || first === 'smart') return 'smart';
  if (first === 'evaluation') return 'evaluation';
  return 'overview';
};

/** The key messages every presentation must leave the audience with. */
export const KEY_DISCLAIMERS = [
  'Synthetic data only. No real patient data.',
  'No production Epic, Oracle Health or MEDITECH connection: the vendor environments are simulated.',
  'The SMART on FHIR connection uses a public sandbox with synthetic patients.',
  'Composite, EWMA and CUSUM are prototype surveillance methods, not validated for public-health decisions.',
  'The Phase 10 evaluation demonstrates technical behavior on synthetic scenarios, not clinical or epidemiological validation.',
] as const;
