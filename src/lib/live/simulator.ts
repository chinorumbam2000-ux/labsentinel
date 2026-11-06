/**
 * The Live Surveillance simulator — deterministic, in the browser.
 *
 * A pure state machine (no timers in here; the React provider owns the one
 * interval). ``advance(minutes)`` moves the simulated clock forward; every
 * result due by then is delivered by its source, in delivery order, and goes
 * through the pipeline:
 *
 *   source message -> adapter (parse, validate, normalize)
 *     -> routing to every applicable profile (the shared registry)
 *     -> aggregation (per profile, facility and day)
 *     -> the engine (engine.ts) for the open day: "today so far"
 *     -> audit entries for the observation and for every score that moved.
 *
 * At 20:00 the day closes: its final calculation becomes the profile's
 * current signal (what the dashboard, map, facilities and analytics show)
 * and the next day opens. The same inputs always give the same sequence.
 */
import type { FacilityFeedHealth, HospitalId, LabObservation, OutbreakAlert, SimulationDay } from '../../types';
import { HOSPITALS, HOSPITAL_BY_ID } from '../../data/hospitals';
import { deriveFeedStatus } from '../../data/feedHealth';
import { detectionsFor } from '../alerts';
import { PROFILE_BY_ID, profilesForTest, type ProfileId } from '../profiles/registry';
import {
  ALL_DATES,
  DAY_CLOSE_MINUTE,
  DAY_OPEN_MINUTE,
  FIRST_LIVE_INDEX,
  LIVE_DATES,
  OPERATING_MINUTES,
  SOURCE_TYPE,
  lastScheduledContact,
  type LiveTestCode,
  type SourceType,
} from './dataset';
import { adapt, clock, encode, planResults, type NormalizedObservation, type PlannedResult } from './sources';
import { EMPTY, calculateDay, type FacilityDaily, type LiveSignal } from './engine';

/** Profiles the live feeds carry. Cholera and Gastrointestinal are not in them. */
export const LIVE_PROFILES: ProfileId[] = ['respiratory-viral-syndrome', 'influenza-a', 'covid-19', 'rsv'];
export const isLiveProfile = (id: ProfileId) => LIVE_PROFILES.includes(id);

export const LIVE_DAYS = LIVE_DATES.length;
export const END_MINUTE = LIVE_DAYS * OPERATING_MINUTES;

/** Operating minutes since live day 1 opened (negative for history). */
export const operatingMinute = (dayIndex: number, minute: number) =>
  (dayIndex - FIRST_LIVE_INDEX) * OPERATING_MINUTES + (minute - DAY_OPEN_MINUTE);

export const dayAndMinuteOf = (op: number) => {
  const offset = Math.min(Math.floor(op / OPERATING_MINUTES), LIVE_DAYS - 1);
  return { dayIndex: FIRST_LIVE_INDEX + offset, minute: DAY_OPEN_MINUTE + (op - offset * OPERATING_MINUTES) };
};

/** Any operating minute (history included) back to its day and clock time. */
export const fromOp = (op: number) => {
  const offset = Math.floor(op / OPERATING_MINUTES);
  return { dayIndex: FIRST_LIVE_INDEX + offset, minute: DAY_OPEN_MINUTE + (op - offset * OPERATING_MINUTES) };
};

export type AuditKind = 'observation' | 'unmapped' | 'rejected' | 'score' | 'close' | 'day' | 'source';

export interface ScoreDriver {
  key: string;
  label: string;
  before: number;
  after: number;
}

export interface AuditEntry {
  id: number;
  kind: AuditKind;
  /** Simulated date and clock, e.g. "Feb 10 · 09:14". */
  dayIndex: number;
  minute: number;
  op: number;
  text: string;
  hospitalId?: HospitalId;
  sourceType?: SourceType;
  profileId?: ProfileId;
  before?: number | null;
  after?: number | null;
  /** Component points that moved, and facility / area changes, from the engine's own results. */
  drivers?: ScoreDriver[];
  facilityChanges?: string[];
  manual?: boolean;
}

export interface FeedState {
  hospitalId: HospitalId;
  sourceType: SourceType;
  delivered: number;
  mapped: number;
  withSpecimen: number;
  failed: number;
  duplicates: number;
  latencyTotal: number;
  lastDeliveryOp: number | null;
  lastTest: string | null;
}

const AUDIT_LIMIT = 300;
const FACILITY_IDS: HospitalId[] = ['HOSP-A', 'HOSP-B', 'HOSP-C'];
const SHORT: Record<HospitalId, string> = {
  'HOSP-A': 'Worcester Central',
  'HOSP-B': 'Central Massachusetts Regional',
  'HOSP-C': 'Shrewsbury Community',
};

