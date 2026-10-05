import { describe, expect, it } from 'vitest';
import { getScenario } from '../../data/simulation';
import { getDataConfidence } from '../../lib/dataConfidence';
import { formatPercent } from '../../lib/format';
import { getAreaPositivePrivacy } from '../../lib/geographicPrivacy';
import { getAllHospitalMetrics, getScoreForDay, getZipMetrics } from '../../lib/selectors';
import type { SimulationDay } from '../../types';
import { answerQuestion, answerText, suggestedQuestions } from '../answerEngine';
import { MEDICAL_ADVICE, NOT_ENOUGH, OUT_OF_SCOPE } from '../knowledge';
import type { AssistantContext, AssistantRoute, ConversationState } from '../types';

const DAYS: SimulationDay[] = [1, 2, 3, 4, 5];

const ctx = (day: SimulationDay = 5, route: AssistantRoute = 'dashboard'): AssistantContext => ({ day, route });

const ask = (question: string, context: AssistantContext = ctx(), state: ConversationState = {}) => {
  const turn = answerQuestion(question, context, state);
  return { ...turn, text: answerText(turn.answer), intent: turn.answer.intent };
};

describe('Ask LabSentinel — spec questions (Day 5)', () => {
  it('describes LabSentinel and says the demo is synthetic with no live connection', () => {
    const { intent, text } = ask('What is LabSentinel?');
    expect(intent).toBe('about');
    expect(text).toContain('vendor-agnostic');
    expect(text).toMatch(/synthetic data/);
    expect(text).toMatch(/no live hospital, laboratory or FHIR connection/);
  });

  it('reports the current score from the scorer', () => {
    const score = getScoreForDay(5);
    const { intent, text } = ask('What is the current score?');
    expect(intent).toBe('current_score');
    expect(text).toContain(`${score.composite} out of 100`);
    expect(text).toContain(score.severity);
  });

  it('explains why the score is high from the scorer components', () => {
    const score = getScoreForDay(5);
    const { intent, text } = ask('Why is the score high?');
    expect(intent).toBe('score_explanation');
    for (const component of score.components) {
      expect(text).toContain(`${component.label}: ${component.points} of ${component.maxPoints} points`);
    }
    expect(text).toContain('Positivity and Affected Facilities');
  });

  it('explains "Why is the score 87 on Day 5?" even from an earlier day', () => {
    const { intent, text } = ask('Why is the score 87 on Day 5?', ctx(2));
    expect(intent).toBe('score_explanation');
    expect(text).toContain('the score is 87 (Critical');
    expect(text).toContain('ahead of the current simulation day (Day 2)');
  });

  it('compares Day 4 to Day 5', () => {
    const { intent, text } = ask('What changed from Day 4 to Day 5?');
    expect(intent).toBe('day_change');
    expect(text).toContain('Composite Outbreak Signal Score: 74 → 87 (+13)');
    expect(text).toContain('Tests: 158 → 176 (+18)');
    expect(text).toContain('Severity moved from High to Critical.');
  });

  it('lists affected hospitals with the Hospitals page values', () => {
    const { intent, text } = ask('Which hospitals are affected?');
    expect(intent).toBe('facilities');
    for (const metrics of getAllHospitalMetrics(5)) {
      expect(text).toContain(metrics.hospital.name);
      expect(text).toContain(`${metrics.positivityRate.toFixed(1)}%`);
      expect(text).toContain(`${metrics.positiveTests} of ${metrics.totalTests} tests positive`);
    }
  });

  it('lists affected ZIP codes', () => {
    const { intent, text } = ask('Which ZIP codes are affected?');
    expect(intent).toBe('geography');
    for (const zip of getScenario(5).affectedZipCodes) expect(text).toContain(zip);
    expect(text).toContain('3 of 3 surveillance areas are affected');
  });

  it('defines positivity with the Dashboard value', () => {
    const { intent, text } = ask('What is positivity?');
    expect(intent).toBe('positivity');
    expect(text).toContain('share of tests that came back positive');
    expect(text).toContain(formatPercent(getScenario(5).positivityRate));
  });

  it('defines Data Confidence with its components and current value', () => {
    const confidence = getDataConfidence(5);
    const { intent, text } = ask('What is Data Confidence?');
    expect(intent).toBe('confidence');
    expect(text).toContain('Feed Freshness — up to 30 points');
    expect(text).toContain(`it is ${confidence.score} (${confidence.level})`);
  });

  it('says Data Confidence does not affect the score', () => {
    const { intent, text, answer } = ask('Does Data Confidence affect the score?');
    expect(intent).toBe('confidence');
    expect(text).toMatch(/^No\. Data Confidence never changes the Composite Outbreak Signal Score/);
    expect(answer.followUps).not.toContain('Does Data Confidence affect the score?');
  });

  it('suggests surveillance review steps, never clinical advice', () => {
    const { intent, text } = ask('What should I investigate next?');
    expect(intent).toBe('investigate');
    expect(text).toContain('These are surveillance review steps, not clinical advice.');
  });

  it('explains the Analytics page', () => {
    const { intent, text } = ask('What does the Analytics page show?');
    expect(intent).toBe('page_help');
    expect(text).toContain('Trends & Analytics');
  });

  it('explains FHIR without claiming a live connection', () => {
    const { intent, text } = ask('What is FHIR?');
    expect(intent).toBe('fhir');
    expect(text).toContain('No FHIR server is contacted.');
  });

  it('explains SMART on FHIR without claiming a launch in the demo', () => {
    const { intent, text } = ask('What is SMART on FHIR?');
    expect(intent).toBe('smart');
    expect(text).toContain('no SMART launch happens here');
  });

  it('answers "Is this connected to a live FHIR server?" honestly', () => {
    expect(ask('Is this connected to a live FHIR server?').text).toContain('No FHIR server is contacted.');
  });

  it('describes Day 1', () => {
    const { intent, text } = ask('What happens on Day 1?');
    expect(intent).toBe('day_overview');
    expect(text).toContain('Day 1 (Baseline');
    expect(text).toContain('Composite score: 0 (Low)');
  });

  it('finds when the signal became Critical, and says "not yet" before it does', () => {
    const later = ask('When did the signal become Critical?', ctx(5));
    expect(later.intent).toBe('milestone');
    expect(later.text).toContain('Day 5');
    const earlier = ask('When did the signal become Critical?', ctx(2));
    expect(earlier.text).toMatch(/^Not yet\./);
  });

  it('explains how the Composite Score is calculated with the scorer weights', () => {
    const { intent, text } = ask('How is the Composite Score calculated?');
    expect(intent).toBe('score_method');
    expect(text).toContain('Test Volume — up to 25 points');
    expect(text).toContain('Positivity — up to 30 points');
    expect(text).toContain('Critical: 85–100');
    expect(text).toContain('Data Confidence is calculated separately and never changes the score.');
  });

  it('summarizes the current situation', () => {
    const { intent, text } = ask('Summarize the current situation.');
    expect(intent).toBe('situation_summary');
    expect(text).toContain('Composite Outbreak Signal Score of 87');
    expect(text).toContain('19.3%');
  });

  it('helps with navigation', () => {
    const { intent, text } = ask('Where can I see trends?');
    expect(intent).toBe('navigation');
    expect(text).toContain('Open Analytics');
  });
});

