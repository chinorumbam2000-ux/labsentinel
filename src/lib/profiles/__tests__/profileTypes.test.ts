/**
 * Aggregate and pathogen-specific profiles: the visible name, the type, the
 * routing and the scores. Naming and presentation only — the scores, the
 * routing and the compatibility identifiers are unchanged.
 */
import { describe, expect, it } from 'vitest';
import raw from '../../../../backend/app/profiles/registry.json';
import { getScoreForDay } from '../../selectors';
import { summarizeProfiles } from '../portfolio';
import {
  PROFILES,
  PROFILE_BY_ID,
  RVS_PROFILE_ID,
  aggregatesContaining,
  constituentProfiles,
  currentProfileName,
  profileScopeText,
  profilesForTest,
} from '../registry';
import { answerQuestion, answerText } from '../../../assistant/answerEngine';
import { buildLiveAssistantContext } from '../../../assistant/liveContext';
import { LiveSimulator } from '../../live/simulator';
import { liveSummaries } from '../../live/view';
import type { AssistantContext } from '../../../assistant/types';

const OLD = 'Respiratory Viral Syndrome';
const RVA = 'Respiratory Viral Activity';

describe('the aggregate respiratory profile', () => {
  it('is shown as Respiratory Viral Activity; its compatibility identifiers are unchanged', () => {
    const p = PROFILE_BY_ID[RVS_PROFILE_ID];
    expect(p.displayName).toBe(RVA);
    expect(p.typeDescriptor).toBe('Aggregate respiratory surveillance');
    expect(p.description).toBe(
      'Respiratory Viral Activity aggregates configured respiratory viral laboratory tests, including Influenza A, COVID-19 and RSV, to show overall respiratory viral activity across participating facilities and areas.',
    );
    // The id, the registry/database name and the engine key stay as stored.
    expect(p.id).toBe('respiratory-viral-syndrome');
    expect(p.registryName).toBe(OLD);
    expect(p.engineKey).toBe(OLD);
    expect(p.legacySyndrome).toBe(OLD);
    expect(raw.profiles[0].displayName).toBe(OLD);
  });

  it('shows no profile name or description with the old wording', () => {
    for (const p of PROFILES) {
      expect(p.displayName, p.id).not.toContain(OLD);
      expect(p.description, p.id).not.toContain(OLD);
      expect(p.description, p.id).not.toMatch(/diagnos/i);
    }
    expect(currentProfileName(OLD)).toBe(RVA);
    expect(currentProfileName('COVID-19')).toBe('COVID-19');
    expect(currentProfileName(null)).toBe('');
  });
});

describe('profile types', () => {
  it('Aggregate or Pathogen, from the registry category', () => {
    expect(Object.fromEntries(PROFILES.map((p) => [p.displayName, p.type]))).toEqual({
      [RVA]: 'Aggregate',
      'Influenza A': 'Pathogen',
      'COVID-19': 'Pathogen',
      RSV: 'Pathogen',
      Cholera: 'Pathogen',
      'Gastrointestinal Syndrome': 'Aggregate',
    });
    expect(PROFILE_BY_ID['gastrointestinal-syndrome'].typeDescriptor).toBe('Aggregate syndrome-level surveillance');
    expect(PROFILE_BY_ID['covid-19'].typeDescriptor).toBe('Pathogen-specific surveillance');
  });

  it('derives the aggregate’s pathogens from the membership', () => {
    expect(constituentProfiles(RVS_PROFILE_ID).map((p) => p.id)).toEqual(['influenza-a', 'covid-19', 'rsv']);
    expect(constituentProfiles('gastrointestinal-syndrome').map((p) => p.id)).toEqual(['cholera']);
    expect(constituentProfiles('covid-19')).toEqual([]);
    for (const id of ['influenza-a', 'covid-19', 'rsv'] as const) {
      expect(aggregatesContaining(id).map((p) => p.id)).toEqual([RVS_PROFILE_ID]);
    }
    expect(profileScopeText(RVS_PROFILE_ID)).toBe('This aggregate profile combines Influenza A, COVID-19 and RSV laboratory activity.');
    expect(profileScopeText('covid-19')).toBe('COVID-19 results only (SARS-CoV-2 RNA); they also count towards Respiratory Viral Activity.');
  });
});

describe('test-to-profile routing (unchanged)', () => {
  it('routes each respiratory test to its pathogen and to the aggregate, once each', () => {
    expect(profilesForTest('94500-6')).toEqual([RVS_PROFILE_ID, 'covid-19']); // SARS-CoV-2
    expect(profilesForTest('85479-4')).toEqual([RVS_PROFILE_ID, 'rsv']); // RSV
    expect(profilesForTest('92142-9')).toEqual([RVS_PROFILE_ID, 'influenza-a']); // Influenza A
    for (const code of ['94500-6', '85479-4', '92142-9']) expect(new Set(profilesForTest(code)).size).toBe(2);
  });
});

