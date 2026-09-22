/**
 * Session persistence for the simulation.
 *
 * The selected day and the user's acknowledgements survive a page refresh via
 * sessionStorage. Autoplay is deliberately never persisted — a refresh always
 * comes back paused.
 *
 * Everything read back is validated. Malformed, tampered or stale storage is
 * discarded and the prototype falls back to Day 1 with no acknowledgements,
 * rather than crashing or restoring nonsense.
 */
import type {
  AcknowledgementRecord,
  InvestigationRecord,
  ReportRecord,
  SimulationDay,
} from '../types';
import { FIRST_DAY, isValidDay } from '../data/simulation';

export const STORAGE_KEY = 'labsentinel.simulation.v1';

export interface PersistedSession {
  day: SimulationDay;
  acknowledgements: Record<string, AcknowledgementRecord>;
  /** Human review state, per alert. Browser-only, never transmitted. */
  investigations: Record<string, InvestigationRecord>;
  /** Simulated public-health reports. Browser-only, never transmitted. */
  reports: ReportRecord[];
}

export const DEFAULT_SESSION: PersistedSession = {
  day: FIRST_DAY,
  acknowledgements: {},
  investigations: {},
  reports: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIsoLike = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;

/** An acknowledgement is only restored if every field survives validation. */
const parseAcknowledgement = (value: unknown): AcknowledgementRecord | null => {
  if (!isRecord(value)) return null;
  if (!isValidDay(value.day)) return null;
  if (!isIsoLike(value.simulationTime)) return null;
  if (!isIsoLike(value.realTime)) return null;
  return {
    day: value.day,
    simulationTime: value.simulationTime,
    realTime: value.realTime,
  };
};

const parseAcknowledgements = (
  value: unknown,
): Record<string, AcknowledgementRecord> => {
  if (!isRecord(value)) return {};
  const result: Record<string, AcknowledgementRecord> = {};
  Object.entries(value).forEach(([id, entry]) => {
    // Ignore unknown-shaped entries rather than failing the whole restore.
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) return;
    const parsed = parseAcknowledgement(entry);
    if (parsed) result[id] = parsed;
  });
  return result;
};

const INVESTIGATION_STATUSES = [
  'NEW',
  'UNDER REVIEW',
  'MONITORING',
  'ESCALATED',
  'DISMISSED',
  'CONFIRMED CONCERN',
  'CLOSED',
];

const REPORT_STATUSES = [
  'DRAFT',
  'READY FOR REVIEW',
  'APPROVED',
  'SIMULATED SUBMISSION',
  'FAILED',
];

/**
 * Investigation and report state are restored defensively: anything whose
 * shape we do not recognise is dropped rather than trusted, so a tampered or
 * stale store cannot put the workflow into an impossible status.
 */
const parseInvestigations = (
  value: unknown,
): Record<string, InvestigationRecord> => {
  if (!isRecord(value)) return {};
  const result: Record<string, InvestigationRecord> = {};

  Object.entries(value).forEach(([id, entry]) => {
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) return;
    if (!isRecord(entry)) return;
    if (typeof entry.status !== 'string') return;
    if (!INVESTIGATION_STATUSES.includes(entry.status)) return;
    if (!Array.isArray(entry.history)) return;

    const history = entry.history.filter(
      (event): event is InvestigationRecord['history'][number] =>
        isRecord(event) &&
        typeof event.id === 'string' &&
        typeof event.label === 'string' &&
        typeof event.toStatus === 'string' &&
        INVESTIGATION_STATUSES.includes(event.toStatus),
    );
    if (history.length === 0) return;

    result[id] = {
      alertId: typeof entry.alertId === 'string' ? entry.alertId : id,
      status: entry.status as InvestigationRecord['status'],
      assignedInvestigator:
        typeof entry.assignedInvestigator === 'string' ? entry.assignedInvestigator : null,
      acknowledged: entry.acknowledged === true,
      lastStatusChangeAt:
        typeof entry.lastStatusChangeAt === 'string' ? entry.lastStatusChangeAt : null,
      lastReviewedAt:
        typeof entry.lastReviewedAt === 'string' ? entry.lastReviewedAt : null,
      history,
    };
  });

  return result;
};

const parseReports = (value: unknown): ReportRecord[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ReportRecord =>
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      typeof entry.alertId === 'string' &&
      typeof entry.status === 'string' &&
      REPORT_STATUSES.includes(entry.status) &&
      isRecord(entry.snapshot) &&
      Array.isArray(entry.history),
  );
};

/** Safe in private-browsing modes and wherever storage is blocked. */
const safeStorage = (): Storage | null => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const loadSession = (): PersistedSession => {
  const storage = safeStorage();
  if (!storage) return { ...DEFAULT_SESSION };

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SESSION };

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      storage.removeItem(STORAGE_KEY);
      return { ...DEFAULT_SESSION };
    }


    return {
      day: isValidDay(parsed.day) ? parsed.day : DEFAULT_SESSION.day,
      acknowledgements: parseAcknowledgements(parsed.acknowledgements),
      investigations: parseInvestigations(parsed.investigations),
      reports: parseReports(parsed.reports),
    };
  } catch {
    // Corrupt JSON, a quota error, or a blocked store: start clean.
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing further we can do */
    }
    return { ...DEFAULT_SESSION };
  }
};

export const saveSession = (session: PersistedSession): void => {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage full or unavailable — the prototype still works in memory */
  }
};

export const clearSession = (): void => {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing further we can do */
  }
};
