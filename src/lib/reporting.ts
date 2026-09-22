/**
 * Simulated public-health reporting workflow.
 *
 * NOTHING IS TRANSMITTED. "Simulate Submission" changes a status field in
 * browser memory and does nothing else — no network request is made, no
 * eCR/ELR message is generated, and no public-health authority, state system,
 * CDC or WHO endpoint is contacted or represented. A production system would
 * need a real reportability-rules engine, a genuine eCR/ELR pipeline, and
 * jurisdiction-specific onboarding before any of this meant anything.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  DataConfidenceResult,
  InvestigationRecord,
  OutbreakAlert,
  ReportAction,
  ReportEvent,
  ReportRecord,
  ReportSnapshot,
  ReportStatus,
  SignalScoreResult,
  SimulationDay,
  SimulationScenario,
} from '../types';
import { HOSPITAL_BY_ID } from '../data/hospitals';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../data/simulation';
import { SYNDROME } from '../data/tests';
import { DEFAULT_INVESTIGATOR } from './investigationWorkflow';
import { getDisclosureSummary } from './geographicPrivacy';

export const REPORTING_DISCLAIMER =
  'Prototype reporting simulation — no information is transmitted to any public-health authority.';

export const REPORTING_SCOPE_NOTE =
  'This prototype does not implement electronic case reporting (eCR), electronic laboratory reporting (ELR), or any connection to a state health department, the CDC or the WHO. Nothing leaves this browser.';

interface ReportActionDefinition {
  action: ReportAction;
  label: string;
  timelineLabel: string;
  toStatus: ReportStatus;
  from: ReportStatus[];
  description: string;
}

export const REPORT_ACTIONS: ReportActionDefinition[] = [
  {
    action: 'save-draft',
    label: 'Save Draft',
    timelineLabel: 'Draft saved',
    toStatus: 'DRAFT',
    from: ['DRAFT', 'READY FOR REVIEW'],
    description: 'Keep working on the report without advancing it.',
  },
  {
    action: 'review',
    label: 'Review',
    timelineLabel: 'Marked ready for review',
    toStatus: 'READY FOR REVIEW',
    from: ['DRAFT'],
    description: 'Mark the draft ready for a second pair of eyes.',
  },
  {
    action: 'approve',
    label: 'Approve',
    timelineLabel: 'Approved',
    toStatus: 'APPROVED',
    from: ['READY FOR REVIEW'],
    description: 'Approve the report for simulated submission.',
  },
  {
    action: 'submit',
    label: 'Simulate Submission',
    timelineLabel: 'Submission simulated',
    toStatus: 'SIMULATED SUBMISSION',
    from: ['APPROVED', 'FAILED'],
    description: 'Run the simulated submission. Nothing is transmitted.',
  },
  {
    action: 'fail',
    label: 'Simulate Failure',
    timelineLabel: 'Simulated submission failed',
    toStatus: 'FAILED',
    from: ['APPROVED', 'FAILED'],
    description: 'Demonstrate the failure path a real transport could hit.',
  },
  {
    action: 'retry',
    label: 'Return to Approved',
    timelineLabel: 'Returned to approved',
    toStatus: 'APPROVED',
    from: ['FAILED'],
    description: 'Put a failed report back into the approved state to retry.',
  },
];

const BY_ACTION: Record<ReportAction, ReportActionDefinition> = REPORT_ACTIONS.reduce(
  (acc, definition) => {
    acc[definition.action] = definition;
    return acc;
  },
  {} as Record<ReportAction, ReportActionDefinition>,
);

export const getAvailableReportActions = (
  report: ReportRecord,
): ReportActionDefinition[] =>
  REPORT_ACTIONS.filter((definition) => definition.from.includes(report.status));

let reportCounter = 0;
let eventCounter = 0;

const nextReportId = (day: SimulationDay): string => {
  reportCounter += 1;
  return `RPT-D${day}-${String(reportCounter).padStart(3, '0')}`;
};

const nextEventId = (): string => {
  eventCounter += 1;
  return `RPT-EVT-${eventCounter}`;
};

export interface BuildReportInput {
  alert: OutbreakAlert;
  investigation: InvestigationRecord;
  scenario: SimulationScenario;
  score: SignalScoreResult;
  confidence: DataConfidenceResult;
  analystNotes?: string;
  investigator?: string;
}

/** Freezes everything the report shows at the moment it is prepared. */
export const buildReportSnapshot = ({
  alert,
  scenario,
  score,
  confidence,
}: BuildReportInput): ReportSnapshot => ({
  signalId: alert.id,
  signalTitle: alert.title,
  syndrome: SYNDROME,
  detectedAt: alert.detectedAt,
  detectedDay: alert.detectedDay,
  preparedForDay: scenario.day,
  preparedForDate: scenario.simulationDate,
  affectedFacilities: scenario.affectedHospitals.map((id) => {
    const hospital = HOSPITAL_BY_ID[id];
    return `${hospital.name} (${hospital.vendor})`;
  }),
  affectedAreas: scenario.affectedZipCodes,
  // Area detail is reported subject to the same privacy rule as the UI.
  areaDisclosure: getDisclosureSummary(scenario.day),
  testVolume: scenario.totalTests,
  baselineTestVolume: BASELINE_TEST_VOLUME,
  positivityRate: scenario.positivityRate,
  baselinePositivityRate: BASELINE_POSITIVITY_RATE,
  positiveResults: scenario.totalPositives,
  compositeScore: score.composite,
  severity: score.severity,
  dataConfidenceScore: confidence.score,
  dataConfidenceLevel: confidence.level,
  persistenceDays: scenario.persistenceDays,
});