const PLANNED = planResults()
  .map((p) => ({ ...p, op: operatingMinute(p.dayIndex, p.deliveredMinute) }))
  .sort((a, b) => a.op - b.op || a.dayIndex - b.dayIndex || a.id.localeCompare(b.id));

const emptyCounts = (): Record<ProfileId, FacilityDaily> =>
  Object.fromEntries(
    LIVE_PROFILES.map((id) => [id, Object.fromEntries(FACILITY_IDS.map((h) => [h, {}]))]),
  ) as Record<ProfileId, FacilityDaily>;

/** The drivers of a score change: every component whose points moved, from the engine's own components. */
export const driversBetween = (before: LiveSignal | null, after: LiveSignal): ScoreDriver[] => {
  if (!after.score) return [];
  return after.score.components
    .map((c) => ({
      key: c.key,
      label: c.label,
      before: before?.score?.components.find((p) => p.key === c.key)?.points ?? 0,
      after: c.points,
    }))
    .filter((d) => d.before !== d.after);
};

const facilityChanges = (before: LiveSignal | null, after: LiveSignal): string[] => {
  const was = new Set(before?.affected ?? []);
  const now = new Set(after.affected);
  return [
    ...after.affected.filter((h) => !was.has(h)).map((h) => `${SHORT[h]} became affected`),
    ...[...was].filter((h) => !now.has(h)).map((h) => `${SHORT[h]} no longer affected`),
  ];
};

export class LiveSimulator {
  op = 0;
  private cursor = 0;
  private sequence = 0;
  counts = emptyCounts();
  /** Final signals of closed days, per profile and day index. */
  closed: Record<ProfileId, Record<number, LiveSignal>> = {} as Record<ProfileId, Record<number, LiveSignal>>;
  /** The open day's calculation so far ("today so far"). */
  provisional: Record<ProfileId, LiveSignal | null> = {} as Record<ProfileId, LiveSignal | null>;
  observations: LabObservation[] = [];
  normalized: NormalizedObservation[] = [];
  feeds: Record<HospitalId, FeedState> = {} as Record<HospitalId, FeedState>;
  audit: AuditEntry[] = [];
  openDay = FIRST_LIVE_INDEX;
  finished = false;
  /** Bumped on every change, so a React provider can re-render. */
  version = 0;
  private sourceStatus: Partial<Record<HospitalId, string>> = {};

  constructor() {
    this.reset();
  }

  reset(): void {
    this.op = 0;
    this.cursor = 0;
    this.sequence = 0;
    this.counts = emptyCounts();
    this.closed = Object.fromEntries(LIVE_PROFILES.map((id) => [id, {}])) as typeof this.closed;
    this.provisional = Object.fromEntries(LIVE_PROFILES.map((id) => [id, null])) as typeof this.provisional;
    this.observations = [];
    this.normalized = [];
    this.audit = [];
    this.finished = false;
    this.openDay = FIRST_LIVE_INDEX;
    this.feeds = Object.fromEntries(
      FACILITY_IDS.map((h) => [
        h,
        { hospitalId: h, sourceType: SOURCE_TYPE[h], delivered: 0, mapped: 0, withSpecimen: 0, failed: 0, duplicates: 0, latencyTotal: 0, lastDeliveryOp: null, lastTest: null },
      ]),
    ) as Record<HospitalId, FeedState>;
    // History: everything collected before the first live day, delivered at once.
    while (this.cursor < PLANNED.length && PLANNED[this.cursor].dayIndex < FIRST_LIVE_INDEX) {
      this.receive(PLANNED[this.cursor], { quiet: true });
      this.cursor += 1;
    }
    for (let day = 1; day < FIRST_LIVE_INDEX; day += 1) this.closeDay(day, { quiet: true });
    this.recalculateOpenDay({ quiet: true });
    this.sourceStatus = {};
    this.checkSources(true);
    this.version += 1;
  }

  /** Logs a source whose feed status changed (e.g. HEALTHY -> DELAYED), through the existing status rules. */
  private checkSources(quiet = false): void {
    this.feedHealth().forEach((f) => {
      const previous = this.sourceStatus[f.hospitalId];
      if (!quiet && previous && previous !== f.status) {
        this.log({
          kind: 'source',
          hospitalId: f.hospitalId,
          sourceType: SOURCE_TYPE[f.hospitalId],
          text: `${SHORT[f.hospitalId]} (${SOURCE_TYPE[f.hospitalId]}) feed ${previous} → ${f.status}. ${f.note}`,
        });
      }
      this.sourceStatus[f.hospitalId] = f.status;
    });
  }

