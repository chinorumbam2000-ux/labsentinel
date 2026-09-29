/**
 * Presentation logic for the FHIR ingestion demonstration.
 *
 * Every stage state here is derived from the backend's actual ingestion
 * response. A stage is only shown as succeeded when the response proves it
 * did; anything after a failure is shown as not reached.
 *
 * DEVELOPMENT DEMONSTRATION — synthetic FHIR data only.
 */
import type { IngestionOutcome, IngestionReply } from '../data-access/fhirIngestion';

export type StageKey = 'received' | 'validation' | 'facility' | 'normalization' | 'persistence' | 'record';
export type StageStatus = 'pending' | 'success' | 'warning' | 'failed' | 'skipped';

export interface PipelineStage {
  key: StageKey;
  label: string;
  status: StageStatus;
  detail: string;
}

/** The backend's pipeline order (app/services/fhir_ingestion.py). */
export const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: 'received', label: 'FHIR R4 resource' },
  { key: 'validation', label: 'Validation' },
  { key: 'facility', label: 'Facility resolution' },
  { key: 'normalization', label: 'LOINC / result normalization' },
  { key: 'persistence', label: 'PostgreSQL' },
  { key: 'record', label: 'LabSentinel observation' },
];

/** The stage each rejecting issue code belongs to. */
export const ISSUE_STAGE: Record<string, StageKey> = {
  INVALID_FHIR: 'validation',
  UNSUPPORTED_RESOURCE: 'validation',
  NON_FINAL_STATUS: 'validation',
  NON_LAB_OBSERVATION: 'validation',
  INVALID_LOINC: 'validation',
  MISSING_EFFECTIVE_TIME: 'validation',
  INVALID_EFFECTIVE_TIME: 'validation',
  DEMO_PERIOD_RESERVED: 'validation',
  UNRESOLVED_FACILITY: 'facility',
  INVALID_RESULT: 'normalization',
  MISSING_IDENTIFIER: 'persistence',
};

/** Plain-language explanations for the backend's issue codes. */
export const ISSUE_EXPLANATIONS: Record<string, string> = {
  INVALID_FHIR: 'The content is not valid FHIR R4 JSON.',
  UNSUPPORTED_RESOURCE: 'LabSentinel does not ingest this resource type.',
  NON_FINAL_STATUS: 'Only final, amended or corrected results are ingested.',
  NON_LAB_OBSERVATION: 'This Observation does not meet LabSentinel laboratory-surveillance criteria.',
  INVALID_LOINC: 'The LOINC coding is missing, conflicting or malformed.',
  UNMAPPED_LOINC: 'A valid LOINC code with no LabSentinel mapping: stored, but no syndrome is assigned.',
  UNRESOLVED_FACILITY: 'The performing organization does not map to a LabSentinel facility.',
  INVALID_RESULT: 'The result value is missing or cannot be interpreted for this test.',
  MISSING_EFFECTIVE_TIME: 'The Observation has no effective time.',
  INVALID_EFFECTIVE_TIME: 'A full date-time with a timezone offset is required.',
  DEMO_PERIOD_RESERVED: 'The frozen five-day demonstration period cannot be altered.',
  MISSING_IDENTIFIER: 'Without an identifier or id a resubmission could not be recognized.',
  UNRESOLVED_REFERENCE: 'A referenced resource is not in this submission.',
  GEOGRAPHY_MISMATCH: "A Location's postal code differs from the facility's surveillance area.",
  DUPLICATE: 'Already ingested — nothing was written.',
};

const stage = (key: StageKey, status: StageStatus, detail: string): PipelineStage => ({
  key,
  label: STAGES.find((item) => item.key === key)!.label,
  status,
  detail,
});

/** Stages before a request has been sent. */
export const pendingPipeline = (): PipelineStage[] =>
  STAGES.map(({ key }) => stage(key, 'pending', 'Waiting'));

/**
 * The pipeline for one Observation's outcome, or for a request rejected as a
 * whole (no outcome: e.g. malformed JSON).
 */
export const pipelineFor = (reply: IngestionReply, outcome: IngestionOutcome | null): PipelineStage[] => {
  if (outcome === null) {
    const issue = reply.response.errors[0];
    return [
      stage('received', 'failed', issue ? `${issue.code}: ${issue.message}` : `HTTP ${reply.status}`),
      ...STAGES.slice(1).map(({ key }) => stage(key, 'skipped', 'Stopped at an earlier stage')),
    ];
  }

  const unmapped = outcome.warnings.includes('UNMAPPED_LOINC');
  const successes: Record<StageKey, PipelineStage> = {
    received: stage('received', 'success', 'Parsed and validated as a FHIR R4 Observation'),
    validation: stage('validation', 'success', 'Final laboratory result, valid LOINC, time with offset'),
    facility: stage(
      'facility',
      'success',
      outcome.facility_code
        ? `${outcome.facility_code} — ${outcome.facility_resolution ?? 'resolved'}`
        : 'Resolved',
    ),
    normalization: unmapped
      ? stage('normalization', 'warning', 'LOINC not mapped: stored without a syndrome')
      : stage('normalization', 'success', 'Test, syndrome and result normalized'),
    persistence:
      outcome.outcome === 'duplicate'
        ? stage('persistence', 'warning', 'Already stored: same source system and source ID — nothing written')
        : stage('persistence', 'success', `Stored as observation ${outcome.observation_id}`),
    record:
      outcome.outcome === 'duplicate'
        ? stage('record', 'success', `Existing observation ${outcome.observation_id}`)
        : stage('record', 'success', `Observation ${outcome.observation_id} available through the API`),
  };

  if (outcome.outcome !== 'rejected') return STAGES.map(({ key }) => successes[key]);

  const failedAt = ISSUE_STAGE[outcome.issue_code ?? ''] ?? 'validation';
  const failedIndex = STAGES.findIndex(({ key }) => key === failedAt);
  // A resource that failed structural validation was never parsed.
  const parseFailed = outcome.issue_code === 'INVALID_FHIR';
  return STAGES.map(({ key }, index) => {
    if (key === 'received' && parseFailed) {
      return stage('received', 'failed', outcome.message ?? 'Not valid FHIR');
    }
    if (index < failedIndex) return successes[key];
    if (index === failedIndex && !parseFailed) {
      return stage(key, 'failed', `${outcome.issue_code}: ${outcome.message ?? ''}`.trim());
    }
    return stage(key, 'skipped', 'Stopped at an earlier stage');
  });
};

