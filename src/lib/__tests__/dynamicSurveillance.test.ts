import { describe, expect, it } from 'vitest';
import {
  componentEvidence,
  explainDynamicSignal,
  facilityPositivePrivacy,
  facilityPositivityDisplay,
  formatSurveillanceDate,
  signed,
  statusMessage,
  INSUFFICIENT_BASELINE_TEXT,
} from '../dynamicSurveillance';
import { ApiError } from '../../data-access/apiClient';
import { createDynamicSurveillanceClient } from '../../data-access/dynamicSurveillance';
import { recordedSignal, recordedSummary } from '../../pages/__tests__/fakeDynamicBackend';

const jan15 = recordedSignal('2026-01-15');
const jan20 = recordedSignal(null);

describe('dynamic signal presentation', () => {
  it('formats dates without shifting them through a time zone', () => {
    expect(formatSurveillanceDate('2026-01-20')).toBe('Tue, Jan 20, 2026');
    expect(formatSurveillanceDate('2026-01-01')).toBe('Thu, Jan 1, 2026');
  });

  it('signs changes', () => {
    expect(signed(12.5, 1, '%')).toBe('+12.5%');
    expect(signed(-0.4148)).toBe('−0.4');
  });

  it('answers the five questions from the stored calculation', () => {
    const sections = Object.fromEntries(explainDynamicSignal(jan15).map((s) => [s.key, s.body]));
    expect(sections.what).toContain('from a baseline of 48.0 tests a day to 54 (+12.5%)');
    expect(sections.what).toContain('from 7.4% to 11.1% (+3.7 percentage points)');
    expect(sections.where).toBe('1 of 3 surveillance areas: 01604 (Worcester County).');
    expect(sections.facilities).toMatch(/^1 of 3 participating facilities: Worcester Central Medical Center — volume \+30\.0%/);
    expect(sections.persistence).toMatch(/^1 consecutive day/);
    expect(sections.why).toBe(
      'The five weighted components sum to 24.6, rounded to 25 of 100: the Watch band. Positivity is the largest single contributor.',
    );
  });

  it('describes each component with current and baseline values', () => {
    const components = jan15.calculation.components!;
    expect(components.map(componentEvidence)).toEqual([
      '54 tests · baseline 48.0 a day · +12.5%',
      '11.1% · baseline 7.4% · +3.7 points',
      '1 of 3 participating facilities abnormal',
      '1 of 3 surveillance areas affected',
      '1 consecutive abnormal day (full score at 4)',
    ]);
  });

  it('applies the existing small-count privacy rule to facility positives', () => {
    const hospB = jan15.calculation.facilities.find((f) => f.facility_code === 'HOSP-B')!;
    expect(hospB.positive).toBe(1);
    const privacy = facilityPositivePrivacy(hospB, jan15.positive_count);
    expect(privacy.suppressed).toBe(true);
    expect(privacy.displayValue).toBe('<5');
    expect(facilityPositivityDisplay(hospB, jan15.positive_count)).toBe('<5');
    const hospA = jan20.calculation.facilities.find((f) => f.facility_code === 'HOSP-A')!;
    expect(facilityPositivePrivacy(hospA, jan20.positive_count).displayValue).toBe('19');
    expect(facilityPositivityDisplay(hospA, jan20.positive_count)).toBe('41.3%');
  });

  it('explains unscored signals', () => {
    expect(statusMessage(recordedSignal('2026-01-03'))).toBe(INSUFFICIENT_BASELINE_TEXT);
    expect(statusMessage(jan20)).toBeNull();
  });
});

describe('dynamic surveillance client', () => {
  const reply = (body: unknown, status = 200) => async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('reads the summary and signals', async () => {
    const summary = await createDynamicSurveillanceClient('http://x', reply(recordedSummary())).summary();
    expect(summary.latest?.composite_score).toBe(90);
  });

  it('treats a missing signal as null and a non-development backend as unavailable', async () => {
    expect(await createDynamicSurveillanceClient('http://x', reply({ detail: 'x' }, 404)).signalFor('2027-01-01')).toBeNull();
    expect(await createDynamicSurveillanceClient('http://x', reply({ detail: 'Not Found' }, 404)).recalculate()).toBe('unavailable');
  });

  it('rejects an unexpected response', async () => {
    const client = createDynamicSurveillanceClient('http://x', reply([{ mode: 'demo', id: 1 }]));
    await expect(client.signals()).rejects.toBeInstanceOf(ApiError);
    const error = createDynamicSurveillanceClient('http://x', reply({ detail: 'date_to is before date_from.' }, 422));
    await expect(error.recalculate()).rejects.toThrow(/HTTP 422\)\. date_to is before date_from\./);
  });
});