  /** Moves the clock forward and delivers everything due by then. Returns true when anything changed. */
  advance(minutes: number): boolean {
    if (this.finished || minutes <= 0) return false;
    const target = Math.min(this.op + minutes, END_MINUTE);
    while (this.op < target) {
      const dayEnd = (this.openDay - FIRST_LIVE_INDEX + 1) * OPERATING_MINUTES;
      const step = Math.min(target, dayEnd);
      while (this.cursor < PLANNED.length && PLANNED[this.cursor].op <= step && PLANNED[this.cursor].dayIndex <= this.openDay) {
        this.receive(PLANNED[this.cursor]);
        this.cursor += 1;
      }
      this.op = step;
      this.checkSources();
      if (this.op >= dayEnd) {
        this.closeDay(this.openDay);
        if (this.openDay - FIRST_LIVE_INDEX + 1 >= LIVE_DAYS) {
          this.finished = true;
          this.log({ kind: 'day', text: 'Live simulation complete: the last surveillance day has closed.' });
          break;
        }
        this.openDay += 1;
        this.log({ kind: 'day', text: `Surveillance day ${ALL_DATES[this.openDay - 1]} opened.` });
        this.recalculateOpenDay({ quiet: true });
      }
    }
    this.version += 1;
    return true;
  }

  /**
   * A synthetic TEST observation, entered by hand: it is encoded in its
   * facility's format and processed exactly like any other. There is no way
   * to set a score — only data.
   */
  inject(hospitalId: HospitalId, code: LiveTestCode, positive: boolean): boolean {
    if (this.finished) return false;
    const { minute } = dayAndMinuteOf(this.op);
    const collected = Math.min(Math.max(minute, DAY_OPEN_MINUTE), DAY_CLOSE_MINUTE - 1);
    this.sequence += 1;
    const planned: PlannedResult & { manual: boolean } = {
      id: `TEST-${hospitalId}-${String(this.sequence).padStart(4, '0')}`,
      hospitalId,
      date: ALL_DATES[this.openDay - 1],
      dayIndex: this.openDay,
      code,
      positive,
      collectedMinute: collected,
      deliveredMinute: collected,
      withSpecimen: true,
      patientRef: `test-${String(this.sequence).padStart(4, '0')}`,
      manual: true,
    };
    this.receive(planned);
    this.version += 1;
    return true;
  }

  private receive(p: PlannedResult & { manual?: boolean }, options: { quiet?: boolean } = {}): void {
    const feed = this.feeds[p.hospitalId];
    const message = encode(p);
    const result = adapt(message);
    const deliveredOp = operatingMinute(p.dayIndex, p.deliveredMinute);
    feed.delivered += 1;
    feed.lastDeliveryOp = deliveredOp;
    feed.latencyTotal += (p.deliveredMinute - p.collectedMinute) * 60;
    if (!result.ok) {
      feed.failed += 1;
      if (!options.quiet) this.log({ kind: 'rejected', text: `Rejected from ${SHORT[p.hospitalId]} (${feed.sourceType}): ${result.reason}`, hospitalId: p.hospitalId, sourceType: feed.sourceType });
      return;
    }
    const obs = { ...result.observation, ...(p.manual ? { manual: true } : {}) };
    if (obs.specimenType) feed.withSpecimen += 1;
    feed.lastTest = obs.testName;
    this.normalized.push(obs);
    if (!obs.mapped) {
      if (!options.quiet) {
        this.log({ kind: 'unmapped', text: `Received from ${SHORT[p.hospitalId]} (${feed.sourceType}): ${obs.testName} — code ${obs.code} is not mapped to a surveillance test, so it reaches no profile.`, hospitalId: p.hospitalId, sourceType: feed.sourceType });
      }
      return;
    }
    feed.mapped += 1;
    this.sequence += 1;
    this.observations.push(this.toLabObservation(obs, p.dayIndex));

    // Routing: once to every applicable profile (each profile counts it once).
    const profiles = profilesForTest(obs.code).filter(isLiveProfile);
    profiles.forEach((id) => {
      const daily = this.counts[id][obs.hospitalId];
      const c = daily[p.dayIndex] ?? { ...EMPTY };
      daily[p.dayIndex] = {
        tests: c.tests + 1,
        positive: c.positive + (obs.result === 'Positive' ? 1 : 0),
        negative: c.negative + (obs.result === 'Negative' ? 1 : 0),
      };
    });
    if (options.quiet) return;
    this.log({
      kind: 'observation',
      text: `Observation received · ${SHORT[p.hospitalId]} · ${feed.sourceType} · ${obs.testName}${obs.manual ? ' · synthetic test observation' : ''}`,
      hospitalId: p.hospitalId,
      sourceType: feed.sourceType,
      manual: obs.manual,
    });
    profiles.forEach((id) => this.recalculate(id, p.dayIndex));
  }

