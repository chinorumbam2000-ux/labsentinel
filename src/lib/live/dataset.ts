/**
 * The Live Surveillance dataset: what the three simulated source feeds send.
 *
 * SYNTHETIC DATA ONLY. Integer counts of tests and positive results per
 * facility, per test, per day — authored once, here, as literals (no random
 * values at runtime). Nothing below is a score: every score the app shows in
 * Live Surveillance is calculated from the observations these counts expand
 * into, by the same engine rules the backend uses.
 *
 * Calendar (America/New_York, before the March daylight-saving change):
 *   - 7 days of HISTORY, Feb 1-7 2026, loaded at once when the simulation
 *     starts. They exist so the 7-day rolling baseline is established before
 *     the first live day; they are not animated.
 *   - 10 LIVE days, Feb 8-17 2026, streamed observation by observation.
 *
 * The story the counts tell (not a script of scores): influenza A rises first
 * at Worcester Central and spreads to the other two facilities, then fades;
 * SARS-CoV-2 rises later, led by Central Massachusetts Regional; RSV stays
 * flat. Shrewsbury Community's feed has an outage on Feb 13 (10:00-13:30),
 * after which its backlog arrives at once.
 */
import type { HospitalId } from '../../types';

export type LiveTestCode = '92142-9' | '94500-6' | '85479-4';
export type SourceType = 'FHIR R4' | 'HL7 v2' | 'LIS/API';

export const HISTORY_DATES = ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-02-07'];
export const LIVE_DATES = ['2026-02-08', '2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13', '2026-02-14', '2026-02-15', '2026-02-16', '2026-02-17'];
/** Every surveillance date, oldest first. Day index = position + 1. */
export const ALL_DATES = [...HISTORY_DATES, ...LIVE_DATES];
export const FIRST_LIVE_INDEX = HISTORY_DATES.length + 1;

/** The time zone the engine uses; February is UTC-5 throughout. */
export const UTC_OFFSET = '-05:00';

/** Each facility is represented by a different simulated connection style. */
export const SOURCE_TYPE: Record<HospitalId, SourceType> = {
  'HOSP-A': 'FHIR R4',
  'HOSP-B': 'HL7 v2',
  'HOSP-C': 'LIS/API',
};

export const TEST_NAMES: Record<LiveTestCode, string> = {
  '92142-9': 'Influenza A RNA',
  '94500-6': 'SARS-CoV-2 RNA',
  '85479-4': 'RSV RNA',
};

/** [tests, positives] for each of the 17 days (7 history, then 10 live). */
type Series = Array<[number, number]>;

export const COUNTS: Record<HospitalId, Record<LiveTestCode, Series>> = {
  'HOSP-A': {
    '92142-9': [[15, 1], [14, 1], [16, 1], [15, 2], [14, 1], [16, 1], [15, 1], [15, 1], [16, 1], [20, 4], [24, 6], [27, 8], [29, 9], [28, 7], [24, 5], [20, 3], [18, 2]],
    '94500-6': [[15, 1], [15, 1], [14, 1], [16, 1], [15, 1], [14, 1], [16, 1], [15, 1], [15, 1], [16, 1], [16, 1], [17, 2], [17, 3], [20, 5], [24, 8], [27, 10], [27, 9]],
    '85479-4': [[14, 1], [13, 1], [14, 1], [14, 0], [15, 1], [13, 1], [14, 1], [14, 1], [14, 1], [14, 1], [15, 1], [14, 1], [15, 1], [14, 1], [15, 1], [14, 1], [15, 1]],
  },
  'HOSP-B': {
    '92142-9': [[13, 1], [12, 1], [13, 1], [13, 1], [12, 1], [14, 1], [13, 1], [13, 1], [13, 1], [14, 1], [16, 3], [19, 5], [21, 6], [20, 5], [18, 3], [17, 2], [15, 1]],
    '94500-6': [[13, 1], [13, 1], [12, 1], [13, 1], [14, 1], [12, 1], [13, 1], [13, 1], [13, 1], [13, 1], [14, 1], [15, 3], [18, 5], [22, 7], [26, 9], [28, 11], [27, 10]],
    '85479-4': [[12, 1], [12, 0], [12, 1], [13, 1], [12, 1], [12, 1], [11, 1], [12, 1], [12, 1], [12, 1], [12, 1], [13, 1], [12, 1], [12, 1], [13, 1], [12, 1], [12, 1]],
  },
  'HOSP-C': {
    '92142-9': [[11, 1], [10, 1], [11, 0], [11, 1], [10, 1], [11, 1], [11, 1], [11, 1], [11, 1], [11, 1], [12, 1], [13, 3], [14, 3], [13, 2], [12, 2], [11, 1], [11, 1]],
    '94500-6': [[10, 1], [10, 0], [11, 1], [10, 1], [10, 1], [11, 1], [10, 1], [10, 1], [10, 1], [10, 1], [10, 1], [11, 1], [12, 2], [12, 3], [14, 5], [15, 6], [15, 5]],
    '85479-4': [[10, 0], [10, 1], [10, 1], [11, 1], [10, 0], [10, 1], [10, 1], [10, 0], [10, 1], [10, 1], [10, 1], [10, 1], [10, 0], [11, 1], [10, 1], [10, 1], [10, 1]],
  },
};