export const createReport = (input: BuildReportInput): ReportRecord => {
  const now = new Date().toISOString();
  const investigator = input.investigator ?? DEFAULT_INVESTIGATOR;

  return {
    id: nextReportId(input.scenario.day),
    alertId: input.alert.id,
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    investigationStatus: input.investigation.status,
    analystNotes: input.analystNotes ?? '',
    snapshot: buildReportSnapshot(input),
    history: [
      {
        id: nextEventId(),
        action: 'save-draft',
        label: 'Report prepared as draft',
        toStatus: 'DRAFT',
        at: now,
        investigator,
        note: null,
      },
    ],
  };
};

export interface ApplyReportActionResult {
  ok: boolean;
  report: ReportRecord;
  error: string | null;
}

export const applyReportAction = (
  report: ReportRecord,
  action: ReportAction,
  options: { notes?: string; investigator?: string } = {},
): ApplyReportActionResult => {
  const definition = BY_ACTION[action];
  if (!definition) {
    return { ok: false, report, error: `Unknown report action "${action}".` };
  }
  if (!definition.from.includes(report.status)) {
    return {
      ok: false,
      report,
      error: `"${definition.label}" is not available from status ${report.status}.`,
    };
  }

  const now = new Date().toISOString();
  const investigator = options.investigator ?? DEFAULT_INVESTIGATOR;
  const event: ReportEvent = {
    id: nextEventId(),
    action,
    label: definition.timelineLabel,
    toStatus: definition.toStatus,
    at: now,
    investigator,
    note:
      action === 'fail'
        ? 'Simulated transport failure. Nothing was transmitted — this demonstrates the failure path only.'
        : null,
  };

  return {
    ok: true,
    error: null,
    report: {
      ...report,
      status: definition.toStatus,
      updatedAt: now,
      analystNotes: options.notes ?? report.analystNotes,
      history: [...report.history, event],
    },
  };
};

export const REPORT_STATUS_STYLES: Record<ReportStatus, string> = {
  DRAFT: 'bg-canvas text-muted ring-1 ring-inset ring-hairline',
  'READY FOR REVIEW': 'bg-[#0369A1]/10 text-[#0369A1] ring-1 ring-inset ring-[#0369A1]/25',
  APPROVED: 'bg-severity-low/10 text-[#166534] ring-1 ring-inset ring-severity-low/25',
  'SIMULATED SUBMISSION':
    'bg-[#0F766E]/10 text-[#0F766E] ring-1 ring-inset ring-[#0F766E]/25',
  FAILED:
    'bg-severity-critical/10 text-severity-critical ring-1 ring-inset ring-severity-critical/30',
};