  private toLabObservation(obs: NormalizedObservation, dayIndex: number): LabObservation {
    const h = HOSPITAL_BY_ID[obs.hospitalId];
    return {
      resourceType: 'Observation',
      id: obs.id,
      status: 'final',
      day: dayIndex as SimulationDay,
      hospitalId: h.id,
      hospitalName: h.name,
      vendor: h.vendor,
      syndrome: 'Respiratory Viral Syndrome',
      testName: obs.testName,
      loincCode: obs.code,
      result: obs.result,
      effectiveDateTime: `${obs.date}T${clock(obs.collectedMinute)}:00`,
      zipCode: h.zipCode,
      county: h.county,
      state: h.state,
      // A synthetic placeholder, as in the replay data; never shown in the activity stream.
      patientId: obs.manual ? `TEST-${String(this.sequence).padStart(5, '0')}` : `SYN-L${String(this.sequence).padStart(5, '0')}`,
      fhirStatus: 'Received',
      normalized: true,
    };
  }

  private previousOf(id: ProfileId, day: number): LiveSignal | null {
    return this.closed[id][day - 1] ?? null;
  }

  /** "Today so far" for one profile; logs a score entry when the composite or status moved. */
  private recalculate(id: ProfileId, day: number): void {
    if (day !== this.openDay) return;
    const before = this.provisional[id];
    const after = calculateDay(id, day, this.counts[id], this.previousOf(id, day));
    this.provisional[id] = after;
    const b = before?.score?.composite ?? null;
    const a = after.score?.composite ?? null;
    if (b !== a || before?.status !== after.status) {
      const name = PROFILE_BY_ID[id].displayName;
      this.log({
        kind: 'score',
        profileId: id,
        before: b,
        after: a,
        drivers: driversBetween(before, after),
        facilityChanges: facilityChanges(before, after),
        text:
          a === null
            ? `${name} today so far: no score (${after.status === 'NO_DATA' ? 'no results yet' : 'insufficient baseline'})`
            : `${name} today so far: score ${b === null ? '—' : b} → ${a}`,
      });
    }
  }

  private recalculateOpenDay(options: { quiet?: boolean } = {}): void {
    LIVE_PROFILES.forEach((id) => {
      if (options.quiet) this.provisional[id] = calculateDay(id, this.openDay, this.counts[id], this.previousOf(id, this.openDay));
      else this.recalculate(id, this.openDay);
    });
  }

  /** Closes a day: its final calculation becomes the profile's current signal. */
  private closeDay(day: number, options: { quiet?: boolean } = {}): void {
    LIVE_PROFILES.forEach((id) => {
      const before = this.closed[id][day - 1] ?? null;
      const after = calculateDay(id, day, this.counts[id], before);
      this.closed[id][day] = after;
      if (options.quiet) return;
      const name = PROFILE_BY_ID[id].displayName;
      this.log({
        kind: 'close',
        profileId: id,
        before: before?.score?.composite ?? null,
        after: after.score?.composite ?? null,
        drivers: driversBetween(before, after),
        facilityChanges: facilityChanges(before, after),
        text: `${name} — day ${ALL_DATES[day - 1]} closed: ${after.score ? `score ${before?.score?.composite ?? '—'} → ${after.score.composite} (${after.score.severity})` : 'no score'}`,
      });
    });
  }

  private log(entry: Omit<AuditEntry, 'id' | 'dayIndex' | 'minute' | 'op'>): void {
    const { dayIndex, minute } = dayAndMinuteOf(this.op);
    this.audit.push({ id: this.audit.length ? this.audit[this.audit.length - 1].id + 1 : 1, dayIndex, minute, op: this.op, ...entry });
    if (this.audit.length > AUDIT_LIMIT) this.audit.splice(0, this.audit.length - AUDIT_LIMIT);
  }

  /* ---------------------------------------------------------------------- *
   * Read-only views.
   * ---------------------------------------------------------------------- */

  /** The latest closed day: the day every analyst view shows. */
  get currentDay(): number {
    return this.finished ? this.openDay : this.openDay - 1;
  }

