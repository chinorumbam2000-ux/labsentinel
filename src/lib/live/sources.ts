/**
 * The three simulated source feeds and their adapters.
 *
 * Each facility sends its results in a different SIMULATED connection style:
 *   Worcester Central Medical Center         FHIR R4 Observation resources
 *   Central Massachusetts Regional Hospital  HL7 v2 ORU^R01 messages
 *   Shrewsbury Community Medical Center      a LIS/API-style JSON feed
 * These are synthetic formats built for the portfolio; they imply no real
 * EHR integration, vendor connection or partnership.
 *
 * Every message goes through the same steps as the backend pipeline:
 * parse (per format) -> validate -> normalize (LOINC code, result word or
 * SNOMED CT code -> Positive/Negative) -> a normalized observation. Routing
 * to surveillance profiles happens next, through the shared registry.
 */
import type { HospitalId } from '../../types';
import { HOSPITAL_BY_ID } from '../../data/hospitals';
import { TEST_BY_CODE } from '../profiles/registry';
import {
  ALL_DATES,
  COLLECTION_SPAN_MINUTES,
  COLLECTION_START_MINUTE,
  COUNTS,
  OUTAGE,
  SOURCE_TYPE,
  TEST_NAMES,
  UNMAPPED_CODE,
  UNMAPPED_NAME,
  UTC_OFFSET,
  deliveryMinute,
  missingSpecimen,
  type LiveTestCode,
  type SourceType,
} from './dataset';

const LOINC_SYSTEM = 'http://loinc.org';
const SNOMED_SYSTEM = 'http://snomed.info/sct';
const FACILITY_SYSTEM = 'urn:labsentinel:facility-code';
const POSITIVE = { code: '10828004', text: 'Positive' };
const NEGATIVE = { code: '260385009', text: 'Negative' };
const SNOMED_RESULTS: Record<string, 'Positive' | 'Negative'> = {
  '10828004': 'Positive',
  '260373001': 'Positive',
  '260385009': 'Negative',
  '260415000': 'Negative',
};
const RESULT_WORDS: Record<string, 'Positive' | 'Negative'> = {
  positive: 'Positive',
  detected: 'Positive',
  negative: 'Negative',
  'not detected': 'Negative',
};
const SPECIMEN = { code: '258500001', text: 'Nasopharyngeal swab' };

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const clock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

/** LOINC's mod-10 check digit, as the backend validator computes it. */
export const isValidLoinc = (code: string): boolean => {
  const match = /^(\d{1,7})-(\d)$/.exec(code);
  if (!match) return false;
  let total = 0;
  [...match[1]].reverse().forEach((char, position) => {
    let digit = Number(char);
    if (position % 2 === 0) digit *= 2;
    total += Math.floor(digit / 10) + (digit % 10);
  });
  return (10 - (total % 10)) % 10 === Number(match[2]);
};

/* ------------------------------------------------------------------------ *
 * The planned feed: one entry per result, in the order it is collected.
 * ------------------------------------------------------------------------ */

export interface PlannedResult {
  id: string;
  hospitalId: HospitalId;
  date: string;
  dayIndex: number;
  code: string;
  positive: boolean;
  collectedMinute: number;
  deliveredMinute: number;
  withSpecimen: boolean;
  patientRef: string;
}

const isPositiveAt = (index: number, positives: number, total: number) =>
  total > 0 && positives > 0 && Math.floor(((index + 1) * positives) / total) > Math.floor((index * positives) / total);

const CODES: LiveTestCode[] = ['92142-9', '94500-6', '85479-4'];

/** Every result the feeds will send, for every date, deterministic. */
export const planResults = (): PlannedResult[] => {
  const out: PlannedResult[] = [];
  let sequence = 0;
  ALL_DATES.forEach((date, d) => {
    (Object.keys(COUNTS) as HospitalId[]).forEach((hospitalId) => {
      // Results of the three tests interleaved, positives spread evenly within each test.
      const perTest = CODES.map((code) => {
        const [tests, positives] = COUNTS[hospitalId][code][d];
        return Array.from({ length: tests }, (_, i) => ({ code: code as string, positive: isPositiveAt(i, positives, tests) }));
      });
      const draft: Array<{ code: string; positive: boolean }> = [];
      for (let i = 0; perTest.some((list) => i < list.length); i += 1) perTest.forEach((list) => i < list.length && draft.push(list[i]));
      if (hospitalId === 'HOSP-B') draft.splice(Math.floor(draft.length / 2), 0, { code: UNMAPPED_CODE, positive: false });
      draft.forEach((item, index) => {
        sequence += 1;
        const collected = COLLECTION_START_MINUTE + Math.round((index * COLLECTION_SPAN_MINUTES) / Math.max(draft.length - 1, 1));
        out.push({
          id: `LIVE-${hospitalId}-${date.replace(/-/g, '')}-${pad(index, 3)}`,
          hospitalId,
          date,
          dayIndex: d + 1,
          code: item.code,
          positive: item.positive,
          collectedMinute: collected,
          deliveredMinute: deliveryMinute(hospitalId, date, collected, index),
          withSpecimen: !missingSpecimen(hospitalId, index),
          patientRef: `live-${pad(sequence, 5)}`,
        });
      });
    });
  });
  return out;
};

