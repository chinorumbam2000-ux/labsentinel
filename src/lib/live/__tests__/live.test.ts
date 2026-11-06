/**
 * Live Surveillance: source adapters, the deterministic simulator, routing,
 * recalculation, the audit trail, source status, privacy and parity.
 */
import { describe, expect, it } from 'vitest';
import { ALL_DATES, FIRST_LIVE_INDEX, OPERATING_MINUTES } from '../dataset';
import { adapt, encode, isValidLoinc, planResults, type PlannedResult } from '../sources';
import { END_MINUTE, LIVE_PROFILES, LiveSimulator, operatingMinute } from '../simulator';
import { liveProfileView, liveSummaries } from '../view';
import { buildParityFixture } from '../parity';
import { calculateDataConfidence } from '../../dataConfidence';
import simulatorSource from '../simulator.ts?raw';
import sourcesSource from '../sources.ts?raw';
import datasetSource from '../dataset.ts?raw';
import engineSource from '../engine.ts?raw';
import committedFixture from '../../../../backend/tests/fixtures/live_parity.json?raw';

const run = (sim: LiveSimulator, step: number) => {
  while (!sim.finished) sim.advance(step);
  return sim;
};
const closedScores = (sim: LiveSimulator) =>
  Object.fromEntries(LIVE_PROFILES.map((id) => [id, Object.values(sim.closed[id]).map((s) => s.score?.composite ?? null)]));
const dayOf = (date: string) => ALL_DATES.indexOf(date) + 1;
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return operatingMinute(dayOf(date), h * 60 + m);
};

describe('simulated source adapters', () => {
  const sample: PlannedResult = {
    id: 'LIVE-X',
    hospitalId: 'HOSP-A',
    date: '2026-02-10',
    dayIndex: 10,
    code: '92142-9',
    positive: true,
    collectedMinute: 9 * 60 + 15,
    deliveredMinute: 9 * 60 + 18,
    withSpecimen: true,
    patientRef: 'live-00001',
  };

  it('reads each facility’s own format into the same normalized observation', () => {
    for (const hospitalId of ['HOSP-A', 'HOSP-B', 'HOSP-C'] as const) {
      const message = encode({ ...sample, hospitalId });
      const result = adapt(message);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.observation).toMatchObject({
        hospitalId,
        code: '92142-9',
        testName: 'Influenza A RNA',
        mapped: true,
        result: 'Positive',
        date: '2026-02-10',
        collectedMinute: 555,
        effectiveDateTime: '2026-02-10T09:15:00-05:00',
      });
    }
    expect(encode(sample).sourceType).toBe('FHIR R4');
    expect(encode({ ...sample, hospitalId: 'HOSP-B' }).sourceType).toBe('HL7 v2');
    expect(typeof encode({ ...sample, hospitalId: 'HOSP-B' }).body).toBe('string');
    expect(encode({ ...sample, hospitalId: 'HOSP-C' }).sourceType).toBe('LIS/API');
  });

  it('validates before normalizing', () => {
    expect(isValidLoinc('92142-9')).toBe(true);
    expect(isValidLoinc('92142-8')).toBe(false);
    const fhir = encode(sample) as { sourceType: 'FHIR R4'; body: Record<string, unknown> };
    expect(adapt({ ...fhir, body: { ...fhir.body, status: 'preliminary' } })).toEqual({ ok: false, reason: 'Not a final Observation' });
    expect(adapt({ ...fhir, body: { ...fhir.body, code: { coding: [{ system: 'http://loinc.org', code: '92142-8' }] } } }).ok).toBe(false);
    const hl7 = encode({ ...sample, hospitalId: 'HOSP-B' }) as { sourceType: 'HL7 v2'; body: string };
    expect(adapt({ ...hl7, body: hl7.body.replace('|F|||', '|P|||') })).toEqual({ ok: false, reason: 'Result is not final' });
    const lis = encode({ ...sample, hospitalId: 'HOSP-C' }) as { sourceType: 'LIS/API'; body: Record<string, unknown> };
    expect(adapt({ ...lis, body: { ...lis.body, result: 'MAYBE' } }).ok).toBe(false);
    expect(adapt({ ...lis, body: { ...lis.body, site: 'HOSP-Z' } }).ok).toBe(false);
  });

  it('keeps an unmapped code out of every profile', () => {
    const result = adapt(encode({ ...sample, hospitalId: 'HOSP-B', code: '94309-2' }));
    expect(result.ok && result.observation.mapped).toBe(false);
  });
});

