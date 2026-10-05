/**
 * Ask LabSentinel — lightweight question understanding.
 *
 * Normalized text, keyword groups, phrases and a few synonyms; no NLP
 * library. Returns the intent plus any day or page the question names.
 */
import type { SimulationDay } from '../types';
import { isSimulationDay } from './context';
import type { AssistantContext, AssistantRoute, ConversationState, IntentId } from './types';

export interface ParsedQuestion {
  intent: IntentId;
  /** A single day the question is about (explicit, "yesterday", or from a score it names). */
  day?: SimulationDay;
  /** "from Day 4 to Day 5". */
  range?: { from: SimulationDay; to: SimulationDay };
  /** A page the question names ("what does the Analytics page show"). */
  page?: Exclude<AssistantRoute, 'other'>;
  /** A severity the question names ("when did it become Critical"). */
  severity?: 'Watch' | 'Moderate' | 'High' | 'Critical';
  /** A composite score the question quotes ("why is the score 87"). */
  quotedScore?: number;
  normalized: string;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: 5, final: 5 };

export const normalize = (question: string): string =>
  question
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9%<>.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const has = (text: string, ...needles: string[]) => needles.some((n) => text.includes(n));
const word = (text: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(text));

const PAGE_NAMES: Array<[RegExp, Exclude<AssistantRoute, 'other'>]> = [
  [/\bdashboard\b/, 'dashboard'],
  [/\b(outbreak )?map\b/, 'map'],
  [/\blab(oratory)? data\b/, 'laboratory-data'],
  [/\bsignals?( and alerts)?( page)\b/, 'signals'],
  [/\bhospitals? page\b/, 'hospitals'],
  [/\banalytics\b/, 'analytics'],
  [/\bsimulation page\b/, 'simulation'],
  [/\breports? page\b/, 'reports'],
  [/\barchitecture\b/, 'architecture'],
];

const parseDays = (text: string, context: AssistantContext): Pick<ParsedQuestion, 'day' | 'range'> => {
  const found: number[] = [];
  for (const match of text.matchAll(/\bday (\d+|one|two|three|four|five|first|last)\b/g)) {
    const raw = match[1];
    found.push(/^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw]);
  }
  for (const match of text.matchAll(/\b(first|second|third|fourth|fifth|last|final) day\b/g)) found.push(NUMBER_WORDS[match[1]]);
  const days = found.filter(isSimulationDay);
  if (days.length >= 2) {
    const [a, b] = [Math.min(days[0], days[1]), Math.max(days[0], days[1])] as SimulationDay[];
    return { range: { from: a, to: b }, day: b };
  }
  if (days.length === 1) return { day: days[0] };
  if (word(text, 'yesterday', 'previous day', 'day before')) {
    const prev = context.day - 1;
    return isSimulationDay(prev) ? { range: { from: prev, to: context.day }, day: context.day } : { day: context.day };
  }
  if (word(text, 'baseline') && has(text, 'what happen', 'what was', 'day')) return { day: 1 };
  return {};
};

const parseSeverity = (text: string): ParsedQuestion['severity'] => {
  if (word(text, 'critical')) return 'Critical';
  if (word(text, 'high')) return 'High';
  if (word(text, 'moderate')) return 'Moderate';
  if (word(text, 'watch')) return 'Watch';
  return undefined;
};

/** Words that mark a question as being about LabSentinel at all. */
const DOMAIN = [
  'labsentinel', 'score', 'signal', 'outbreak', 'hospital', 'facility', 'facilities', 'zip', 'area', 'positiv', 'test',
  'volume', 'severity', 'critical', 'confidence', 'alert', 'day', 'trend', 'analytic', 'map', 'lab', 'observation',
  'fhir', 'smart', 'loinc', 'vendor', 'epic', 'oracle', 'meditech', 'sidecar', 'report', 'architecture', 'simulation',
  'surveillance', 'persist', 'geograph', 'page', 'dashboard', 'investigat', 'baseline', 'syndrome', 'respiratory',
  'influenza', 'flu', 'rsv', 'covid', 'sars', 'data', 'privacy', 'suppress', 'interoperab', 'ehr', 'patient', 'spread',
];

const MEDICAL = /\b(medication|medicine|medicines|treat|treatment|treatments|dose|dosage|prescri\w*|diagnos\w*|antibiotic\w*|antiviral\w*|cure|symptom\w*|should i (take|go|get|stay|see|isolate)|am i (sick|infected|contagious)|do i have|my (child|kid|fever|cough|health|doctor)|tamiflu|paxlovid|ibuprofen|tylenol)\b/;

