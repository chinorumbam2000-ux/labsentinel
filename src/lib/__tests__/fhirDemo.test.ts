import { describe, expect, it } from 'vitest';
import {
  ISSUE_STAGE,
  STAGES,
  findSourceObservation,
  formatJson,
  isBundleDocument,
  pendingPipeline,
  pipelineFor,
  resourceComposition,
  summarizeSource,
} from '../fhirDemo';
import type { IngestionOutcome, IngestionReply } from '../../data-access/fhirIngestion';
import { exampleContent, recordedIngestion } from '../../pages/__tests__/fakeFhirBackend';

const reply = (step: string) => {
  const recorded = recordedIngestion(step);
  return { status: recorded.status, response: recorded.body } as IngestionReply;
};

const statuses = (stages: ReturnType<typeof pendingPipeline>) => stages.map((s) => s.status);

const outcome = (overrides: Partial<IngestionOutcome>): IngestionOutcome => ({
  ...reply('influenza-first').response.results[0],
  ...overrides,
});

describe('pipeline stages follow the real ingestion response', () => {
  it('lists the backend order', () => {
    expect(STAGES.map((s) => s.key)).toEqual([
      'received', 'validation', 'facility', 'normalization', 'persistence', 'record',
    ]);
    expect(statuses(pendingPipeline())).toEqual(Array(6).fill('pending'));
  });

  it('marks every stage as succeeded for a created observation', () => {
    const created = reply('influenza-first');
    const stages = pipelineFor(created, created.response.results[0]);
    expect(statuses(stages)).toEqual(Array(6).fill('success'));
    expect(stages[2].detail).toContain('HOSP-A');
  });

  it('shows a duplicate as an existing record, not a new write', () => {
    const again = reply('influenza-again');
    const stages = pipelineFor(again, again.response.results[0]);
    expect(statuses(stages)).toEqual(['success', 'success', 'success', 'success', 'warning', 'success']);
    expect(stages[4].detail).toMatch(/nothing written/);
  });

  it('flags an unmapped LOINC at normalization', () => {
    const stages = pipelineFor(reply('influenza-first'), outcome({ warnings: ['UNMAPPED_LOINC'] }));
    expect(stages[3].status).toBe('warning');
  });

  it('stops at the failing stage and never claims later ones', () => {
    const rejected = reply('vital-signs');
    expect(statuses(pipelineFor(rejected, rejected.response.results[0]))).toEqual([
      'success', 'failed', 'skipped', 'skipped', 'skipped', 'skipped',
    ]);
    const facility = pipelineFor(rejected, outcome({ outcome: 'rejected', issue_code: 'UNRESOLVED_FACILITY', observation_id: null }));
    expect(statuses(facility)).toEqual(['success', 'success', 'failed', 'skipped', 'skipped', 'skipped']);
    const result = pipelineFor(rejected, outcome({ outcome: 'rejected', issue_code: 'INVALID_RESULT', observation_id: null }));
    expect(statuses(result)).toEqual(['success', 'success', 'success', 'failed', 'skipped', 'skipped']);
  });

  it('shows a resource that failed FHIR validation as not parsed', () => {
    const stages = pipelineFor(reply('vital-signs'), outcome({ outcome: 'rejected', issue_code: 'INVALID_FHIR' }));
    expect(statuses(stages)).toEqual(['failed', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped']);
  });

  it('shows a request-level rejection at the very first stage', () => {
    const malformed = reply('malformed');
    expect(malformed.status).toBe(400);
    const stages = pipelineFor(malformed, null);
    expect(statuses(stages)).toEqual(['failed', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped']);
    expect(stages[0].detail).toContain('INVALID_FHIR');
  });

  it('assigns every rejecting backend code to a stage', () => {
    for (const code of [
      'INVALID_FHIR', 'NON_FINAL_STATUS', 'NON_LAB_OBSERVATION', 'INVALID_LOINC', 'MISSING_EFFECTIVE_TIME',
      'INVALID_EFFECTIVE_TIME', 'DEMO_PERIOD_RESERVED', 'UNRESOLVED_FACILITY', 'INVALID_RESULT', 'MISSING_IDENTIFIER',
    ]) {
      expect(ISSUE_STAGE[code], code).toBeDefined();
    }
  });
});

describe('source helpers', () => {
  it('counts a Bundle by resource type', () => {
    const bundle = exampleContent('respiratory-panel-bundle');
    expect(isBundleDocument(bundle)).toBe(true);
    expect(resourceComposition(bundle)).toEqual({
      Organization: 1, Location: 1, Patient: 1, Specimen: 1, DiagnosticReport: 1, Observation: 3,
    });
    expect(isBundleDocument(exampleContent('influenza-a-positive'))).toBe(false);
    expect(resourceComposition('{ not json')).toEqual({});
  });

  it('finds and summarizes the source Observation for a result', () => {
    const bundle = exampleContent('respiratory-panel-bundle');
    const sars = findSourceObservation(bundle, 'Observation/lab-e-sars');
    const summary = summarizeSource(sars!);
    expect(summary.loinc?.code).toBe('94500-6');
    expect(summary.value).toContain('260373001');
    expect(summary.effective).toBe('2026-01-16T10:20:00-05:00');
    expect(summary.performer).toContain('DiagnosticReport');

    const flu = summarizeSource(findSourceObservation(exampleContent('influenza-a-positive'), 'Observation/lab-a-flu-0001')!);
    expect(flu.performer).toBe('identifier urn:labsentinel:facility-code | HOSP-A');
  });

  it('formats JSON or explains why it cannot', () => {
    expect(formatJson('{"a":1}')).toEqual({ ok: true, text: '{\n  "a": 1\n}\n' });
    expect(formatJson(exampleContent('malformed-json')).ok).toBe(false);
  });
});