describe('Ask LabSentinel — scope and safety', () => {
  it.each(['Should I take antibiotics for my cough?', 'What treatment should a positive patient get?'])(
    'declines medical advice: %s',
    (question) => {
      const { intent, text } = ask(question);
      expect(intent).toBe('medical_advice');
      expect(text).toBe(MEDICAL_ADVICE);
    },
  );

  it.each(['What is the capital of France?', "What's the weather tomorrow?", 'Write me a poem'])(
    'declines unrelated questions: %s',
    (question) => {
      const { intent, text } = ask(question);
      expect(intent).toBe('out_of_scope');
      expect(text).toBe(OUT_OF_SCOPE);
    },
  );

  it.each(['How many deaths were there?', 'What is the age breakdown of positive patients?', 'Forecast Day 8'])(
    'admits what the demo cannot answer: %s',
    (question) => {
      const { intent, text } = ask(question);
      expect(intent).toBe('unsupported');
      expect(text.startsWith(NOT_ENOUGH)).toBe(true);
    },
  );

  it('never reveals area counts that the Map suppresses', () => {
    // Day 1: every area is below the display threshold.
    for (const zip of getZipMetrics(1)) {
      expect(getAreaPositivePrivacy(1, zip.hospitalId).suppressed).toBe(true);
    }
    for (const question of ['Which ZIP codes are affected?', 'Which area is most affected?']) {
      const { text } = ask(question, ctx(1));
      expect(text).toMatch(/fewer than 5/);
      for (const zip of getZipMetrics(1)) {
        expect(text).not.toContain(`${zip.zipCode} ${zip.city}: `);
        expect(text).not.toContain(formatPercent(zip.positivityRate));
      }
    }
    // Day 2: only the non-suppressed area is ranked.
    const day2 = ask('Which area is most affected?', ctx(2)).text;
    const shown = getZipMetrics(2).filter((zip) => !getAreaPositivePrivacy(2, zip.hospitalId).suppressed);
    const hidden = getZipMetrics(2).filter((zip) => getAreaPositivePrivacy(2, zip.hospitalId).suppressed);
    expect(shown.map((zip) => zip.zipCode)).toEqual(['01604']);
    expect(day2).toContain('01604');
    for (const zip of hidden) expect(day2).toContain(`${zip.zipCode}`);
    expect(day2).toMatch(/suppressed \(fewer than 5 positives\) and not compared/);
  });

  it('marks answers about later days as ahead of the simulation', () => {
    expect(ask('What happens on Day 4?', ctx(2)).text).toContain('ahead of the current simulation day (Day 2)');
    expect(ask('What happens on Day 2?', ctx(4)).text).not.toContain('ahead of the current simulation day');
  });
});