/** Things the demo has no data for: say so instead of guessing. */
const UNSUPPORTED = /\b(death\w*|mortality|died|age|ages|gender|sex|demographic\w*|ethnic\w*|race|income|vaccin\w*|hospitali[sz]ation\w*|admission\w*|icu|ventilator\w*|bed\w*|forecast\w*|predict\w*|projection\w*|tomorrow|next week|day (6|7|8|9|10)|sixth day|cost\w*|budget|staff\w*|r0|r naught|reproduction number|incubation|genom\w*|sequenc\w*|variant\w*|strain\w*|patient names?|who tested positive|names? of patients)\b/;

const OFF_TOPIC = /\b(weather|president|prime minister|election|essay|poem|joke|recipe|movie|song|stock|bitcoin|crypto|football|soccer|basketball|capital of|translate|homework|write (me |my )?(an? )?(essay|story|poem|letter|code))\b/;

const FOLLOW_UP = /\b(which one|that one|which of (them|those|these)|those|these|them|they|among them|of those|of them|which has|which had)\b/;
const RANKING = /\b(highest|most|worst|top|biggest|largest|greatest|lowest|least|best)\b/;

export const parseQuestion = (question: string, context: AssistantContext, state: ConversationState = {}): ParsedQuestion => {
  const t = normalize(question);
  const base = { normalized: t, ...parseDays(t, context) };
  const severity = parseSeverity(t);
  const quoted = t.match(/\b(?:score|it|signal)\s+(?:is |of |at |was )?(\d{1,3})\b/);
  const quotedScore = quoted ? Number(quoted[1]) : undefined;
  const result = (intent: IntentId, extra: Partial<ParsedQuestion> = {}): ParsedQuestion => ({ intent, ...base, severity, quotedScore, ...extra });

  if (!t) return result('greeting');
  if (MEDICAL.test(t)) return result('medical_advice');
  if (OFF_TOPIC.test(t) && !has(t, 'labsentinel', 'outbreak', 'surveillance')) return result('out_of_scope');

  // Follow-ups that lean on the previous answer.
  if (FOLLOW_UP.test(t) && RANKING.test(t)) {
    if (state.lastTopic === 'facilities') return result('facility_ranking');
    if (state.lastTopic === 'areas') return result('area_ranking');
  }
  if (/^(and |what about |how about |same for |and for )?(on )?(day \S+|yesterday|the (first|last) day)\??$/.test(t) && state.lastIntent) {
    // Keep the previous question's focus (e.g. positivity), with the new day.
    return result(state.lastIntent, { normalized: `${state.lastQuestion ?? ''} ${t}`.trim() });
  }

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|help|what can you do|what can i ask)\b/.test(t) && t.split(' ').length <= 6) return result('greeting');
  if (UNSUPPORTED.test(t)) return result('unsupported');

  // Page help ("what does this page show", "what does the Analytics page show").
  const pageNamed = PAGE_NAMES.find(([re]) => re.test(t))?.[1];
  if (has(t, 'this page', 'this screen', 'am i looking at', 'this view', 'use this page', 'on this page') ||
      (pageNamed && has(t, 'what does', 'what is on', 'what is the', 'show', 'explain the', 'how do i use', 'for'))) {
    if (!has(t, 'where can', 'where is', 'where do', 'how do i get', 'how do i find')) return result('page_help', { page: pageNamed });
  }

  // Navigation ("where can I see trends", "how do I view lab observations").
  if (has(t, 'where can i', 'where do i', 'where is the', 'where are', 'how do i view', 'how do i see', 'how do i find', 'how do i get to', 'which page', 'where to see', 'how can i see', 'where can we') &&
      !has(t, 'outbreak', 'spread', 'happening', 'affected', 'cases')) {
    return result('navigation');
  }

  // Concepts.
  if (word(t, 'smart')) return result('smart');
  if (word(t, 'fhir')) return result('fhir');
  if (word(t, 'loinc')) return result('loinc');
  if (has(t, 'interoperab', 'vendor agnostic', 'vendor-agnostic')) return result('interoperability');

  // Score method vs explanation vs value.
  if (has(t, 'how is the score calculated', 'how is the composite', 'how does the composite', 'how does the score', 'how is it calculated', 'score calculated', 'score work', 'weights', 'weighting', 'formula', 'how do you calculate', 'methodology', 'score computed')) {
    return result('score_method');
  }
  if (has(t, 'severity level', 'severity band', 'what does critical mean', 'what does high mean', 'what does moderate mean', 'what does watch mean', 'severity mean', 'what are the levels', 'severity scale')) {
    return result('severity_levels');
  }
  if (has(t, 'when did', 'when was', 'what day did', 'which day did', 'first become', 'first became', 'first reach', 'become critical', 'become high', 'turn critical', 'go critical')) {
    return result('milestone');
  }
  if (has(t, 'what changed', 'what has changed', 'changes', 'change from', 'difference between', 'compared to', 'compare day', 'since yesterday', 'go up', 'went up', 'rise', 'rose', 'increase from', 'jump', 'what happened today', 'why did the score', 'why has the score', 'day over day', 'day-over-day') || base.range) {
    if (!has(t, 'trend')) return result('day_change');
  }
  if (has(t, 'confidence', 'data quality', 'trustworthy')) return result('confidence');
  if (has(t, 'why') && has(t, 'score', 'critical', 'high', 'moderate', 'watch', 'severe', 'signal', 'elevated', 'concerning', 'alert')) return result('score_explanation');
  if (has(t, 'explain the score', 'score breakdown', 'contributed', 'contribution', 'components', 'driving the score', 'driver', 'what makes up', 'break down the score')) return result('score_explanation');
  if (has(t, 'summar', 'situation', 'overview of', 'current status', 'how bad', 'brief me', 'big picture', 'whats going on', 'what is going on', 'outbreak status', 'status of the outbreak')) return result('situation_summary');
  if (has(t, 'investigat', 'what should i', 'next step', 'what to review', 'what to check', 'recommend', 'priorit', 'focus on', 'look at next', 'review next', 'action')) return result('investigate');
  if (has(t, 'what happens on', 'what happened on', 'what is happening on', 'what was happening', 'describe day', 'tell me about day', 'what about day') && base.day) return result('day_overview');

  // Topics.
  if (has(t, 'confidence', 'data quality', 'trust', 'trustworthy', 'reliab', 'completeness', 'freshness', 'mapping quality')) return result('confidence');
  if (has(t, 'privacy', 'suppress', '<5', 'less than 5', 'fewer than 5', 'hidden', 'hide', 'redact')) return result('privacy');
  if (has(t, 'vendor', 'epic', 'oracle', 'meditech', 'sidecar', 'ehr', 'environment')) return result('vendors');
  if (RANKING.test(t) && has(t, 'area', 'zip', 'region', 'neighbo', 'place', 'location', 'where')) return result('area_ranking');
  if (RANKING.test(t) && has(t, 'hospital', 'facilit', 'site', 'clinic', 'which one')) return result('facility_ranking');
  if (has(t, 'hospital', 'facilit', 'site', 'clinic', 'medical center')) return result('facilities');
  if (has(t, 'zip', 'area', 'geograph', 'where is', 'where are', 'spreading', 'spread', 'location', 'region', 'neighbo', 'county', 'map')) return result('geography');
  if (has(t, 'trend', 'over time', 'increasing', 'decreasing', 'going up', 'getting worse', 'getting better', 'trajectory', 'pattern')) return result('trend');
  if (has(t, 'positiv', 'positive rate', 'percent positive', 'how many positive', 'positives')) return result('positivity');
  if (has(t, 'volume', 'how many tests', 'number of tests', 'tests were', 'test count', 'testing')) return result('volume');
  if (has(t, 'persist', 'how long', 'consecutive', 'how many days')) return result('persistence');
  if (has(t, 'alert', 'notification', 'signals', 'warning')) return result('alerts');
  if (has(t, 'observation', 'lab data', 'laboratory data', 'records', 'lab results', 'laboratory results', 'which tests', 'what tests', 'test types')) return result('observations');
  if (has(t, 'report')) return result('reports');
  if (has(t, 'architecture', 'backend', 'database', 'real data', 'real hospital', 'live data', 'connected to', 'is this real', 'tech stack', 'built with')) return result('architecture');
  if (has(t, 'simulation', 'next day', 'previous day', 'change the day', 'change day', 'autoplay', 'play the')) return result('simulation_help');
  if (has(t, 'severity', 'how severe')) return result('current_score');
  if (has(t, 'score', 'composite', 'signal level', 'how high')) return result('current_score');
  if (has(t, 'what is labsentinel', 'what is lab sentinel', 'about labsentinel', 'how does labsentinel work', 'what does labsentinel do', 'who is labsentinel for', 'who is it for', 'labsentinel', 'what is this app', 'what is this')) return result('about');
  if (base.day) return result('day_overview');

  return DOMAIN.some((d) => t.includes(d)) ? result('unsupported') : result('out_of_scope');
};