describe('determinism', () => {
  it('plans the same results every time, with no random or clock input', () => {
    expect(planResults()).toEqual(planResults());
    expect(planResults()).toHaveLength(2181);
    for (const source of [simulatorSource, sourcesSource, datasetSource, engineSource]) {
      expect(source).not.toMatch(/Math\.random|Date\.now|new Date\(/);
    }
  });

  it('gives the same results whatever the step size (pause and resume change nothing)', () => {
    const smooth = run(new LiveSimulator(), 15);
    const jumpy = run(new LiveSimulator(), 333);
    expect(closedScores(jumpy)).toEqual(closedScores(smooth));
    expect(jumpy.observations).toEqual(smooth.observations);
    expect(smooth.op).toBe(END_MINUTE);
  });

  it('reset returns to exactly the starting state, without duplicates', () => {
    const fresh = new LiveSimulator();
    const sim = new LiveSimulator();
    sim.advance(OPERATING_MINUTES * 3 + 100);
    sim.reset();
    expect(sim.observations).toEqual(fresh.observations);
    expect(sim.audit).toEqual(fresh.audit);
    expect(closedScores(sim)).toEqual(closedScores(fresh));
    run(sim, 50);
    expect(closedScores(sim)).toEqual(closedScores(run(fresh, 50)));
    expect(sim.observations).toHaveLength(fresh.observations.length);
  });

  it('starts with seven days of history and no live arrivals', () => {
    const sim = new LiveSimulator();
    expect(sim.currentDay).toBe(FIRST_LIVE_INDEX - 1);
    expect(sim.observations.every((o) => o.day < FIRST_LIVE_INDEX)).toBe(true);
    expect(sim.audit).toEqual([]);
    // The rolling baseline is in place for the last two history days.
    expect(sim.closed['respiratory-viral-syndrome'][7].status).toBe('CALCULATED');
    expect(sim.closed['respiratory-viral-syndrome'][5].status).toBe('INSUFFICIENT_BASELINE');
  });
});

describe('the story emerges from the data', () => {
  it('scores what the engine calculates from the observations', () => {
    const scores = closedScores(run(new LiveSimulator(), 60));
    expect(scores['influenza-a'].slice(7)).toEqual([0, 1, 29, 56, 83, 84, 51, 1, 0, 0]);
    expect(scores['covid-19'].slice(7)).toEqual([1, 1, 1, 1, 41, 70, 81, 87, 88, 75]);
    expect(scores.rsv.slice(7).every((s) => (s ?? 0) < 20)).toBe(true);
  });

  it('moves COVID-19 to the top once it is the highest signal', () => {
    const sim = new LiveSimulator();
    sim.advance(OPERATING_MINUTES * 5);
    expect(liveSummaries(sim).filter((s) => s.score).sort((a, b) => b.score!.composite - a.score!.composite)[0].profile.id).toBe('influenza-a');
    sim.advance(OPERATING_MINUTES * 3);
    expect(liveSummaries(sim).filter((s) => s.score).sort((a, b) => b.score!.composite - a.score!.composite)[0].profile.id).toBe('covid-19');
  });

  it('keeps Cholera and Gastrointestinal out of the live feeds (inactive, not normal)', () => {
    const statuses = Object.fromEntries(liveSummaries(new LiveSimulator()).map((s) => [s.profile.id, s.status]));
    expect(statuses.cholera).toBe('INACTIVE');
    expect(statuses['gastrointestinal-syndrome']).toBe('INACTIVE');
  });
});

describe('routing and recalculation', () => {
  it('counts each observation once in every profile it belongs to', () => {
    const sim = run(new LiveSimulator(), 100);
    for (let day = 1; day <= ALL_DATES.length; day += 1) {
      for (const h of ['HOSP-A', 'HOSP-B', 'HOSP-C'] as const) {
        const tests = (id: (typeof LIVE_PROFILES)[number]) => sim.counts[id][h][day]?.tests ?? 0;
        expect(tests('respiratory-viral-syndrome')).toBe(tests('influenza-a') + tests('covid-19') + tests('rsv'));
      }
    }
  });

  it('a synthetic COVID-19 observation updates COVID-19 and the syndrome — and nothing else', () => {
    const sim = new LiveSimulator();
    sim.advance(at('2026-02-12', '12:00'));
    const before = Object.fromEntries(LIVE_PROFILES.map((id) => [id, sim.counts[id]['HOSP-B'][dayOf('2026-02-12')]?.tests ?? 0]));
    const rsvBefore = sim.provisional.rsv;
    const lastId = sim.audit[sim.audit.length - 1]?.id ?? 0;
    sim.inject('HOSP-B', '94500-6', true);
    const after = Object.fromEntries(LIVE_PROFILES.map((id) => [id, sim.counts[id]['HOSP-B'][dayOf('2026-02-12')]?.tests ?? 0]));
    expect(after['covid-19']).toBe(before['covid-19'] + 1);
    expect(after['respiratory-viral-syndrome']).toBe(before['respiratory-viral-syndrome'] + 1);
    expect(after['influenza-a']).toBe(before['influenza-a']);
    expect(after.rsv).toBe(before.rsv);
    expect(sim.provisional.rsv).toBe(rsvBefore);
    const added = sim.audit.filter((e) => e.id > lastId);
    expect(added[0].text).toContain('Central Massachusetts Regional · HL7 v2 · SARS-CoV-2 RNA · synthetic test observation');
    expect(added.filter((e) => e.kind === 'score').every((e) => e.profileId === 'covid-19' || e.profileId === 'respiratory-viral-syndrome')).toBe(true);
    // It went through the facility's own adapter.
    expect(sim.normalized[sim.normalized.length - 1]).toMatchObject({ sourceType: 'HL7 v2', manual: true });
  });

  it('explains every score change with the engine’s own component points', () => {
    const sim = run(new LiveSimulator(), 30);
    const changes = sim.audit.filter((e) => e.kind === 'score' || e.kind === 'close');
    expect(changes.length).toBeGreaterThan(0);
    for (const e of changes) {
      for (const d of e.drivers ?? []) expect(d.before).not.toBe(d.after);
    }
    const close = sim.audit.find((e) => e.kind === 'close' && e.profileId === 'covid-19' && e.text.includes('2026-02-17'))!;
    const signal = sim.closed['covid-19'][dayOf('2026-02-17')];
    const prev = sim.closed['covid-19'][dayOf('2026-02-16')];
    expect(close.before).toBe(prev.score!.composite);
    expect(close.after).toBe(signal.score!.composite);
    for (const d of close.drivers!) {
      expect(signal.score!.components.find((c) => c.label === d.label)!.points).toBe(d.after);
      expect(prev.score!.components.find((c) => c.label === d.label)!.points).toBe(d.before);
    }
  });
});

describe('sources and data confidence', () => {
  it('shows all three sources active, then the LIS outage, then recovery — from the live state', () => {
    const sim = new LiveSimulator();
    sim.advance(60);
    expect(sim.feedHealth().map((f) => f.status)).toEqual(['HEALTHY', 'HEALTHY', 'HEALTHY']);
    const healthy = calculateDataConfidence(sim.feedHealth());
    sim.advance(at('2026-02-13', '12:30') - sim.op);
    const during = sim.feedHealth();
    expect(during.map((f) => f.status)).toEqual(['HEALTHY', 'HEALTHY', 'DELAYED']);
    expect(during[2].minutesSinceLastEvent).toBeGreaterThan(30);
    const delayed = calculateDataConfidence(during);
    expect(delayed.components.find((c) => c.key === 'freshness')!.score).toBeLessThan(
      healthy.components.find((c) => c.key === 'freshness')!.score,
    );
    sim.advance(at('2026-02-13', '14:00') - sim.op);
    expect(sim.feedHealth()[2].status).toBe('HEALTHY');
    const sourceEvents = sim.audit.filter((e) => e.kind === 'source').map((e) => e.text);
    expect(sourceEvents[0]).toContain('Shrewsbury Community (LIS/API) feed HEALTHY → DELAYED');
    expect(sourceEvents[1]).toContain('DELAYED → HEALTHY');
  });
});

describe('privacy', () => {
  it('never puts a patient reference or a result in the activity stream', () => {
    const sim = run(new LiveSimulator(), 40);
    for (const e of sim.audit) {
      expect(e.text).not.toMatch(/live-\d|SYN-L|TEST-\d|Patient|Positive|Negative|DETECTED/);
    }
  });

  it('applies the small-count rule to the live counts', () => {
    const sim = new LiveSimulator();
    sim.advance(OPERATING_MINUTES * 2);
    const summaries = liveSummaries(sim);
    const rsv = liveProfileView(sim, 'rsv', summaries.find((s) => s.profile.id === 'rsv')!, []);
    // RSV has 3 positives a day network-wide: withheld, with its rate.
    expect(rsv.display.regional.suppressed).toBe(true);
    expect(rsv.display.positivity).toBe('<5');
    expect(rsv.privacy.positive('HOSP-A').displayValue).toBe('<5');
    const rvs = liveProfileView(sim, 'respiratory-viral-syndrome', summaries[0], []);
    expect(rvs.display.regional.suppressed).toBe(false);
  });
});

describe('browser / backend parity fixture', () => {
  it('is exactly what the browser produces now (the backend test checks its engine against it)', () => {
    expect(JSON.parse(committedFixture)).toEqual(JSON.parse(JSON.stringify(buildParityFixture())));
  });
});
