/**
 * Roella in Live Surveillance: answers from the live state the screens show,
 * never claims a real connection, never reveals a withheld count.
 */
import { describe, expect, it } from 'vitest';
import { answerQuestion, answerText } from '../answerEngine';
import { buildLiveAssistantContext } from '../liveContext';
import type { AssistantContext } from '../types';
import { LiveSimulator, operatingMinute } from '../../lib/live/simulator';
import { liveSummaries } from '../../lib/live/view';
import { ALL_DATES, OPERATING_MINUTES } from '../../lib/live/dataset';
import type { ProfileId } from '../../lib/profiles/registry';

const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return operatingMinute(ALL_DATES.indexOf(date) + 1, h * 60 + m);
};

const liveCtx = (sim: LiveSimulator, profileId?: ProfileId): AssistantContext => ({
  day: 5,
  route: 'live',
  profiles: liveSummaries(sim),
  profileId,
  live: buildLiveAssistantContext(sim, { started: true, playing: true }),
});
const ask = (question: string, ctx: AssistantContext) => {
  const a = answerQuestion(question, ctx).answer;
  return { intent: a.intent, text: answerText(a) };
};

describe('Roella — Live Surveillance', () => {
  const sim = new LiveSimulator();
  sim.advance(at('2026-02-15', '10:00'));

  it('says what just changed, from the activity stream', () => {
    const a = ask('What just changed?', liveCtx(sim));
    expect(a.intent).toBe('live_changes');
    expect(a.text).toMatch(/In the last simulated hour \(to Feb 15 · 10:00\), \d+ observations arrived/);
    expect(a.text).toContain('simulated');
    expect(ask('What happened in the last minute?', liveCtx(sim)).intent).toBe('live_changes');
  });

  it('explains why a score moved, with the engine’s component points', () => {
    const a = ask('Why did the score increase?', liveCtx(sim, 'covid-19'));
    expect(a.intent).toBe('live_why');
    expect(a.text).toMatch(/COVID-19's latest change: \d+ → \d+ at Feb 15/);
    expect(a.text).toMatch(/points/);
  });

  it('names the source of the latest observation — as a simulated source', () => {
    const a = ask('Which source sent the latest observation?', liveCtx(sim));
    expect(a.intent).toBe('live_latest_source');
    expect(a.text).toMatch(/through the simulated (FHIR R4|HL7 v2|LIS\/API) source/);
    expect(a.text).not.toMatch(/live-\d|SYN-L|Positive|Negative/);
  });

  it('knows which profile changed most recently', () => {
    expect(ask('Which profile changed most recently?', liveCtx(sim)).text).toMatch(/changed most recently: /);
  });

  it('reports the sources’ status, including the outage', () => {
    expect(ask('Are all sources active?', liveCtx(sim)).text).toContain('All 3 simulated sources are active.');
    const during = new LiveSimulator();
    during.advance(at('2026-02-13', '12:00'));
    const a = ask('Are all sources active?', liveCtx(during));
    expect(a.text).toContain('2 of 3 simulated sources are active.');
    expect(a.text).toContain('Shrewsbury Community Medical Center — simulated LIS/API: delayed');
  });

  it('names what is driving a profile right now', () => {
    const a = ask('What is driving COVID-19 right now?', liveCtx(sim));
    expect(a.intent).toBe('live_driver');
    const covid = liveSummaries(sim).find((s) => s.profile.id === 'covid-19')!;
    expect(a.text).toContain(`COVID-19 scores ${covid.score!.composite} (${covid.score!.severity}) on Feb 14`);
    for (const c of covid.score!.components) expect(a.text).toContain(`${c.label}: ${c.points} of ${c.maxPoints} points`);
  });

  it('explains why a facility became affected, from the engine’s own reasons', () => {
    const a = ask('Why did Worcester become affected?', liveCtx(sim, 'covid-19'));
    expect(a.intent).toBe('live_facility');
    expect(a.text).toMatch(/Worcester Central Medical Center is (affected|not affected)/);
  });

  it('answers "is this real-time?" honestly in both modes', () => {
    const live = ask('Is this real-time?', liveCtx(sim));
    expect(live.intent).toBe('realtime');
    expect(live.text).toContain('processed one by one, as they arrive');
    expect(live.text).toContain('It is not real patient data');
    const replay = ask('Is this real-time?', { day: 5, route: 'dashboard' });
    expect(replay.text).toContain('Scenario Replay steps through a fixed five-day synthetic scenario');
  });

  it('never claims a real hospital or vendor connection', () => {
    for (const q of ['Is this connected to Epic?', 'Are all sources active?', 'Is this real-time?', 'What just changed?']) {
      const t = ask(q, liveCtx(sim)).text;
      expect(t).not.toMatch(/connected to (a real|Epic|MEDITECH|Oracle)|real hospital connection is|monitoring real patients/i);
    }
  });

  it('answers figure questions from the live state, never the replay', () => {
    const a = ask('What is the positivity rate?', liveCtx(sim, 'covid-19'));
    expect(a.text).toContain('In Live Surveillance, here is COVID-19 on the latest closed day');
    expect(a.text).toContain('COVID-19 on Feb 14 (latest closed day)');
    expect(a.text).not.toContain('Replay Day');
    expect(ask('What is the current score?', liveCtx(sim, 'influenza-a')).text).toContain('rolling 7-day baseline');
  });

  it('withholds small live counts in its answers', () => {
    const early = new LiveSimulator();
    early.advance(OPERATING_MINUTES * 2);
    const a = ask('What is happening with RSV?', liveCtx(early));
    expect(a.text).toContain('Positivity: <5');
  });
});
