import { describe, expect, it } from 'vitest';
import { crossedLimit, cusumState, deviationText, methodNames, signalMark, signedSum } from '../cusum';
import { ApiError } from '../../data-access/apiClient';
import { createCusumClient, type CusumDay, type MethodComparison } from '../../data-access/cusum';
import { CUSUM_RECORDING } from '../../pages/__tests__/fakeDynamicBackend';

const jan17 = CUSUM_RECORDING.get['/api/statistics/cusum/current?date=2026-01-17'] as CusumDay;
const compare17 = CUSUM_RECORDING.get['/api/statistics/comparison?date=2026-01-17'] as MethodComparison;

describe('CUSUM presentation', () => {
  it('describes deviation, the limit and the state', () => {
    expect(deviationText(jan17.positivity!)).toBe('3.75 SD above the mean');
    expect(crossedLimit(jan17.positivity!)).toBe('Yes — 0.54 past h');
    expect(crossedLimit(jan17.volume!)).toBe('No — 1.54 below h');
    expect(cusumState(jan17.volume)).toBe('Normal');
    expect(cusumState(null)).toBe('Not calculated');
    expect(signedSum(-0.7621)).toBe('−0.76');
  });

  it('keeps "approaching the limit" informational: the formal state stays Normal', () => {
    const approaching = { ...jan17.volume!, cusum_value: 4.0, approaching_limit: true, alert_state: 'NORMAL' as const };
    expect(cusumState(approaching)).toBe('Normal');
  });

  it('names the methods that signal', () => {
    expect(methodNames(compare17)).toEqual(['Composite', 'EWMA', 'CUSUM']);
    expect([signalMark(true), signalMark(false), signalMark(null)]).toEqual(['✓', '✗', '—']);
  });
});

describe('CUSUM client', () => {
  const reply = (body: unknown, status = 200) => async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('treats a missing date as null and a non-development backend as unavailable', async () => {
    expect(await createCusumClient('http://x', reply({ detail: 'x' }, 404)).day('2027-01-01')).toBeNull();
    expect(await createCusumClient('http://x', reply({ detail: 'x' }, 404)).comparison('2027-01-01')).toBeNull();
    expect(await createCusumClient('http://x', reply({ detail: 'Not Found' }, 404)).recalculate()).toBe('unavailable');
  });

  it('rejects an unexpected response', async () => {
    await expect(createCusumClient('http://x', reply([{ method: 'EWMA' }])).history()).rejects.toBeInstanceOf(ApiError);
    await expect(createCusumClient('http://x', reply({ label: 3 })).comparison('2026-01-17')).rejects.toBeInstanceOf(ApiError);
  });
});
