/**
 * Roella answers surveillance-profile questions from the same portfolio the
 * Dashboard shows, and never names a profile that does not exist.
 */
import { describe, expect, it } from 'vitest';
import { answerQuestion, answerText } from '../answerEngine';
import type { AssistantContext } from '../types';
import type { SimulationDay } from '../../types';
import { PROFILES, type ProfileId } from '../../lib/profiles/registry';
import { summarizeProfiles } from '../../lib/profiles/portfolio';

const ctx = (day: SimulationDay, profileId?: ProfileId, extra: Partial<AssistantContext> = {}): AssistantContext => ({
  day,
  route: 'dashboard',
  profiles: summarizeProfiles(day),
  profileId,
  ...extra,
});
const ask = (question: string, context: AssistantContext) => {
  const a = answerQuestion(question, context).answer;
  return { intent: a.intent, text: answerText(a) };
};

describe('Roella — surveillance profiles', () => {
  it('lists the profiles that need attention, highest first, with the counts kept apart', () => {
    const a = ask('Which profiles need attention?', ctx(5));
    expect(a.intent).toBe('profiles_attention');
    expect(a.text).toContain('4 of 6 surveillance profiles have active signals');
    const order = ['COVID-19: 93', 'Respiratory Viral Activity: 87', 'Influenza A: 67', 'RSV: 66'].map((s) => a.text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(a.text).toContain('Within expected range: 1');
    expect(a.text).toContain('Insufficient baseline: 1');
    expect(a.text).toContain('No data: 0');
    expect(a.text).toContain('never combined');
    expect(ask('Which profiles need attention?', ctx(1)).text).toContain('no surveillance profile has an active signal');
  });

  it('names the highest signal and any Critical profile', () => {
    expect(ask('What is the highest signal?', ctx(5)).text).toContain('COVID-19: 93 of 100 (Critical)');
    expect(ask('What is the highest signal?', ctx(4)).text).toContain('Influenza A: 86 of 100 (Critical)');
    const critical = ask('Are there any Critical signals?', ctx(5));
    expect(critical.intent).toBe('profiles_critical');
    expect(critical.text).toContain('COVID-19: 93 (Critical)');
    expect(critical.text).toContain('Respiratory Viral Activity: 87 (Critical)');
    expect(critical.text).not.toContain('Influenza A: 67');
    expect(ask('Is anything critical?', ctx(2)).text).toContain('No surveillance profile is Critical');
  });

  it('answers what is happening with one profile', () => {
    const flu = ask('What is happening with Influenza A?', ctx(4));
    expect(flu.intent).toBe('profile_status');
    expect(flu.text).toContain('Influenza A on Replay Day 4: Influenza A scores 86 (Critical)');
    expect(flu.text).toContain('Influenza A RNA');
    const cholera = ask('What is happening with cholera?', ctx(2));
    expect(cholera.text).toContain('No Cholera results were received on Day 2');
    expect(cholera.text).toContain('Score: No score');
  });

  it('compares two profiles side by side, without combining them', () => {
    const a = ask('Compare Influenza A and RSV', ctx(5));
    expect(a.intent).toBe('profile_compare');
    expect(a.text).toContain('Influenza A: 67 (High)');
    expect(a.text).toContain('RSV: 66 (High)');
    expect(a.text).toContain('Influenza A is higher by 1 point.');
    expect(a.text).toContain('never combined');
  });

  it('names the facilities contributing to a profile', () => {
    const a = ask('Which facilities are contributing to COVID-19?', ctx(5));
    expect(a.intent).toBe('profile_facilities');
    expect(a.text).toContain('3 of 3 facilities are above COVID-19');
    expect(ask('Which facilities contribute to cholera?', ctx(5)).text).toContain('no facility is assessed');
  });

  it('lists profiles within expected range and those needing a baseline, separately', () => {
    const within = ask('Which profiles are within expected range?', ctx(5));
    expect(within.intent).toBe('profiles_expected');
    expect(within.text).toContain('Gastrointestinal Syndrome: 1 (Low)');
    expect(within.text).toContain('Not counted as within range');
    expect(within.text).toContain('Cholera (insufficient baseline)');
    const baseline = ask('Which profiles need a baseline?', ctx(5));
    expect(baseline.intent).toBe('profiles_baseline');
    expect(baseline.text).toContain('Cholera has 0 tests on its Day 1 baseline');
    expect(ask('Which profiles have no data?', ctx(1)).text).toContain('No Cholera results were received on Day 1');
  });

  it('says which profile is on screen', () => {
    expect(ask('What profile am I viewing?', ctx(5, 'rsv')).text).toContain('You are viewing RSV: 66 (High)');
    expect(ask('Which profile am I viewing?', ctx(5)).text).toContain('You are viewing Respiratory Viral Activity');
    expect(ask('What profile am I viewing?', ctx(5, 'covid-19', { profileSelection: 'active' })).text).toContain(
      'Active signals view',
    );
  });

  it('explains "why is this signal high" for the profile on screen', () => {
    const a = ask('Why is this signal high?', ctx(4, 'influenza-a'));
    expect(a.intent).toBe('score_explanation');
    expect(a.text).toContain('You are viewing Influenza A');
    expect(a.text).toContain('its score is 86 (Critical)');
    // The baseline has 1 positive: its rate is withheld, as on screen.
    expect(a.text).toContain("Influenza A's own Day 1 baseline (33 tests, <5 positive)");
    expect(a.text).not.toContain('3.0%');
    expect(a.text).toContain('Small numbers');
    // The narrated profile keeps its own explanation.
    expect(ask('Why is this signal high?', ctx(5)).text).toContain('the score is 87 (Critical');
    expect(ask('Why is the score this high?', ctx(4, 'cholera')).text).toContain('It has no score on Replay Day 4');
  });

  it('flags narrated-only figures while another profile is on screen', () => {
    expect(ask('What is the positivity rate?', ctx(5, 'rsv')).text).toContain(
      'This answer is about Respiratory Viral Activity',
    );
    expect(ask('What is the positivity rate?', ctx(5)).text).not.toContain('This answer is about');
  });

  it('never invents a profile', () => {
    const measles = ask('What is happening with measles?', ctx(5));
    expect(measles.intent).toBe('profile_unknown');
    expect(measles.text).toContain('Measles is not a surveillance profile');
    for (const p of PROFILES) expect(measles.text).toContain(p.displayName);
    expect(ask('Is there a bird flu signal?', ctx(5)).intent).toBe('profile_unknown');
    // Medical questions are still refused, whatever profile they name.
    expect(ask('Should I take Tamiflu for flu?', ctx(5)).intent).toBe('medical_advice');
  });

  it('gives the same numbers as the screens, in both data modes', () => {
    const summaries = summarizeProfiles(5);
    for (const s of summaries.filter((x) => x.score)) {
      const a = ask(`What is happening with ${s.profile.displayName}?`, ctx(5, undefined, { dataMode: 'api' }));
      expect(a.text).toContain(`${s.score!.composite} / 100 (${s.score!.severity})`);
    }
  });

  it('rebuilds the same portfolio when the app does not pass one', () => {
    const withProfiles = ask('Which profiles need attention?', ctx(5)).text;
    const without = ask('Which profiles need attention?', { day: 5, route: 'dashboard' }).text;
    expect(without).toBe(withProfiles);
  });

  it('never reveals a facility count the Facilities page withholds', () => {
    // Day 1: every facility has fewer than 5 positives.
    const facilities = ask('Which facilities are affected?', ctx(1)).text;
    expect(facilities).not.toMatch(/\b[0-4] of \d+ tests positive/);
    const ranking = ask('Which facility has the most positives?', ctx(1));
    expect(ranking.intent).toBe('facility_ranking');
    expect(ranking.text).toContain('cannot be ranked by positives or positivity on Day 1 from the displayed data');
    expect(ranking.text).not.toMatch(/\d+\.\d%/);
    // By test volume (never withheld) a ranking is still given.
    expect(ask('Which facility has the highest test volume?', ctx(1)).text).toContain('41 tests');
    // Day 5: every facility meets the threshold, so positivity can be compared.
    expect(ask('Which facility has the highest positivity?', ctx(5)).text).toMatch(/has the highest positivity/);
  });

  it('withholds a profile’s small county-level counts in comparisons', () => {
    const a = ask('Compare Influenza A and RSV', ctx(2)).text;
    expect(a).toContain('positivity <5 vs <5');
    expect(a).not.toMatch(/\d+\.\d%/);
    const status = ask('What is happening with Influenza A?', ctx(1)).text;
    expect(status).toContain('Positivity: <5');
  });

  it('explains a sharp move component by component, with the small-numbers caution', () => {
    const a = ask('Why did Influenza A drop?', ctx(5));
    expect(a.intent).toBe('profile_change');
    expect(a.text).toContain('Influenza A moved from 86 to 67 (-19) between Replay Day 4 and Day 5');
    expect(a.text).toMatch(/Facilities: \d+ → \d+ points/);
    expect(a.text).toContain('Small numbers');
    // The narrated profile has no caution: its baseline has 8 positives.
    expect(ask('What is happening with Respiratory Viral Syndrome?', ctx(5)).text).not.toContain('Small numbers');
  });
});
