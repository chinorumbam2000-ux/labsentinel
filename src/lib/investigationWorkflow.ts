/**
 * Human-in-the-loop investigation workflow.
 *
 * LabSentinel raises a signal; a person decides what it means. This module is
 * the state machine behind that review: who is looking at it, what they did,
 * when, and why.
 *
 * Nothing here is automatic. Every transition is an explicit analyst action,
 * and the three consequential ones — escalate, dismiss, confirm concern —
 * cannot be taken without a written note.
 *
 * "Confirmed Concern" means an analyst judged the signal worth acting on. It
 * is NOT a laboratory-confirmed outbreak and must never be presented as one.
 *
 * DEMO ENVIRONMENT — Synthetic data only. Investigation state lives in the
 * browser for this prototype and is never transmitted anywhere.
 */
import type {
  InvestigationAction,
  InvestigationEvent,
  InvestigationRecord,
  InvestigationStatus,
  SimulationDay,
} from '../types';
import { simulationTimestamp } from '../data/simulation';

export const DEFAULT_INVESTIGATOR = 'Public Health Analyst';

export const REVIEW_DISCLAIMER =
  'LabSentinel supports epidemiological review but does not replace public-health investigation or clinical judgment.';

export const CONFIRMED_CONCERN_NOTE =
  '"Confirmed Concern" records an analyst judgement that the signal warrants follow-up. It is not a laboratory-confirmed outbreak.';

interface ActionDefinition {
  action: InvestigationAction;
  label: string;
  /** Past-tense phrase used in the timeline. */
  timelineLabel: string;
  toStatus: InvestigationStatus;
  /** Statuses from which this action is offered. */
  from: InvestigationStatus[];
  requiresNote: boolean;
  description: string;
}

/**
 * The transition table. Reopening from DISMISSED or CLOSED is deliberately
 * allowed — a signal that was set aside can turn out to matter.
 */
export const ACTIONS: ActionDefinition[] = [
  {
    action: 'acknowledge',
    label: 'Acknowledge',
    timelineLabel: 'Analyst acknowledged',
    toStatus: 'NEW',
    from: ['NEW'],
    requiresNote: false,
    description: 'Record that an analyst has seen this signal.',
  },
  {
    action: 'begin-review',
    label: 'Begin Review',
    timelineLabel: 'Review started',
    toStatus: 'UNDER REVIEW',
    from: ['NEW', 'MONITORING', 'DISMISSED', 'CLOSED'],
    requiresNote: false,
    description: 'Take ownership and start an epidemiological review.',
  },
  {
    action: 'monitor',
    label: 'Continue Monitoring',
    timelineLabel: 'Placed under monitoring',
    toStatus: 'MONITORING',
    from: ['UNDER REVIEW', 'ESCALATED', 'CONFIRMED CONCERN'],
    requiresNote: false,
    description: 'Keep the signal open and watch it across further days.',
  },
  {
    action: 'escalate',
    label: 'Escalate',
    timelineLabel: 'Escalated for investigation',
    toStatus: 'ESCALATED',
    from: ['NEW', 'UNDER REVIEW', 'MONITORING'],
    requiresNote: true,
    description: 'Refer the signal onward for fuller investigation.',
  },
  {
    action: 'dismiss',
    label: 'Dismiss',
    timelineLabel: 'Dismissed',
    toStatus: 'DISMISSED',
    from: ['NEW', 'UNDER REVIEW', 'MONITORING', 'ESCALATED'],
    requiresNote: true,
    description: 'Judge the signal not to warrant further action.',
  },
  {
    action: 'confirm-concern',
    label: 'Mark Confirmed Concern',
    timelineLabel: 'Marked as a confirmed concern',
    toStatus: 'CONFIRMED CONCERN',
    from: ['UNDER REVIEW', 'MONITORING', 'ESCALATED'],
    requiresNote: true,
    description:
      'Record an analyst judgement that this warrants follow-up. Not a laboratory-confirmed outbreak.',
  },
  {
    action: 'close',
    label: 'Close',
    timelineLabel: 'Closed',
    toStatus: 'CLOSED',
    from: ['UNDER REVIEW', 'MONITORING', 'ESCALATED', 'DISMISSED', 'CONFIRMED CONCERN'],
    requiresNote: false,
    description: 'Close the review. It can be reopened later if needed.',
  },
];

const BY_ACTION: Record<InvestigationAction, ActionDefinition> = ACTIONS.reduce(
  (acc, definition) => {
    acc[definition.action] = definition;
    return acc;
  },
  {} as Record<InvestigationAction, ActionDefinition>,
);

export const requiresNote = (action: InvestigationAction): boolean =>
  BY_ACTION[action]?.requiresNote ?? false;

/** Actions offered from the current status. */
export const getAvailableActions = (
  record: InvestigationRecord,
): ActionDefinition[] =>
  ACTIONS.filter((definition) => {
    if (!definition.from.includes(record.status)) return false;
    // Acknowledging twice is meaningless.
    if (definition.action === 'acknowledge' && record.acknowledged) return false;
    return true;
  });

