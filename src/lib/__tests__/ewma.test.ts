import { describe, expect, it } from 'vitest';
import { crossedText, formatLead, metricValue, pointState } from '../ewma';
import { ApiError } from '../../data-access/apiClient';
import { createEwmaClient, type EwmaDay } from '../../data-access/ewma';
import { EWMA_RECORDING } from '../../pages/__tests__/fakeDynamicBackend';

const jan17 = EWMA_RECORDING.get['/api/statistics/ewma/current?date=2026-01-17'] as EwmaDay;

describe('EWMA presentation', () => {
  it('formats values by metric', () => {
    expect(metricValue('positivity', 12.2647, 2)).toBe('12.26%');
    expect(metricValue('volume', 58.8427, 2)).toBe('58.84 tests');
    expect(metricValue('volume', null)).toBe('—');
  });

  it('says whether the EWMA crossed its limit', () => {
    expect(crossedText(jan17.positivity!)).toBe('Yes — 1.66% above the limit');
    expect(crossedText(jan17.volume!)).toBe('No — 1.16 tests below the limit');
  });

  it('names states and unmonitored days', () => {
    expect(pointState(jan17.positivity)).toBe('Statistical Alert');
    expect(pointState(jan17.volume)).toBe('Watch');
    expect(pointState(null)).toBe('Not calculated');
    const gap = { ...jan17.volume!, calculation_status: 'NO_DATA' as const, alert_state: null };
    expect(pointState(gap)).toBe('No data');
  });

  it('phrases lead and lag', () => {
    expect(formatLead(0)).toBe('same day');
    expect(formatLead(1)).toBe('1 day earlier');
    expect(formatLead(-2)).toBe('2 days later');
    expect(formatLead(null)).toBe('—');
  });
});

describe('EWMA client', () => {
  const reply = (body: unknown, status = 200) => async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('treats a missing date as null and a non-development backend as unavailable', async () => {
    expect(await createEwmaClient('http://x', reply({ detail: 'x' }, 404)).day('2027-01-01')).toBeNull();
    expect(await createEwmaClient('http://x', reply({ detail: 'Not Found' }, 404)).recalculate()).toBe('unavailable');
  });

  it('rejects an unexpected response', async () => {
    await expect(createEwmaClient('http://x', reply([{ method: 'CUSUM' }])).history()).rejects.toBeInstanceOf(ApiError);
    await expect(createEwmaClient('http://x', reply({ method: 'EWMA' })).summary()).rejects.toBeInstanceOf(ApiError);
  });
});