describe('Ask LabSentinel — conversation context', () => {
  it('resolves "which one" against the facilities just discussed', () => {
    const first = ask('Which hospitals are affected?');
    const follow = ask('Which one has the highest positivity?', ctx(), first.state);
    expect(follow.intent).toBe('facility_ranking');
    const top = [...getAllHospitalMetrics(5)].sort((a, b) => b.positivityRate - a.positivityRate)[0];
    expect(follow.text).toContain(top.hospital.name);
    expect(follow.text).toContain(`${top.positivityRate.toFixed(1)}%`);
  });

  it('keeps the topic for "what about Day N"', () => {
    const first = ask('Is positivity increasing?', ctx(5));
    const follow = ask('What about Day 3?', ctx(5), first.state);
    expect(follow.intent).toBe('trend');
    expect(follow.text).toContain(formatPercent(getScenario(3).positivityRate));
    expect(follow.text).not.toContain(formatPercent(getScenario(4).positivityRate));
  });

  it('answers for the day and page the analyst is viewing', () => {
    expect(ask('What does this page show?', ctx(3, 'map')).text).toContain('Outbreak Map');
    expect(ask('What is the current score?', ctx(3)).text).toContain('50 out of 100');
  });

  it('offers suggestions for the current day and page without previewing later days on Day 1', () => {
    const day1 = suggestedQuestions(ctx(1, 'dashboard'));
    expect(day1.length).toBeGreaterThan(0);
    expect(day1.join(' ')).not.toMatch(/Day 2/);
    expect(suggestedQuestions(ctx(4, 'hospitals'))).toContain('What changed from Day 3 to Day 4?');
  });
});

describe('Ask LabSentinel — Day 1 to Day 5 match the application data', () => {
  it('uses the expected storyline scores', () => {
    expect(DAYS.map((day) => getScoreForDay(day).composite)).toEqual([0, 24, 50, 74, 87]);
  });

  it.each(DAYS)('Day %i: score, severity, volume, positivity, facilities, areas, persistence', (day) => {
    const scenario = getScenario(day);
    const score = getScoreForDay(day);
    const confidence = getDataConfidence(day);
    const { text } = ask(`What happens on Day ${day}?`, ctx(day));

    expect(text).toContain(`Composite score: ${score.composite} (${score.severity})`);
    expect(text).toContain(`Tests: ${scenario.totalTests}`);
    expect(text).toContain(`Positivity: ${formatPercent(scenario.positivityRate)}`);
    expect(text).toContain(`Affected facilities: ${scenario.affectedHospitals.length} of 3`);
    expect(text).toContain(`Affected areas: ${scenario.affectedZipCodes.length} of 3`);
    expect(text).toContain(`Persistence: ${scenario.persistenceDays} day`);
    expect(text).toContain(`Data Confidence: ${confidence.score} (${confidence.level})`);

    const current = ask('What is the current score?', ctx(day)).text;
    expect(current).toContain(`${score.composite} out of 100`);
    expect(current).toContain(score.severity);

    const facilities = ask('Which hospitals are affected?', ctx(day)).text;
    for (const metrics of getAllHospitalMetrics(day).filter((m) => m.isAffected)) {
      expect(facilities).toContain(metrics.hospital.name);
    }

    const geography = ask('Which ZIP codes are affected?', ctx(day)).text;
    for (const zip of scenario.affectedZipCodes) expect(geography).toContain(zip);
  });

  it.each([2, 3, 4, 5] as SimulationDay[])('Day %i: day-over-day score change matches the scorer', (day) => {
    const before = getScoreForDay((day - 1) as SimulationDay).composite;
    const after = getScoreForDay(day).composite;
    const { text } = ask('What changed since the previous day?', ctx(day));
    expect(text).toContain(`Composite Outbreak Signal Score: ${before} → ${after}`);
  });
});