/**
 * Central Massachusetts Regional's HL7 v2 feed also sends one result a day
 * under a valid LOINC code that Signal does not map to a surveillance test.
 * It is received, validated and counted for terminology quality — and routed
 * to no profile.
 */
export const UNMAPPED_CODE = '94309-2';
export const UNMAPPED_NAME = 'SARS-CoV-2 RNA (specimen unspecified)';

/** Collection window each day: 07:00 to 19:00 local. */
export const COLLECTION_START_MINUTE = 7 * 60;
export const COLLECTION_SPAN_MINUTES = 12 * 60;

/**
 * The simulation clock runs 07:00-19:30 each day (operating hours) and skips
 * the night, so a feed's quiet night is not read as an outage. Every result
 * is delivered before 19:30, when the day closes.
 */
export const DAY_OPEN_MINUTE = 7 * 60;
export const DAY_CLOSE_MINUTE = 19 * 60 + 30;
export const OPERATING_MINUTES = DAY_CLOSE_MINUTE - DAY_OPEN_MINUTE;

/** Shrewsbury Community's outage on Feb 13: deliveries resume at 13:35. */
export const OUTAGE = { hospitalId: 'HOSP-C' as HospitalId, date: '2026-02-13', from: 10 * 60, to: 13 * 60 + 30, resume: 13 * 60 + 35 };

/**
 * Delivery timing — the feeds' existing personalities:
 *  - Worcester Central (FHIR R4): each result pushed 2-6 minutes after collection;
 *  - Central Massachusetts Regional (HL7 v2): results batched every 15 minutes;
 *  - Shrewsbury Community (LIS/API): polled every 20 minutes, and one result
 *    in eight arrives without its specimen type.
 */
export const deliveryMinute = (hospitalId: HospitalId, date: string, collected: number, index: number): number => {
  if (hospitalId === 'HOSP-A') return collected + 2 + ((index * 3) % 5);
  if (hospitalId === 'HOSP-B') return Math.floor(collected / 15) * 15 + 15 + 3;
  const polled = Math.floor(collected / 20) * 20 + 20 + 5;
  if (date === OUTAGE.date && polled > OUTAGE.from && polled <= OUTAGE.resume) return OUTAGE.resume;
  return polled;
};

export const missingSpecimen = (hospitalId: HospitalId, index: number): boolean =>
  hospitalId === 'HOSP-C' && index % 8 === 7;

/**
 * When a source makes contact even with nothing to deliver: the HL7 v2
 * interface sends its batch every 15 minutes (at :03, :18, :33, :48), the
 * LIS/API is polled every 20 minutes (at :05, :25, :45) — except during the
 * outage. The FHIR R4 source pushes results and makes no other contact.
 * Feed freshness is the time since the last contact.
 */
export const lastScheduledContact = (hospitalId: HospitalId, date: string, minute: number): number | null => {
  if (hospitalId === 'HOSP-A') return null;
  const [period, offset] = hospitalId === 'HOSP-B' ? [15, 3] : [20, 5];
  let m = Math.floor((minute - offset) / period) * period + offset;
  while (m >= DAY_OPEN_MINUTE) {
    const inOutage = hospitalId === OUTAGE.hospitalId && date === OUTAGE.date && m > OUTAGE.from && m < OUTAGE.resume;
    if (!inOutage) return m;
    m -= period;
  }
  return null;
};
