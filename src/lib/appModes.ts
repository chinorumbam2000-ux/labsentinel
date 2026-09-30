/**
 * The concepts LabSentinel shows, which must never be confused with one
 * another. Every route belongs to exactly one; the top bar names it.
 *
 * The data source (Local Demo Mode vs API Capstone Mode) is a separate,
 * build-time axis, shown by the data-source indicator.
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
    label: 'Capstone Overview',
    description: 'How LabSentinel fits together: workflow, architecture and status',
    chip: 'border-hairline bg-canvas text-ink',
  },
  classroom: {
    label: 'Classroom Demo',
    description: 'Frozen Day 1–Day 5 demonstration',
    chip: 'border-brand/30 bg-brand-light text-brand',
  },
  api: {
    label: 'API Capstone',
    description: 'React + FastAPI + PostgreSQL',
    chip: 'border-[#0F766E]/30 bg-[#F0FDFA] text-[#115E59]',
  },
  dynamic: {
    label: 'Dynamic Surveillance',
    description: 'Signals calculated from stored laboratory observations',
    chip: 'border-[#1D4ED8]/30 bg-[#EFF6FF] text-[#1E40AF]',
  },
  smart: {
    label: 'SMART Sandbox',
    description: 'SMART on FHIR synthetic sandbox context',
    chip: 'border-[#7C3AED]/30 bg-[#F5F3FF] text-[#5B21B6]',
  },
  evaluation: {
    label: 'Capstone Evaluation',
    description: 'Synthetic evaluation scenarios',
    chip: 'border-[#B45309]/30 bg-[#FFFBEB] text-[#92400E]',
  },
};

const CLASSROOM_ROUTES = ['dashboard', 'map', 'laboratory-data', 'signals', 'hospitals', 'analytics', 'simulation', 'reports'];

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