  /** Operating minutes since the source last made contact (a delivery, a batch or a poll). */
  minutesSince(h: HospitalId): number {
    const { dayIndex, minute } = dayAndMinuteOf(this.op);
    const today = lastScheduledContact(h, ALL_DATES[dayIndex - 1], minute);
    // Before today's first scheduled contact, the previous day's last one counts.
    const yesterday = today === null && dayIndex > 1 ? lastScheduledContact(h, ALL_DATES[dayIndex - 2], DAY_CLOSE_MINUTE) : null;
    const scheduled =
      today !== null ? operatingMinute(dayIndex, today) : yesterday !== null ? operatingMinute(dayIndex - 1, yesterday) : null;
    const last = Math.max(this.feeds[h].lastDeliveryOp ?? -Infinity, scheduled ?? -Infinity);
    return Number.isFinite(last) ? Math.max(0, this.op - last) : Number.POSITIVE_INFINITY;
  }

  /** Operating minutes since the source last delivered a result. */
  minutesSinceResult(h: HospitalId): number | null {
    const last = this.feeds[h].lastDeliveryOp;
    return last === null ? null : Math.max(0, this.op - last);
  }

  /** Feed health from the live state, through the existing status rules. */
  feedHealth(): FacilityFeedHealth[] {
    return HOSPITALS.map((hospital) => {
      const f = this.feeds[hospital.id];
      const minutes = this.minutesSince(hospital.id);
      const metrics = {
        minutesSinceLastEvent: Number.isFinite(minutes) ? minutes : 10_000,
        eventsReceived: f.delivered,
        terminologyMappedPercent: f.delivered ? (f.mapped / f.delivered) * 100 : 0,
        completenessPercent: f.delivered ? (f.withSpecimen / Math.max(f.delivered - f.failed, 1)) * 100 : 0,
        failedEvents: f.failed,
        duplicateEvents: f.duplicates,
      };
      const status = deriveFeedStatus(metrics);
      const last = f.lastDeliveryOp === null ? null : fromOp(f.lastDeliveryOp);
      return {
        hospitalId: hospital.id,
        facilityName: hospital.name,
        vendor: hospital.vendor,
        status,
        lastEventAt: last ? `${ALL_DATES[last.dayIndex - 1]}T${clock(last.minute)}:00` : '',
        ...metrics,
        latencySeconds: f.delivered ? Math.round(f.latencyTotal / f.delivered) : 0,
        isReporting: status !== 'OFFLINE',
        note:
          status === 'DELAYED'
            ? `No delivery for ${minutes} minutes from the simulated ${f.sourceType} source.`
            : status === 'HEALTHY'
              ? `Delivering normally through the simulated ${f.sourceType} source.`
              : status === 'DEGRADED'
                ? 'Deliveries are arriving, but quality checks are failing.'
                : 'No data currently available from this source.',
      };
    });
  }

  /** Alerts, from the closed days' signals, by the same rules as every other alert. */
  alerts(acknowledgements: Record<string, { day: number }> = {}): Array<OutbreakAlert & { profileId: ProfileId }> {
    return LIVE_PROFILES.flatMap((id) => {
      const days = Object.values(this.closed[id])
        .filter((s) => s.day >= FIRST_LIVE_INDEX && s.score)
        .sort((a, b) => a.day - b.day)
        .map((s) => ({ scenario: liveScenario(s), score: s.score! }));
      return detectionsFor(days, (kind, day) => `LIVE-${id.toUpperCase()}-${kind.toUpperCase()}-${ALL_DATES[day - 1]}`, () => false).map(
        (d) => {
          const ack = acknowledgements[d.id] ?? null;
          return {
            ...d,
            detectedAt: `${ALL_DATES[d.detectedDay - 1]}T${d.detectedAt.slice(11)}`,
            profileId: id,
            acknowledgement: ack as OutbreakAlert['acknowledgement'],
            status: ack ? 'Acknowledged' : d.detectedDay === this.currentDay ? 'New' : 'Active',
          } as OutbreakAlert & { profileId: ProfileId };
        },
      );
    });
  }
}

/** A live signal in the shape the existing views use for a day. */
export const liveScenario = (s: LiveSignal) => ({
  day: s.day as SimulationDay,
  stage: s.status === 'CALCULATED' ? (s.score!.severity === 'Low' ? 'Within expected range' : 'Active signal') : s.status === 'NO_DATA' ? 'No data' : 'Insufficient baseline',
  description: '',
  simulationDate: ALL_DATES[s.day - 1],
  totalTests: s.current.tests,
  totalPositives: s.current.positive,
  positivityRate: s.positivityRate,
  affectedHospitals: s.affected,
  affectedZipCodes: s.affectedAreas,
  persistenceDays: s.persistenceDays,
});

export const shortFacilityName = (h: HospitalId) => SHORT[h];