/** True when the text is a JSON FHIR Bundle. */
export const isBundleDocument = (text: string): boolean => {
  try {
    const document = JSON.parse(text) as { resourceType?: unknown } | null;
    return document?.resourceType === 'Bundle';
  } catch {
    return false;
  }
};

/** How many of each resource type a submission contains (for Bundles). */
export const resourceComposition = (text: string): Record<string, number> => {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof document !== 'object' || document === null) return {};
  const record = document as { resourceType?: unknown; entry?: unknown };
  const resources =
    record.resourceType === 'Bundle' && Array.isArray(record.entry)
      ? record.entry.map((entry) => (entry as { resource?: { resourceType?: unknown } })?.resource)
      : [record];
  const counts: Record<string, number> = {};
  for (const resource of resources) {
    const type = typeof resource?.resourceType === 'string' ? resource.resourceType : 'Unknown';
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
};

type Json = Record<string, unknown>;

/** The source Observation a result's label refers to ("Observation/<id>"). */
export const findSourceObservation = (text: string, label: string): Json | null => {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return null;
  }
  const record = document as Json;
  const candidates: Json[] =
    record?.resourceType === 'Bundle' && Array.isArray(record.entry)
      ? record.entry
          .map((entry) => (entry as Json)?.resource as Json)
          .filter((resource) => resource?.resourceType === 'Observation')
      : record?.resourceType === 'Observation'
        ? [record]
        : [];
  const id = label.startsWith('Observation/') ? label.slice('Observation/'.length) : null;
  return (id ? candidates.find((item) => item.id === id) : null) ?? (candidates.length === 1 ? candidates[0] : null);
};

export interface SourceSummary {
  loinc: { system: string; code: string; display: string | null } | null;
  value: string;
  effective: string | null;
  performer: string;
  subject: string;
}

/** The fields of a source Observation the demonstration compares. */
export const summarizeSource = (observation: Json): SourceSummary => {
  const code = observation.code as { coding?: Json[] } | undefined;
  const loinc = (code?.coding ?? []).find((coding) => coding.system === 'http://loinc.org');
  const concept = observation.valueCodeableConcept as { text?: string; coding?: Json[] } | undefined;
  const quantity = observation.valueQuantity as { value?: number; unit?: string; code?: string } | undefined;
  const value = concept
    ? `valueCodeableConcept: ${concept.coding?.[0]?.code ?? ''} ${concept.text ?? concept.coding?.[0]?.display ?? ''}`.trim()
    : quantity
      ? `valueQuantity: ${quantity.value} ${quantity.unit ?? quantity.code ?? ''}`.trim()
      : typeof observation.valueString === 'string'
        ? `valueString: ${observation.valueString}`
        : 'No value';
  const performer = (observation.performer as Json[] | undefined)?.[0];
  const identifier = performer?.identifier as Json | undefined;
  const performerText = performer
    ? typeof performer.reference === 'string'
      ? `reference ${performer.reference}`
      : identifier
        ? `identifier ${identifier.system} | ${identifier.value}`
        : 'performer without reference'
    : 'none on the Observation (see DiagnosticReport)';
  const subject = observation.subject as Json | undefined;
  return {
    loinc: loinc
      ? {
          system: String(loinc.system),
          code: String(loinc.code),
          display: typeof loinc.display === 'string' ? loinc.display : null,
        }
      : null,
    value,
    effective:
      (observation.effectiveDateTime as string | undefined) ??
      (observation.effectiveInstant as string | undefined) ??
      ((observation.effectivePeriod as Json | undefined)?.start as string | undefined) ??
      null,
    performer: performerText,
    subject: typeof subject?.reference === 'string' ? subject.reference : subject ? 'subject present' : 'none',
  };
};

/** Pretty-print JSON, or explain why it cannot be parsed. */
export const formatJson = (text: string): { ok: true; text: string } | { ok: false; error: string } => {
  try {
    return { ok: true, text: `${JSON.stringify(JSON.parse(text), null, 2)}\n` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
};

/**
 * Presentation states while the single ingestion request is in flight. They
 * describe what the backend does during that one request; they are not
 * separate backend operations.
 */
export const PROGRESS_STEPS = [
  'Validating FHIR…',
  'Normalizing terminology…',
  'Resolving facility…',
  'Persisting observation…',
];