/* ------------------------------------------------------------------------ *
 * Message formats (what each simulated source sends).
 * ------------------------------------------------------------------------ */

export type RawMessage =
  | { sourceType: 'FHIR R4'; body: Record<string, unknown> }
  | { sourceType: 'HL7 v2'; body: string }
  | { sourceType: 'LIS/API'; body: Record<string, unknown> };

const testName = (code: string) => (code === UNMAPPED_CODE ? UNMAPPED_NAME : TEST_NAMES[code as LiveTestCode] ?? code);
const stamp = (date: string, minute: number) => `${date.replace(/-/g, '')}${pad(Math.floor(minute / 60))}${pad(minute % 60)}`;

export const encode = (r: PlannedResult): RawMessage => {
  const result = r.positive ? POSITIVE : NEGATIVE;
  const source = SOURCE_TYPE[r.hospitalId];
  if (source === 'FHIR R4') {
    return {
      sourceType: source,
      body: {
        resourceType: 'Observation',
        id: r.id.toLowerCase(),
        status: 'final',
        code: { coding: [{ system: LOINC_SYSTEM, code: r.code, display: testName(r.code) }] },
        subject: { reference: `Patient/${r.patientRef}` },
        effectiveDateTime: `${r.date}T${clock(r.collectedMinute)}:00${UTC_OFFSET}`,
        performer: [{ identifier: { system: FACILITY_SYSTEM, value: r.hospitalId } }],
        valueCodeableConcept: { coding: [{ system: SNOMED_SYSTEM, code: result.code, display: result.text }] },
        ...(r.withSpecimen ? { specimen: { display: SPECIMEN.text } } : {}),
      },
    };
  }
  if (source === 'HL7 v2') {
    return {
      sourceType: source,
      body: [
        `MSH|^~\\&|CMRH-LIS|${r.hospitalId}|SIGNAL|PROBESYQ|${stamp(r.date, r.deliveredMinute)}||ORU^R01|${r.id}|P|2.5.1`,
        `PID|1||${r.patientRef}^^^${r.hospitalId}`,
        `OBR|1|||${r.code}^${testName(r.code)}^LN`,
        `OBX|1|CWE|${r.code}^${testName(r.code)}^LN||${result.code}^${result.text}^SCT||||||F|||${stamp(r.date, r.collectedMinute)}`,
        ...(r.withSpecimen ? [`SPM|1|||${SPECIMEN.code}^${SPECIMEN.text}^SCT`] : []),
      ].join('\r'),
    };
  }
  return {
    sourceType: source,
    body: {
      site: r.hospitalId,
      accession: r.id,
      test: { code: r.code, system: 'LN' },
      result: r.positive ? 'DETECTED' : 'NOT DETECTED',
      collected: `${r.date} ${clock(r.collectedMinute)}`,
      specimen: r.withSpecimen ? 'NP swab' : null,
      patient: r.patientRef,
    },
  };
};

/* ------------------------------------------------------------------------ *
 * Adapters: parse -> validate -> normalize.
 * ------------------------------------------------------------------------ */

export interface NormalizedObservation {
  id: string;
  sourceType: SourceType;
  hospitalId: HospitalId;
  date: string;
  collectedMinute: number;
  /** ISO local time with offset, as FHIR would carry it. */
  effectiveDateTime: string;
  code: string;
  testName: string;
  /** The code maps to a Signal test (and so to surveillance profiles). */
  mapped: boolean;
  result: 'Positive' | 'Negative';
  specimenType: string | null;
  patientRef: string;
  /** A synthetic test observation entered by hand on the Live Surveillance page. */
  manual?: boolean;
}

export type AdapterResult = { ok: true; observation: NormalizedObservation } | { ok: false; reason: string };