export const canApply = (
  record: InvestigationRecord,
  action: InvestigationAction,
): boolean => getAvailableActions(record).some((item) => item.action === action);

/** Timeline clock times, so a fresh investigation reads sensibly. */
const REVIEW_CLOCK_BY_ACTION: Record<InvestigationAction | 'generated', string> = {
  generated: '15:58',
  acknowledge: '16:05',
  'begin-review': '16:18',
  monitor: '16:26',
  escalate: '16:31',
  'confirm-concern': '16:44',
  dismiss: '16:38',
  close: '17:02',
};

let eventCounter = 0;
const nextEventId = (): string => {
  eventCounter += 1;
  return `INV-EVT-${eventCounter}`;
};

/** A brand-new investigation for a freshly detected signal. */
export const createInvestigation = (
  alertId: string,
  detectedDay: SimulationDay,
  detectedAt: string,
): InvestigationRecord => ({
  alertId,
  status: 'NEW',
  assignedInvestigator: null,
  acknowledged: false,
  lastStatusChangeAt: null,
  lastReviewedAt: null,
  history: [
    {
      id: nextEventId(),
      action: 'generated',
      label: 'Signal generated',
      fromStatus: null,
      toStatus: 'NEW',
      at: new Date().toISOString(),
      simulationAt: detectedAt,
      day: detectedDay,
      investigator: 'LabSentinel signal engine',
      note: null,
    },
  ],
});

export interface ApplyActionInput {
  record: InvestigationRecord;
  action: InvestigationAction;
  day: SimulationDay;
  note?: string;
  investigator?: string;
}

export interface ApplyActionResult {
  ok: boolean;
  record: InvestigationRecord;
  /** Why the action was refused, when it was. */
  error: string | null;
}

/**
 * Applies an analyst action. Returns the unchanged record with an error when
 * the transition is not allowed or a required note is missing — the caller
 * decides how to surface that.
 */
export const applyInvestigationAction = ({
  record,
  action,
  day,
  note,
  investigator = DEFAULT_INVESTIGATOR,
}: ApplyActionInput): ApplyActionResult => {
  const definition = BY_ACTION[action];

  if (!definition) {
    return { ok: false, record, error: `Unknown action "${action}".` };
  }
  if (!canApply(record, action)) {
    return {
      ok: false,
      record,
      error: `"${definition.label}" is not available from status ${record.status}.`,
    };
  }

  const trimmed = (note ?? '').trim();
  if (definition.requiresNote && trimmed.length === 0) {
    return {
      ok: false,
      record,
      error: `A review note is required to ${definition.label.toLowerCase()}.`,
    };
  }

  const now = new Date().toISOString();
  const event: InvestigationEvent = {
    id: nextEventId(),
    action,
    label: definition.timelineLabel,
    fromStatus: record.status,
    toStatus: definition.toStatus,
    at: now,
    simulationAt: simulationTimestamp(day, REVIEW_CLOCK_BY_ACTION[action]),
    day,
    investigator,
    note: trimmed.length > 0 ? trimmed : null,
  };

  const statusChanged = definition.toStatus !== record.status;

  return {
    ok: true,
    error: null,
    record: {
      ...record,
      status: definition.toStatus,
      acknowledged: record.acknowledged || action === 'acknowledge',
      assignedInvestigator:
        action === 'acknowledge' || action === 'begin-review'
          ? investigator
          : record.assignedInvestigator ?? investigator,
      lastStatusChangeAt: statusChanged ? now : record.lastStatusChangeAt,
      lastReviewedAt: now,
      history: [...record.history, event],
    },
  };
};

/** Review notes, newest last, derived from the history. */
export const getReviewNotes = (record: InvestigationRecord): InvestigationEvent[] =>
  record.history.filter((event) => event.note !== null);

/** Statuses from which a public-health report may be prepared. */
export const REPORTABLE_STATUSES: InvestigationStatus[] = [
  'UNDER REVIEW',
  'MONITORING',
  'ESCALATED',
  'CONFIRMED CONCERN',
];

export const canPrepareReport = (record: InvestigationRecord | undefined): boolean =>
  Boolean(record) && REPORTABLE_STATUSES.includes(record!.status);

/** Badge treatment per status. Kept out of the components so it stays one list. */
export const INVESTIGATION_STATUS_STYLES: Record<InvestigationStatus, string> = {
  NEW: 'bg-brand-light text-brand ring-1 ring-inset ring-brand/20',
  'UNDER REVIEW': 'bg-[#0369A1]/10 text-[#0369A1] ring-1 ring-inset ring-[#0369A1]/25',
  MONITORING: 'bg-severity-watch/15 text-[#9A7B0A] ring-1 ring-inset ring-severity-watch/40',
  ESCALATED: 'bg-severity-high/10 text-[#C2410C] ring-1 ring-inset ring-severity-high/30',
  DISMISSED: 'bg-canvas text-muted ring-1 ring-inset ring-hairline',
  'CONFIRMED CONCERN':
    'bg-severity-critical/10 text-severity-critical ring-1 ring-inset ring-severity-critical/30',
  CLOSED: 'bg-canvas text-muted ring-1 ring-inset ring-hairline',
};