describe('scores (unchanged)', () => {
  it('the aggregate is scored from its own combined observations, not an average of the pathogen scores', () => {
    const day5 = summarizeProfiles(5);
    const by = (id: string) => day5.find((s) => s.profile.id === id)!;
    const rva = by(RVS_PROFILE_ID);
    expect(rva.score?.composite).toBe(87);
    expect(rva.score?.composite).toBe(getScoreForDay(5).composite);
    expect(by('covid-19').score?.composite).toBe(93);
    expect(by('influenza-a').score?.composite).toBe(67);
    expect(by('rsv').score?.composite).toBe(66);
    const average = (93 + 67 + 66) / 3;
    expect(rva.score?.composite).not.toBe(Math.round(average));
    // Every respiratory result counts once in the aggregate: its tests are the sum of the pathogens'.
    const tests = ['influenza-a', 'covid-19', 'rsv'].reduce((sum, id) => sum + by(id).current.scenario.totalTests, 0);
    expect(rva.current.scenario.totalTests).toBe(tests);
  });

  it('Scenario Replay still scores 0 / 24 / 50 / 74 / 87', () => {
    expect([1, 2, 3, 4, 5].map((d) => getScoreForDay(d).composite)).toEqual([0, 24, 50, 74, 87]);
  });
});

describe('Roella on aggregate and pathogen profiles', () => {
  const sim = new LiveSimulator();
  sim.advance(900);
  const contexts: AssistantContext[] = [
    { day: 5, route: 'dashboard' },
    { day: 5, route: 'dashboard', profiles: liveSummaries(sim), live: buildLiveAssistantContext(sim, { started: true, playing: true }) },
  ];
  const ask = (q: string, ctx: AssistantContext) => {
    const a = answerQuestion(q, ctx).answer;
    return { intent: a.intent, text: answerText(a), followUps: a.followUps };
  };

  it('Is COVID-19 part of Respiratory Viral Activity? — yes, as a pathogen-specific profile that also contributes', () => {
    for (const ctx of contexts) {
      const a = ask('Is COVID-19 part of Respiratory Viral Activity?', ctx);
      expect(a.intent).toBe('profile_membership');
      expect(a.text).toContain('Yes. COVID-19 is a pathogen-specific profile, and its mapped laboratory results (SARS-CoV-2 RNA) also contribute to the broader Respiratory Viral Activity aggregate.');
      expect(a.text).toContain('not by averaging the pathogen scores');
    }
    expect(ask('Is cholera part of Respiratory Viral Activity?', contexts[0]).text).toMatch(/^No\. Cholera is a pathogen-specific profile/);
  });

  it('Is RSV different from Respiratory Viral Activity? — a specific virus vs the aggregate view', () => {
    const a = ask('Is RSV different from Respiratory Viral Activity?', contexts[0]);
    expect(a.intent).toBe('profile_difference');
    expect(a.text).toContain('RSV is a specific respiratory virus profile');
    expect(a.text).toContain('Respiratory Viral Activity is the aggregate surveillance view combining Influenza A, COVID-19 and RSV activity');
    expect(a.text).toContain('not duplicate monitoring');
  });

  it('What is Respiratory Viral Activity? — an aggregate profile, not a separate disease', () => {
    for (const q of ['What is Respiratory Viral Activity?', 'Is Respiratory Viral Activity a disease?']) {
      const a = ask(q, contexts[0]);
      expect(a.intent, q).toBe('profile_type_about');
      expect(a.text).toContain('Respiratory Viral Activity is an aggregate surveillance profile, not a separate disease');
    }
    // A status question about the aggregate is still a status question.
    expect(ask('What is happening with Respiratory Viral Activity?', contexts[0]).intent).toBe('profile_status');
    // The former name is still understood.
    expect(ask('What is Respiratory Viral Syndrome?', contexts[0]).intent).toBe('profile_type_about');
  });

  it('never says the old name in a visible answer, in either mode', () => {
    const questions = [
      'Which profiles need attention?', 'What is the highest signal?', 'Is anything critical?', 'Which profile am I viewing?',
      'What tests are included?', 'What is LOINC?', 'What is FHIR?', 'What is Signal by ProbeSyQ?', 'Hello', 'What is Scenario Replay?',
      'What is happening with Respiratory Viral Activity?', 'What is happening with COVID-19?', 'Why is the score this high?',
      'Summarize the current outbreak situation.', 'What does this page show?', 'What is an aggregate profile?',
      'Which facilities are affected?', 'What is driving the selected signal?', 'What changed from Day 4 to Day 5?',
    ];
    for (const ctx of contexts) {
      for (const q of questions) {
        const a = ask(q, ctx);
        expect(`${a.text} ${a.followUps.join(' ')}`, `${ctx.live ? 'live' : 'replay'}: ${q}`).not.toContain(OLD);
      }
    }
  });
});
