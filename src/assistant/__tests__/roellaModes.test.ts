/**
 * Roella in both data modes, against the same data the pages render.
 *
 * API mode replays real responses recorded from the FastAPI + PostgreSQL
 * backend, through the same ApiDataSource the app uses, and hands Roella the
 * days exactly as SimulationContext does.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createApiDataSource } from '../../data-access/apiDataSource';
import { BASE_URL, replayFetch } from '../../data-access/__tests__/helpers';
import { buildTrendSeries } from '../../lib/analytics';
import { dataConfidenceFor, findDay, signalScoreFor } from '../../lib/surveillanceDays';
import type { SimulationDay, SurveillanceDay } from '../../types';
import { answerQuestion, answerText } from '../answerEngine';
import type { AssistantContext, AssistantRoute, DataMode } from '../types';

const ask = (question: string, context: AssistantContext) => {
  const turn = answerQuestion(question, context, {});
  return { intent: turn.answer.intent, text: answerText(turn.answer) };
};

let apiDays: SurveillanceDay[] = [];
beforeAll(async () => {
  const source = createApiDataSource(BASE_URL, replayFetch().fetchImpl);
  apiDays = await Promise.all(([1, 2, 3, 4, 5] as const).map((day) => source.getDemoSummary(day)));
});

const api = (day: SimulationDay = 5, route: AssistantRoute = 'dashboard', smartEnabled = false): AssistantContext => ({
  day,
  route,
  days: apiDays,
  dataMode: 'api',
  smartEnabled,
});
const local = (day: SimulationDay = 5, route: AssistantRoute = 'dashboard'): AssistantContext => ({
  day,
  route,
  dataMode: 'local',
});

describe('Roella reads the active data source', () => {
  it('uses the API days in API mode, matching what the pages derive from them', () => {
    expect(apiDays.map((d) => d.compositeScore)).toEqual([0, 24, 50, 74, 87]);
    for (const day of [1, 2, 3, 4, 5] as SimulationDay[]) {
      const source = findDay(apiDays, day);
      const score = signalScoreFor(source);
      const confidence = dataConfidenceFor(source);
      const current = ask('What is the current score?', api(day)).text;
      expect(current).toContain(`${source.compositeScore} out of 100`);
      expect(current).toContain(score.severity);
      expect(current).toContain(`Data Confidence: ${confidence.score} (${confidence.level})`);
    }
  });

  it('answers trends from the API trend series, Day 1 through the current day only', () => {
    const series = buildTrendSeries(apiDays, 3);
    const text = ask('What trend do you see in the score?', api(3)).text;
    for (const point of series) expect(text).toContain(String(point.score));
    expect(text).not.toContain('74');
  });

  it('gives identical numbers in both modes (the API is parity-checked with the browser data)', () => {
    for (const question of ['Why is the score this high?', 'What changed from Day 4 to Day 5?', 'Which hospitals are affected?', 'What is Data Confidence?']) {
      expect(ask(question, api()).text).toBe(ask(question, local()).text);
    }
  });
});

describe('Roella says only what is true of the build it runs in', () => {
  const modes: DataMode[] = ['local', 'api'];

  it('never claims "no backend" or "no FHIR server" in API mode', () => {
    for (const question of ['What is ProbeSyQ Signal?', 'What is FHIR?', 'Is this connected to a live FHIR server?', 'What is the architecture?']) {
      const text = ask(question, api()).text;
      expect(text).not.toMatch(/no backend/i);
      expect(text).not.toContain('No FHIR server is contacted');
    }
    expect(ask('What is ProbeSyQ Signal?', api()).text).toContain('reads its data from the ProbeSyQ Signal API');
    expect(ask('What is FHIR?', api()).text).toContain('development FHIR R4 ingestion endpoint');
  });

  it('says there is no backend and no FHIR server in local mode', () => {
    expect(ask('What is ProbeSyQ Signal?', local()).text).toContain('It has no backend and no live hospital, laboratory or FHIR connection.');
    expect(ask('What is FHIR?', local()).text).toContain('No FHIR server is contacted.');
  });

  it('never claims a live hospital connection in either mode', () => {
    for (const mode of modes) {
      const text = ask('What is ProbeSyQ Signal?', mode === 'api' ? api() : local()).text;
      expect(text).toMatch(/synthetic data/);
      expect(text).toMatch(/[Nn]o live hospital/);
    }
  });

  it('describes SMART according to the build flag', () => {
    expect(ask('What is SMART on FHIR?', api(5, 'dashboard', true)).text).toContain(
      'can launch ProbeSyQ Signal against the public SMART Health IT synthetic sandbox',
    );
    expect(ask('What is SMART on FHIR?', api(5, 'dashboard', false)).text).toContain('no SMART launch happens');
  });

  it('explains the API-only pages, and says when this build cannot show them', () => {
    const page = ask('What does this page show?', local(5, 'fhir-ingestion')).text;
    expect(page).toContain('FHIR Laboratory Ingestion');
    expect(page).toContain('needs the ProbeSyQ Signal API');
    expect(ask('What does this page show?', api(5, 'fhir-ingestion')).text).not.toContain('needs the ProbeSyQ Signal API');
    expect(ask('What does this page show?', api(5, 'dynamic-surveillance')).text).toContain('EWMA and CUSUM');
    expect(ask('Where can I see EWMA?', local()).text).toContain('Open System → Detection Methods');
  });
});

describe('Roella identity', () => {
  const modes: DataMode[] = ['local', 'api'];

  it('introduces itself as Roella and uses the ProbeSyQ Signal name', () => {
    const intro = ask('Who are you?', local());
    expect(intro.intent).toBe('greeting');
    expect(intro.text).toContain('Roella, the ProbeSyQ intelligence assistant');
    expect(ask('What is Roella?', local()).text).toContain('Roella');
    const about = ask('What is ProbeSyQ Signal?', local()).text;
    expect(about).toContain('outbreak intelligence and laboratory surveillance application from ProbeSyQ');
    expect(about).not.toMatch(/prototype|classroom|capstone/i);
  });

  it('still recognises the legacy product name', () => {
    expect(ask('What is LabSentinel?', local()).intent).toBe('about');
  });

  it('never says LabSentinel in an answer', () => {
    const questions = [
      'Hello', 'What is ProbeSyQ Signal?', 'What is FHIR?', 'What is SMART on FHIR?', 'What is LOINC?', 'What is the architecture?',
      'Which facility is worst?', 'How is the Composite Score calculated?', 'What should I investigate next?',
      'What is the capital of France?', 'Should I take antibiotics?', 'How many deaths were there?', 'Where can I see trends?',
    ];
    for (const mode of modes) {
      for (const question of questions) {
        expect(ask(question, mode === 'api' ? api() : local()).text, `${mode}: ${question}`).not.toContain('LabSentinel');
      }
    }
  });
});