const finish = (fields: {
  id: string;
  sourceType: SourceType;
  hospitalId: string | undefined;
  code: string | undefined;
  result: 'Positive' | 'Negative' | undefined;
  date: string | undefined;
  minute: number | undefined;
  specimenType: string | null;
  patientRef: string | undefined;
}): AdapterResult => {
  const { hospitalId, code, result, date, minute } = fields;
  if (!hospitalId || !(hospitalId in HOSPITAL_BY_ID)) return { ok: false, reason: 'Unknown or missing facility' };
  if (!code || !isValidLoinc(code)) return { ok: false, reason: 'Missing or malformed LOINC code' };
  if (!result) return { ok: false, reason: 'Result is not a recognised qualitative value' };
  if (!date || minute === undefined || Number.isNaN(minute)) return { ok: false, reason: 'Missing collection time' };
  const test = TEST_BY_CODE[code];
  return {
    ok: true,
    observation: {
      id: fields.id,
      sourceType: fields.sourceType,
      hospitalId: hospitalId as HospitalId,
      date,
      collectedMinute: minute,
      effectiveDateTime: `${date}T${clock(minute)}:00${UTC_OFFSET}`,
      code,
      testName: test?.name ?? testName(code),
      mapped: Boolean(test && test.system === LOINC_SYSTEM),
      result,
      specimenType: fields.specimenType,
      patientRef: fields.patientRef ?? '',
    },
  };
};

const parseFhir = (body: Record<string, unknown>): AdapterResult => {
  const coding = (body.code as { coding?: Array<{ system?: string; code?: string }> } | undefined)?.coding ?? [];
  const loinc = coding.find((c) => c.system === LOINC_SYSTEM)?.code;
  const value = (body.valueCodeableConcept as { coding?: Array<{ system?: string; code?: string }> } | undefined)?.coding ?? [];
  const snomed = value.find((c) => c.system === SNOMED_SYSTEM)?.code;
  const performer = (body.performer as Array<{ identifier?: { system?: string; value?: string } }> | undefined) ?? [];
  const facility = performer.find((p) => p.identifier?.system === FACILITY_SYSTEM)?.identifier?.value;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(body.effectiveDateTime ?? ''));
  if (body.resourceType !== 'Observation' || body.status !== 'final') return { ok: false, reason: 'Not a final Observation' };
  return finish({
    id: String(body.id ?? ''),
    sourceType: 'FHIR R4',
    hospitalId: facility,
    code: loinc,
    result: snomed ? SNOMED_RESULTS[snomed] : undefined,
    date: match?.[1],
    minute: match ? Number(match[2]) * 60 + Number(match[3]) : undefined,
    specimenType: (body.specimen as { display?: string } | undefined)?.display ?? null,
    patientRef: String((body.subject as { reference?: string } | undefined)?.reference ?? '').replace('Patient/', ''),
  });
};

const parseHl7 = (body: string): AdapterResult => {
  const segments = Object.fromEntries(body.split('\r').map((s) => [s.slice(0, 3), s.split('|')]));
  const msh = segments.MSH;
  const obx = segments.OBX;
  if (!msh || !obx || msh[8] !== 'ORU^R01') return { ok: false, reason: 'Not an ORU^R01 result message' };
  if (obx[11] !== 'F') return { ok: false, reason: 'Result is not final' };
  const [code, , system] = (obx[3] ?? '').split('^');
  const [resultCode] = (obx[5] ?? '').split('^');
  const ts = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(obx[14] ?? '');
  return finish({
    id: msh[9],
    sourceType: 'HL7 v2',
    hospitalId: msh[3],
    code: system === 'LN' ? code : undefined,
    result: SNOMED_RESULTS[resultCode],
    date: ts ? `${ts[1]}-${ts[2]}-${ts[3]}` : undefined,
    minute: ts ? Number(ts[4]) * 60 + Number(ts[5]) : undefined,
    specimenType: segments.SPM ? (segments.SPM[4] ?? '').split('^')[1] ?? null : null,
    patientRef: (segments.PID?.[3] ?? '').split('^')[0],
  });
};

const parseLis = (body: Record<string, unknown>): AdapterResult => {
  const test = body.test as { code?: string; system?: string } | undefined;
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(String(body.collected ?? ''));
  const word = String(body.result ?? '').trim().toLowerCase();
  return finish({
    id: String(body.accession ?? ''),
    sourceType: 'LIS/API',
    hospitalId: body.site as string | undefined,
    code: test?.system === 'LN' ? test.code : undefined,
    result: RESULT_WORDS[word],
    date: match?.[1],
    minute: match ? Number(match[2]) * 60 + Number(match[3]) : undefined,
    specimenType: body.specimen ? String(body.specimen) : null,
    patientRef: String(body.patient ?? ''),
  });
};

export const adapt = (message: RawMessage): AdapterResult => {
  if (message.sourceType === 'FHIR R4') return parseFhir(message.body);
  if (message.sourceType === 'HL7 v2') return parseHl7(message.body);
  return parseLis(message.body);
};

/** Feed outage window, for the source panel's explanation. */
export { OUTAGE };
