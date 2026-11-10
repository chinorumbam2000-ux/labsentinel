/**
 * Roella — answers.
 *
 * Every number comes from factsForDay(), i.e. from the same data and
 * functions that render the Dashboard, Map, Hospitals, Signals and Analytics
 * pages, for the data source the app is running on. Product explanations come
 * from knowledge.ts and depend on that data source. Nothing is sent anywhere,
 * and when the data cannot support an answer Roella says so instead of guessing.
 */
import { formatPercent, formatPercentagePoints, formatSimulationDate } from '../lib/format';
import { SCORE_DISCLAIMER_TEXT, withProductName } from '../lib/brand';
import type { Severity, SimulationDay } from '../types';
import { factsForDay, LAB_TESTS, MINIMUM_DISPLAY_COUNT, SYNDROME, type DayFacts } from './context';
import { normalize, parseQuestion, type ParsedQuestion } from './intents';
import {
  buildStatement,
  CONCEPTS,
  CONFIDENCE_COMPONENTS,
  fhirInThisBuild,
  MEDICAL_ADVICE,
  NAVIGATION,
  NOT_ENOUGH,
  OUT_OF_SCOPE,
  PAGE_QUESTIONS,
  PAGES,
  pageUnavailable,
  PRODUCT,
  SCORE_COMPONENTS,
  SEVERITY_BANDS,
  smartInThisBuild,
} from './knowledge';
import type { AnswerBlock, AssistantAnswer, AssistantContext, ConversationState, IntentId } from './types';
import { answerProfileIntent, profileScoreExplanation } from './profiles';
import { answerLiveIntent } from './live';
import { answerModeIntent } from './modes';
import { PROFILE_BY_ID, RVS_PROFILE_ID } from '../lib/profiles/registry';

const SEVERITY_ORDER: Severity[] = ['Low', 'Watch', 'Moderate', 'High', 'Critical'];
const TOTAL_SITES = 3;

const text = (value: string): AnswerBlock => ({ kind: 'text', text: value });
const list = (items: string[], title?: string): AnswerBlock => ({ kind: 'list', items, ...(title ? { title } : {}) });
const metrics = (items: Array<[string, string]>): AnswerBlock => ({ kind: 'metrics', items: items.map(([label, value]) => ({ label, value })) });
const answer = (intent: IntentId, blocks: AnswerBlock[], followUps: string[] = []): AssistantAnswer => ({ intent, blocks, followUps: followUps.slice(0, 3) });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const joinAnd = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const dayName = (f: DayFacts) => `Day ${f.day} (${f.scenario.stage}, ${formatSimulationDate(f.scenario.simulationDate)})`;
const facilityPositivity = (rate: number) => `${rate.toFixed(1)}%`; // as the Hospitals page formats it

/** A note when the question is about a day the replay has not reached yet. */
const aheadNote = (day: SimulationDay, ctx: AssistantContext): AnswerBlock[] =>
  day > ctx.day ? [text(`Note: Day ${day} is ahead of the current replay day (Day ${ctx.day}).`)] : [];

const modeOf = (ctx: AssistantContext) => ctx.dataMode ?? 'local';

const factsFor = (day: SimulationDay, ctx: AssistantContext) =>
  factsForDay(day, { alerts: day === ctx.day ? ctx.alerts : undefined, days: ctx.days });

const affectedHospitalNames = (f: DayFacts) => f.hospitals.filter((h) => h.isAffected).map((h) => h.hospital.name);
const affectedZips = (f: DayFacts) => f.areas.filter((a) => a.isAffected).map((a) => a.zipCode);

const keyMetrics = (f: DayFacts): AnswerBlock =>
  metrics([
    ['Composite score', `${f.score.composite} (${f.score.severity})`],
    ['Tests', String(f.scenario.totalTests)],
    ['Positivity', f.positivityText],
    ['Affected facilities', `${f.scenario.affectedHospitals.length} of ${TOTAL_SITES}`],
    ['Affected areas', `${f.scenario.affectedZipCodes.length} of ${TOTAL_SITES}`],
    ['Persistence', plural(f.scenario.persistenceDays, 'day')],
    ['Data Confidence', `${f.confidence.score} (${f.confidence.level})`],
  ]);

/* ----------------------------------------------------------------------- */

const greeting = (ctx: AssistantContext): AssistantAnswer => {
  // Live Surveillance: the live clock, never the replay's day or score.
  if (ctx.live) {
    return answer('greeting', [
      text(`I'm Roella, the ProbeSyQ intelligence assistant. I answer from the data on screen: right now that is Live Surveillance, at ${ctx.live.clock} on the simulated clock.`),
      text('Ask what just changed, which profiles need attention, whether the sources are active, what is driving a signal, or how Signal by ProbeSyQ works.'),
    ], LIVE_STARTERS);
  }
  const f = factsFor(ctx.day, ctx);
  return answer('greeting', [
    text(`I'm Roella, the ProbeSyQ intelligence assistant. I answer from the data on screen: right now that is Day ${f.day}, with a Composite Outbreak Signal Score of ${f.score.composite} (${f.score.severity}).`),
    text('Ask about the signal, what changed, facilities, ZIP codes, trends, Data Confidence, or how Signal by ProbeSyQ works.'),
  ], PAGE_QUESTIONS[ctx.route]);
};

const about = (ctx: AssistantContext): AssistantAnswer =>
  answer('about', [
    text(`${PRODUCT.what} ${PRODUCT.who}`),
    list(PRODUCT.workflow, 'Core workflow'),
    text(buildStatement(modeOf(ctx))),
  ], ['How does the Composite Outbreak Signal Score work?', 'What does this page show?', 'What is FHIR?']);

const currentScore = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  return answer('current_score', [
    text(`On ${dayName(f)}, the Composite Outbreak Signal Score is ${f.score.composite} out of 100, which is ${f.score.severity}.`),
    keyMetrics(f),
    text('Data Confidence is shown beside the score but is never part of it.'),
    ...aheadNote(f.day, ctx),
  ], ['Why is the score this high?', 'What changed since the previous day?', 'How does the Composite Outbreak Signal Score work?']);
};

const bandFor = (severity: Severity) => SEVERITY_BANDS.find((b) => b.label === severity);

const scoreExplanation = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  let day = p.day;
  const blocks: AnswerBlock[] = [];
  if (!day && p.quotedScore !== undefined) {
    const match = ([1, 2, 3, 4, 5] as SimulationDay[]).find((d) => factsFor(d, ctx).score.composite === p.quotedScore);
    if (match) day = match;
  }
  const f = factsFor(day ?? ctx.day, ctx);
  if (p.quotedScore !== undefined && p.quotedScore !== f.score.composite) {
    blocks.push(text(`The score on Day ${f.day} is ${f.score.composite}, not ${p.quotedScore}.`));
  } else if (day && day !== ctx.day) {
    blocks.push(text(`That is Day ${day}'s score; the app is currently showing Day ${ctx.day}.`));
  }
  const band = bandFor(f.score.severity);
  if (f.score.composite === 0) {
    blocks.push(text(`On ${dayName(f)} every component is at baseline, so the score is 0 (${f.score.severity}): no elevated volume, positivity, facilities, areas or persistence.`));
  } else {
    blocks.push(text(`On ${dayName(f)} the score is ${f.score.composite} (${f.score.severity}${band ? `; ${f.score.severity} covers ${band.from}–${band.to}` : ''}). It is the sum of five weighted components:`));
  }
  const parts = [...f.score.components].sort((a, b) => b.points - a.points);
  blocks.push(list(parts.map((c) => `${c.label}: ${c.points} of ${c.maxPoints} points — ${c.evidence}`)));
  if (f.score.composite > 0) {
    const top = parts.filter((c) => c.points > 0).slice(0, 2).map((c) => c.label);
    blocks.push(text(`The largest contributions come from ${joinAnd(top)}.`));
  }
  blocks.push(...aheadNote(f.day, ctx));
  return answer('score_explanation', blocks, ['What changed since the previous day?', 'How does the Composite Outbreak Signal Score work?', 'What should I investigate next?']);
};

const scoreMethod = (ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(ctx.day, ctx);
  return answer('score_method', [
    text('The Composite Outbreak Signal Score (0–100) adds five components. Each is first scaled to 0–100 against baseline, then weighted:'),
    list(SCORE_COMPONENTS.map((c) => `${c.label} — up to ${Math.round(c.weight * 100)} points: ${c.measures}`)),
    list(SEVERITY_BANDS.map((b) => `${b.label}: ${b.from}–${b.to}`), 'Severity bands'),
    text(`Today (Day ${f.day}) the components add up to ${f.score.composite} (${f.score.severity}). Data Confidence is calculated separately and never changes the score. ${SCORE_DISCLAIMER_TEXT}`),
  ], ['Why is the score this high?', 'What does Data Confidence mean?', 'What changed since the previous day?']);
};

const severityLevels = (ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(ctx.day, ctx);
  return answer('severity_levels', [
    text('Severity is the band the Composite Outbreak Signal Score falls in:'),
    list(SEVERITY_BANDS.map((b) => `${b.label}: ${b.from}–${b.to}`)),
    text(`On Day ${f.day} the score is ${f.score.composite}, so the signal is ${f.score.severity}.`),
  ], ['When did the signal become Critical?', 'Why is the score this high?']);
};

const dayChange = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const to = p.range?.to ?? p.day ?? ctx.day;
  const from = (p.range?.from ?? to - 1) as SimulationDay;
  if (to === 1 || from < 1) {
    const f = factsFor(1, ctx);
    return answer('day_change', [
      text(`Day 1 is the baseline (${f.scenario.stage}); there is no earlier day to compare with. ${withProductName(f.scenario.description)}`),
      keyMetrics(f),
    ], ['What changed from Day 1 to Day 2?', 'What happens on Day 1?']);
  }
  const a = factsFor(from, ctx);
  const b = factsFor(to as SimulationDay, ctx);
  const blocks: AnswerBlock[] = [];
  if (to - from === 1) {
    // Exactly the comparison the Dashboard's day-to-day section shows.
    blocks.push(text(`From Day ${from} to Day ${to} (${b.scenario.stage}): ${b.dayOverDay.explanation}`));
    blocks.push(list(b.dayOverDay.metrics.map((m) => `${m.label}: ${m.previous} → ${m.current} (${m.delta})`)));
  } else {
    const delta = (x: number, y: number, unit = '') => `${y - x >= 0 ? '+' : ''}${y - x}${unit}`;
    blocks.push(text(`From Day ${from} (${a.scenario.stage}) to Day ${to} (${b.scenario.stage}):`));
    blocks.push(list([
      `Composite Outbreak Signal Score: ${a.score.composite} → ${b.score.composite} (${delta(a.score.composite, b.score.composite)})`,
      `Tests: ${a.scenario.totalTests} → ${b.scenario.totalTests} (${delta(a.scenario.totalTests, b.scenario.totalTests)})`,
      `Positivity: ${a.positivityText} → ${b.positivityText} (${formatPercentagePoints(b.scenario.positivityRate - a.scenario.positivityRate)})`,
      `Affected facilities: ${a.scenario.affectedHospitals.length} → ${b.scenario.affectedHospitals.length}`,
      `Affected geographic areas: ${a.scenario.affectedZipCodes.length} → ${b.scenario.affectedZipCodes.length}`,
      `Persistence: ${plural(a.scenario.persistenceDays, 'day')} → ${plural(b.scenario.persistenceDays, 'day')}`,
    ]));
  }
  if (a.score.severity !== b.score.severity) blocks.push(text(`Severity moved from ${a.score.severity} to ${b.score.severity}.`));
  const newSites = b.hospitals.filter((h) => h.isAffected && !a.hospitals.find((x) => x.hospital.id === h.hospital.id)?.isAffected).map((h) => h.hospital.name);
  if (newSites.length) blocks.push(text(`Newly affected: ${joinAnd(newSites)}.`));
  blocks.push(...aheadNote(b.day, ctx));
  return answer('day_change', blocks, ['Why is the score this high?', 'Which facilities are affected?', 'What should I investigate next?']);
};

const dayOverview = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  return answer('day_overview', [
    text(`${dayName(f)}: ${withProductName(f.scenario.description)}`),
    keyMetrics(f),
    ...aheadNote(f.day, ctx),
  ], [f.day > 1 ? `What changed from Day ${f.day - 1} to Day ${f.day}?` : 'What changed from Day 1 to Day 2?', 'Why is the score this high?']);
};

const situationSummary = (ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(ctx.day, ctx);
  const s = f.scenario;
  if (f.score.composite === 0) {
    return answer('situation_summary', [
      text(`${dayName(f)} shows no outbreak signal: the Composite Outbreak Signal Score is 0 (${f.score.severity}). ${s.totalTests} tests were reported with ${f.positivityText} positivity, at baseline, and no facility or area is elevated. Data Confidence is ${f.confidence.level} (${f.confidence.score}).`),
    ], ['What changed from Day 1 to Day 2?', 'What does Data Confidence mean?']);
  }
  const sites = affectedHospitalNames(f);
  const zips = affectedZips(f);
  const unack = f.alerts.filter((a) => a.status !== 'Acknowledged').length;
  const sentences = [
    `${dayName(f)} shows a ${f.score.severity} regional signal with a Composite Outbreak Signal Score of ${f.score.composite}.`,
    `Test volume is ${s.totalTests} (${f.score.volumeIncreasePercent >= 0 ? '+' : ''}${Math.round(f.score.volumeIncreasePercent)}% against baseline) and positivity is ${f.positivityText} (${formatPercentagePoints(f.score.positivityDeltaPoints)} above baseline).`,
    `${sites.length} of ${TOTAL_SITES} facilities ${sites.length === 1 ? 'is' : 'are'} affected (${joinAnd(sites)}) across ${plural(zips.length, 'surveillance area')} (${joinAnd(zips)}), and the signal has persisted for ${plural(s.persistenceDays, 'consecutive day')}.`,
    `Data Confidence is ${f.confidence.level} (${f.confidence.score}), so the signal is well supported by the data${f.alerts.length ? `; ${plural(f.alerts.length, 'alert')} ${f.alerts.length === 1 ? 'is' : 'are'} on record${ctx.alerts && f.day === ctx.day ? ` (${unack} awaiting acknowledgement)` : ''}` : ''}.`,
  ];
  if (f.confidence.level !== 'Very High' && f.confidence.level !== 'High') sentences[3] = `Data Confidence is ${f.confidence.level} (${f.confidence.score}): ${f.confidence.explanation}`;
  return answer('situation_summary', [text(sentences.join(' '))], ['What should I investigate next?', 'Why is the score this high?', 'What changed since the previous day?']);
};

const facilities = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  const affected = f.hospitals.filter((h) => h.isAffected);
  const others = f.hospitals.filter((h) => !h.isAffected);
  // Positive counts and rates as the Facilities page shows them: withheld under 5.
  const shown = (h: (typeof f.hospitals)[number]) => f.facilityCounts.find((c) => c.hospitalId === h.hospital.id)!;
  const row = (h: (typeof f.hospitals)[number]) =>
    `${h.hospital.name} (${h.hospital.zipCode}, ${h.hospital.environmentLabel}) — positivity ${shown(h).positivityDisplay}, ${shown(h).positivesDisplay} of ${h.totalTests} tests positive, ${h.severity}${h.firstSignalDay ? `, signalling since Day ${h.firstSignalDay}` : ''}`;
  const blocks: AnswerBlock[] = [];
  if (!affected.length) {
    blocks.push(text(`On Day ${f.day} no facility is above the detection margin; all ${TOTAL_SITES} are at baseline.`));
  } else {
    blocks.push(text(`On Day ${f.day}, ${affected.length} of ${TOTAL_SITES} participating facilities ${affected.length === 1 ? 'is' : 'are'} contributing to the signal:`));
    blocks.push(list(affected.map(row)));
  }
  if (others.length && affected.length) blocks.push(list(others.map(row), 'Not currently affected'));
  if (f.facilityCounts.some((c) => c.suppressed)) {
    blocks.push(text(`"<5" means fewer than ${MINIMUM_DISPLAY_COUNT} positive results: the exact count is withheld to reduce re-identification risk.`));
  }
  blocks.push(...aheadNote(f.day, ctx));
  return answer('facilities', blocks, ['Which one has the highest positivity?', 'What vendor environment does each facility represent?', 'Which ZIP codes are affected?']);
};

const facilityRanking = (p: ParsedQuestion, ctx: AssistantContext, state: ConversationState): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  const t = p.normalized;
  const onlyAffected = state.lastTopic === 'facilities' && f.hospitals.some((h) => h.isAffected);
  const pool = onlyAffected ? f.hospitals.filter((h) => h.isAffected) : f.hospitals;
  const byVolume = /\b(volume|tests|testing)\b/.test(t) && !/\bpositive/.test(t);
  const lowest = /\b(lowest|least)\b/.test(t);
  // Positive counts and positivity are compared only where the Facilities page shows them.
  const hiddenPool = byVolume ? [] : pool.filter((h) => f.facilityCounts.find((c) => c.hospitalId === h.hospital.id)?.suppressed);
  if (hiddenPool.length) {
    const visible = pool.filter((h) => !hiddenPool.includes(h));
    const shownRate = (h: (typeof pool)[number]) => f.facilityCounts.find((c) => c.hospitalId === h.hospital.id)!.positivityDisplay;
    return answer('facility_ranking', [
      text(`The facilities cannot be ranked by positives or positivity on Day ${f.day} from the displayed data: ${joinAnd(hiddenPool.map((h) => h.hospital.name))} ${hiddenPool.length === 1 ? 'reports' : 'report'} fewer than ${MINIMUM_DISPLAY_COUNT} positive results, which are withheld, so ${hiddenPool.length === 1 ? 'its' : 'their'} position cannot be shown without revealing ${hiddenPool.length === 1 ? 'it' : 'them'}.`),
      ...(visible.length ? [list(visible.map((h) => `${h.hospital.name}: ${shownRate(h)} positivity (${h.severity})`), 'Shown on the Facilities page')] : []),
      text('Facilities can be compared by test volume, which is never withheld.'),
      ...aheadNote(f.day, ctx),
    ], ['Which facility has the highest test volume?', 'Why are some counts shown as <5?']);
  }
  const metric = (h: (typeof pool)[number]) => (byVolume ? h.totalTests : h.positivityRate);
  const sorted = [...pool].sort((a, b) => (lowest ? metric(a) - metric(b) : metric(b) - metric(a)));
  const top = sorted[0];
  const tied = sorted.filter((h) => metric(h) === metric(top));
  const show = (h: (typeof pool)[number]) => (byVolume ? `${h.totalTests} tests` : `${facilityPositivity(h.positivityRate)} positivity`);
  const basis = byVolume ? 'test volume' : 'positivity';
  const blocks: AnswerBlock[] = [
    text(`${tied.length > 1 ? `${joinAnd(tied.map((h) => h.hospital.name))} are tied` : `${top.hospital.name} has the ${lowest ? 'lowest' : 'highest'}`} ${basis}${onlyAffected ? ' among the affected facilities' : ''} on Day ${f.day} (${show(top)}).`),
    list(sorted.map((h) => `${h.hospital.name}: ${show(h)} (${h.severity})`), `Ranked by ${basis}, as shown on the Hospitals page`),
  ];
  if (/\b(worst|most affected|most severe)\b/.test(t)) blocks.push(text('"Worst" here means highest positivity on the day; Signal by ProbeSyQ does not rank facilities in any other way.'));
  return answer('facility_ranking', [...blocks, ...aheadNote(f.day, ctx)], ['Which ZIP codes are affected?', 'What should I investigate next?']);
};

const vendors = (ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(ctx.day, ctx);
  return answer('vendors', [
    text('Each facility represents a different simulated EHR environment:'),
    list(f.hospitals.map((h) => `${h.hospital.name} (${h.hospital.zipCode}) — ${h.hospital.environmentLabel}`)),
    text(`${CONCEPTS.vendorAgnostic} The sidecar appears inside each environment on the Hospitals page.`),
  ], ['What is SMART on FHIR?', 'Which facilities are affected?']);
};

const geography = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  const affected = f.areas.filter((a) => a.isAffected);
  const row = (a: (typeof f.areas)[number]) =>
    `${a.zipCode} ${a.city} (${a.hospitalName}) — ${a.positivesDisplay} positive, positivity ${a.positivityDisplay}, ${a.severity}, trend ${a.trend}`;
  const blocks: AnswerBlock[] = [];
  if (!affected.length) {
    blocks.push(text(`On Day ${f.day} no surveillance area is affected.`));
  } else {
    blocks.push(text(`On Day ${f.day}, ${affected.length} of ${TOTAL_SITES} surveillance areas ${affected.length === 1 ? 'is' : 'are'} affected:`));
    blocks.push(list(affected.map(row)));
    if (f.day > 1 && /spread|spreading|where/.test(p.normalized)) {
      const before = factsFor((f.day - 1) as SimulationDay, ctx).areas.filter((a) => a.isAffected).map((a) => a.zipCode);
      const fresh = affected.filter((a) => !before.includes(a.zipCode)).map((a) => `${a.zipCode} ${a.city}`);
      blocks.push(text(fresh.length ? `Newly affected since Day ${f.day - 1}: ${joinAnd(fresh)}.` : `No new area since Day ${f.day - 1}; the signal is intensifying within the same ${plural(affected.length, 'area')}.`));
    }
  }
  blocks.push(text(f.disclosure));
  blocks.push(...aheadNote(f.day, ctx));
  return answer('geography', blocks, ['Which area is most affected?', 'Why are some counts shown as <5?', 'Which facilities are affected?']);
};

const areaRanking = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  const shown = f.areas.filter((a) => a.positivityValue !== null);
  const hidden = f.areas.filter((a) => a.positivityValue === null);
  if (!shown.length) {
    return answer('area_ranking', [
      text(`On Day ${f.day} every area's count is below the display threshold of ${MINIMUM_DISPLAY_COUNT}, so area-level figures are suppressed and areas cannot be compared. ${f.disclosure}`),
    ], ['Why are some counts shown as <5?', 'What is the positivity rate?']);
  }
  const sorted = [...shown].sort((a, b) => (b.positivityValue ?? 0) - (a.positivityValue ?? 0));
  const top = sorted[0];
  // A suppressed area could rank anywhere: naming a "most affected" area would imply its hidden value.
  const blocks: AnswerBlock[] = hidden.length
    ? [
        text(`A complete ranking of areas on Day ${f.day} cannot be made from the displayed data: ${joinAnd(hidden.map((a) => a.zipCode))} ${hidden.length === 1 ? 'is' : 'are'} suppressed (fewer than ${MINIMUM_DISPLAY_COUNT} positives), so ${hidden.length === 1 ? 'its' : 'their'} position is not shown.`),
        list(sorted.map((a) => `${a.zipCode} ${a.city}: ${a.positivityDisplay} (${a.severity})`), 'Areas shown on the Map'),
      ]
    : [
        text(`By positivity, the most affected area on Day ${f.day} is ${top.zipCode} ${top.city} (${top.hospitalName}): ${top.positivityDisplay}, ${top.positivesDisplay} positive, ${top.severity}.`),
        list(sorted.map((a) => `${a.zipCode} ${a.city}: ${a.positivityDisplay} (${a.severity})`)),
      ];
  return answer('area_ranking', [...blocks, ...aheadNote(f.day, ctx)], ['Which facilities are affected?', 'What should I investigate next?']);
};

const positivity = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  return answer('positivity', [
    text(`Positivity is the share of tests that came back positive. On Day ${f.day} regional positivity is ${f.positivityText}: ${f.scenario.totalPositives} positive out of ${f.scenario.totalTests} tests, ${formatPercentagePoints(f.score.positivityDeltaPoints)} against baseline.`),
    list(f.hospitals.map((h) => `${h.hospital.name}: ${facilityPositivity(h.positivityRate)}`), 'By facility'),
    ...aheadNote(f.day, ctx),
  ], ['Is positivity increasing?', 'Which facility has the highest positivity?']);
};

const volume = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  const prev = f.day > 1 ? factsFor((f.day - 1) as SimulationDay, ctx) : null;
  return answer('volume', [
    text(`On Day ${f.day}, ${f.scenario.totalTests} respiratory tests were reported (${f.score.volumeIncreasePercent >= 0 ? '+' : ''}${Math.round(f.score.volumeIncreasePercent)}% against the baseline)${prev ? `, compared with ${prev.scenario.totalTests} on Day ${prev.day}` : ''}. ${f.observations.cumulative} laboratory observations have been received from Day 1 to Day ${f.day}.`),
    list(f.hospitals.map((h) => `${h.hospital.name}: ${h.totalTests} tests`), 'By facility'),
    ...aheadNote(f.day, ctx),
  ], ['Is test volume increasing?', 'What is the positivity rate?']);
};

const trend = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  const t = p.normalized;
  const series = f.trend;
  const kind = /positiv/.test(t) ? 'positivity' : /volume|tests|testing/.test(t) ? 'volume' : /area|zip|geograph|spread/.test(t) ? 'areas' : 'score';
  const values = series.map((pt) => (kind === 'positivity' ? pt.positivity : kind === 'volume' ? pt.tests : kind === 'areas' ? pt.affectedZips : pt.score));
  const show = (v: number) => (kind === 'positivity' ? formatPercent(v) : String(v));
  const label = { positivity: 'Positivity', volume: 'Test volume', areas: 'Affected areas', score: 'Composite score' }[kind];
  if (series.length < 2) {
    return answer('trend', [text(`Only Day 1 has been reached so far, so there is no trend yet: ${label.toLowerCase()} is ${show(values[0])}. Advance the replay to build the trend.`)], ['What happens on Day 1?']);
  }
  const rising = values.every((v, i) => i === 0 || v >= values[i - 1]);
  const strictly = values.every((v, i) => i === 0 || v > values[i - 1]);
  const direction = strictly ? 'has risen every day' : rising ? 'has risen or held steady each day' : 'has not moved in one direction';
  return answer('trend', [
    text(`${label} ${direction} from Day 1 to Day ${f.day}: ${show(values[0])} → ${show(values[values.length - 1])}.`),
    list(series.map((pt, i) => `Day ${pt.day} (${pt.stage}): ${show(values[i])}`)),
    text('The Analytics page charts these trends day by day.'),
  ], ['When did the signal become High?', 'Is positivity increasing?', 'Is test volume increasing?']);
};

const milestone = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const target = p.severity ?? (/start|first signal|begin|began/.test(p.normalized) ? 'Watch' : 'Critical');
  const rank = SEVERITY_ORDER.indexOf(target);
  const now = factsFor(ctx.day, ctx);
  const reached = now.trend.find((pt) => SEVERITY_ORDER.indexOf(factsFor(pt.day as SimulationDay, ctx).score.severity) >= rank);
  if (!reached) {
    return answer('milestone', [
      text(`Not yet. By the current replay day (Day ${ctx.day}) the signal is ${now.score.severity} with a score of ${now.score.composite}; it has not reached ${target}. Advance the replay to see how it develops.`),
    ], ['What changed since the previous day?', 'What trend do you see?']);
  }
  const f = factsFor(reached.day as SimulationDay, ctx);
  const exact = f.score.severity === target ? '' : ` (it went straight to ${f.score.severity})`;
  return answer('milestone', [
    text(`The signal first reached ${target} on ${dayName(f)}, with a score of ${f.score.composite}${exact}.`),
    list(now.trend.map((pt) => `Day ${pt.day}: ${pt.score} (${factsFor(pt.day as SimulationDay, ctx).score.severity})`), 'Score by day so far'),
  ], ['Why is the score this high?', 'What changed since the previous day?']);
};

const persistence = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  const comp = f.score.components.find((c) => c.key === 'persistence');
  return answer('persistence', [
    text(`Persistence counts consecutive days with activity above baseline. On Day ${f.day} it is ${plural(f.scenario.persistenceDays, 'day')}, contributing ${comp?.points ?? 0} of ${comp?.maxPoints ?? 10} points (${comp?.evidence ?? ''}).`),
  ], ['Why is the score this high?', 'What trend do you see?']);
};

const confidence = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  // Live Surveillance: the live source telemetry, exactly as the Dashboard shows it.
  const c = ctx.live ? ctx.live.dataConfidence : f.confidence;
  const t = p.normalized;
  const blocks: AnswerBlock[] = [];
  if (/affect|part of|change|influence|combined|included|count toward/.test(t)) {
    blocks.push(text('No. Data Confidence never changes the Composite Outbreak Signal Score. The score says how concerning the signal is; Data Confidence says how far the data behind it can be trusted. They are calculated separately and shown side by side.'));
  } else {
    blocks.push(text('Data Confidence (0–100) measures how trustworthy the underlying data is, separately from how severe the signal is. It combines five components:'));
    blocks.push(list(CONFIDENCE_COMPONENTS.map((x) => `${x.label} — up to ${Math.round(x.weight * 100)} points`)));
  }
  const reporting = /reporting/i.test(c.explanation) ? '' : ` ${c.facilitiesReporting} of ${c.facilitiesTotal} facilities are reporting.`;
  blocks.push(text(`${ctx.live ? `Now (${ctx.live.clock}, simulated time)` : `On Day ${f.day}`} it is ${c.score} (${c.level}): ${c.explanation}${reporting}`));
  if (/why|low|high|weak/.test(t)) {
    blocks.push(list(c.components.map((x) => `${x.label}: ${x.points} of ${x.maxPoints} — ${x.evidence}`), 'Components today'));
    const lost = (x: (typeof c.components)[number]) => x.maxPoints - x.points;
    const most = Math.max(...c.components.map(lost));
    const weakest = c.components.filter((x) => lost(x) === most).map((x) => x.label);
    if (most > 0) {
      blocks.push(text(weakest.length === 1
        ? `The most points are lost on ${weakest[0]} (${most} of its ${c.components.find((x) => x.label === weakest[0])?.maxPoints}).`
        : `${joinAnd(weakest)} each fall ${plural(most, 'point')} short of full marks; the rest are full.`));
    }
  }
  return answer('confidence', [...blocks, ...(ctx.live ? [] : aheadNote(f.day, ctx))], ['Does Data Confidence affect the score?', 'Why is the score this high?']);
};

const alerts = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  if (!f.alerts.length) {
    return answer('alerts', [text(`No alerts have been detected by Day ${f.day}; regional activity is at baseline.`)], ['What changed from Day 1 to Day 2?']);
  }
  const live = Boolean(ctx.alerts) && f.day === ctx.day;
  return answer('alerts', [
    text(`${plural(f.alerts.length, 'alert')} ${f.alerts.length === 1 ? 'has' : 'have'} been detected by Day ${f.day}:`),
    list(f.alerts.map((a) => `${a.title} — first detected Day ${a.detectedDay}, ${a.detection.severity}${live ? `, ${a.status}` : ''}`)),
    text('Open Signals to acknowledge them and investigate the regional signal.'),
  ], ['What should I investigate next?', 'Why is the score this high?']);
};

const observations = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(p.day ?? ctx.day, ctx);
  return answer('observations', [
    text(`Laboratory Data lists the synthetic FHIR-style Observation records: ${f.observations.day} received on Day ${f.day} and ${f.observations.cumulative} from Day 1 to Day ${f.day}. All are ${SYNDROME} tests:`),
    list(LAB_TESTS.map((t) => `${t.name} — LOINC ${t.loincCode}`)),
    text('Open Laboratory Data to search, filter and sort them.'),
  ], ['What is the positivity rate?', 'What is LOINC?']);
};

const privacy = (ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(ctx.day, ctx);
  return answer('privacy', [
    text(`To protect privacy, an area's count is shown only when it reaches ${MINIMUM_DISPLAY_COUNT}; smaller counts appear as "<${MINIMUM_DISPLAY_COUNT}" and are rolled up to county level. This is an illustrative rule, not an official legal threshold.`),
    text(`Day ${f.day}: ${f.disclosure}`),
  ], ['Which ZIP codes are affected?']);
};

const investigate = (ctx: AssistantContext): AssistantAnswer => {
  const f = factsFor(ctx.day, ctx);
  const steps: string[] = [];
  if (f.score.composite === 0) {
    steps.push('No signal today: keep routine monitoring and confirm all facility feeds stay healthy on Facilities.');
    steps.push('Review Data Confidence to make sure the quiet baseline reflects complete data.');
  } else {
    const newSites = f.hospitals.filter((h) => h.firstSignalDay === f.day).map((h) => h.hospital.name);
    const top = [...f.hospitals].filter((h) => h.isAffected).sort((a, b) => b.positivityRate - a.positivityRate)[0];
    const regional = f.alerts.find((a) => a.kind === 'regional');
    const unack = f.alerts.filter((a) => a.status !== 'Acknowledged');
    if (regional) steps.push(`Open the regional signal on Signals and work through its investigation (${regional.title}, detected Day ${regional.detectedDay}).`);
    if (ctx.alerts && unack.length) steps.push(`Acknowledge ${plural(unack.length, 'alert')} still awaiting review.`);
    if (newSites.length) steps.push(`Review the newly affected ${newSites.length === 1 ? 'facility' : 'facilities'}: ${joinAnd(newSites)}.`);
    if (top) steps.push(`Compare positivity across facilities: ${top.hospital.name} is highest at ${facilityPositivity(top.positivityRate)}.`);
    steps.push(`Inspect geographic spread on the Outbreak Map (${plural(f.scenario.affectedZipCodes.length, 'area')} affected).`);
    steps.push(`Confirm persistence: the signal has lasted ${plural(f.scenario.persistenceDays, 'consecutive day')}; check the trend on Analytics.`);
    steps.push('Review the underlying laboratory observations on Laboratory Data.');
  }
  steps.push(`Check Data Confidence (${f.confidence.score}, ${f.confidence.level}) before acting on the signal.`);
  return answer('investigate', [
    text(`Suggested surveillance review for Day ${f.day} (${f.score.severity}, score ${f.score.composite}):`),
    list(steps.slice(0, 6)),
    text('These are surveillance review steps, not clinical advice.'),
  ], ['Which facilities are affected?', 'Which ZIP codes are affected?', 'Summarize the current outbreak situation.']);
};

const navigation = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const target = NAVIGATION.find((n) => n.words.some((w) => p.normalized.includes(w)));
  const smart = Boolean(ctx.smartEnabled);
  if (!target) {
    const available = Object.values(PAGES).filter((pg) => !pageUnavailable(pg, modeOf(ctx), smart));
    const system = available.filter((pg) => pg.section === 'System').map((pg) => pg.nav);
    return answer('navigation', [
      text('Use the sidebar on the left to move between screens:'),
      list(available.filter((pg) => !pg.section).map((pg) => `${pg.nav} — ${pg.shows}`)),
      text(`Technical pages are under System, at the bottom of the sidebar: ${joinAnd(system)}.`),
    ], ['What does this page show?']);
  }
  const page = PAGES[target.route];
  const unavailable = pageUnavailable(page, modeOf(ctx), smart);
  const where = page.section ? `${page.section} → ${page.nav}` : page.nav;
  const renamed = target.route === 'simulation' && /simulation/.test(p.normalized);
  return answer('navigation', [
    ...(renamed ? [text(RENAMED)] : []),
    text(`Open ${where} in the sidebar for ${target.what}. ${page.use}`),
    ...(unavailable ? [text(unavailable)] : []),
  ], [`What does the ${page.nav} page show?`]);
};

const pageHelp = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer => {
  const route = p.page ?? ctx.route;
  if (route === 'other') return navigation({ ...p, normalized: '' }, ctx);
  const page = PAGES[route];
  const here = route === ctx.route ? 'This page' : `The ${page.nav} page`;
  const unavailable = pageUnavailable(page, modeOf(ctx), Boolean(ctx.smartEnabled));
  return answer('page_help', [
    text(`${here} (${page.title}) shows ${page.shows} ${page.use}`),
    ...(unavailable ? [text(unavailable)] : []),
  ], PAGE_QUESTIONS[route]);
};

/** Said whenever someone uses the experience's former name. */
const RENAMED = 'Simulation is now called Scenario Replay; the old /simulation address still opens it.';

const simulationHelp = (p: ParsedQuestion, ctx: AssistantContext): AssistantAnswer =>
  ctx.live
    ? answer('simulation_help', [
        ...(/simulation/.test(p.normalized) ? [text(RENAMED)] : []),
        text('Scenario Replay is the secondary, training mode: a controlled historical scenario that steps through a known five-day outbreak sequence. You are in Live Surveillance now, the primary mode; choose Scenario Replay in the sidebar to step through the replay, and Live Surveillance to come back.'),
      ], ['What is the main mode?', 'Why are the dates different?'])
    : answer('simulation_help', [
    ...(/simulation/.test(p.normalized) ? [text(RENAMED)] : []),
    text(`Scenario Replay plays a five-day simulated respiratory outbreak and is currently on Replay Day ${ctx.day} of 5. Use ‹ and › in the top bar to move between replay days, or Reset to return to Day 1; the Scenario Replay page can also play the days in sequence. Every analyst page follows the same replay day.`),
  ], ['What happens on Day 1?', 'What changed since the previous day?']);

const reportsHelp = (): AssistantAnswer =>
  answer('reports', [text(`Reports shows ${PAGES.reports.shows} ${PAGES.reports.use}`)], ['What should I investigate next?']);

const architecture = (ctx: AssistantContext): AssistantAnswer =>
  answer('architecture', [
    text(buildStatement(modeOf(ctx))),
    text(modeOf(ctx) === 'api'
      ? 'In this full-stack mode the React frontend reads a FastAPI backend with a PostgreSQL database. The backend adds development FHIR R4 ingestion, a dynamic surveillance engine with a rolling baseline, and the EWMA and CUSUM statistical detectors. The Architecture page labels what is implemented, what is a prototype and what is planned.'
      : 'In this local mode the whole pipeline runs in your browser. Signal by ProbeSyQ also has a full-stack mode (FastAPI and PostgreSQL) that adds FHIR R4 ingestion, a dynamic surveillance engine and the EWMA and CUSUM detectors; this build does not include it. The Architecture page labels what is implemented, what is a prototype and what is planned.'),
  ], ['What is FHIR?', 'What is SMART on FHIR?', 'How does Signal by ProbeSyQ work?']);

const concept = (intent: 'fhir' | 'smart' | 'loinc' | 'interoperability', ctx: AssistantContext): AssistantAnswer => {
  if (intent === 'fhir') return answer('fhir', [text(CONCEPTS.fhir), text(fhirInThisBuild(modeOf(ctx)))], ['What is SMART on FHIR?', 'What is LOINC?']);
  if (intent === 'smart') return answer('smart', [text(CONCEPTS.smart), text(smartInThisBuild(Boolean(ctx.smartEnabled)))], ['What is FHIR?', 'What vendor environment does each facility represent?']);
  if (intent === 'loinc') {
    return answer('loinc', [text(CONCEPTS.loinc), list(LAB_TESTS.map((t) => `${t.name} — LOINC ${t.loincCode}`), `Tests in this scenario (${SYNDROME})`)], ['What is FHIR?']);
  }
  return answer('interoperability', [text(CONCEPTS.vendorAgnostic), list([CONCEPTS.fhir, CONCEPTS.smart, CONCEPTS.loinc])], ['What is SMART on FHIR?', 'What vendor environment does each facility represent?']);
};

const unsupported = (ctx: AssistantContext): AssistantAnswer =>
  answer('unsupported', [
    text(NOT_ENOUGH),
    text('The scenario covers test volume, positivity, facilities, surveillance areas, persistence, Data Confidence, alerts and trends for the five simulated days. It has no patient demographics, outcomes, hospital capacity or forecasts.'),
  ], PAGE_QUESTIONS[ctx.route]);

/* ----------------------------------------------------------------------- */

/** Intents answered from the narrated scenario's figures. */
const RVS_ONLY_INTENTS: IntentId[] = [
  'day_change', 'day_overview', 'situation_summary', 'facilities', 'facility_ranking', 'geography',
  'area_ranking', 'positivity', 'volume', 'trend', 'milestone', 'persistence', 'alerts', 'investigate',
];

export interface AssistantTurn {
  answer: AssistantAnswer;
  state: ConversationState;
}

export const answerQuestion = (question: string, ctx: AssistantContext, state: ConversationState = {}): AssistantTurn => {
  const p = parseQuestion(question, ctx, state);
  const viewing = ctx.profileId && ctx.profileId !== RVS_PROFILE_ID ? ctx.profileId : null;
  const result = ((): AssistantAnswer => {
    const forMode = answerModeIntent(p.intent, ctx, factsFor(ctx.day, ctx).scenario.simulationDate);
    if (forMode) return forMode;
    const forLive = answerLiveIntent({ intent: p.intent, profiles: p.profiles ?? [], facility: p.facility }, ctx);
    if (forLive) return forLive;
    // Live Surveillance: figures come from the live state, never the replay's.
    if (ctx.live) {
      const focus = ctx.profileId ?? RVS_PROFILE_ID;
      if (p.intent === 'score_explanation' || p.intent === 'current_score') return profileScoreExplanation(focus, ctx);
      if (RVS_ONLY_INTENTS.includes(p.intent)) {
        const status = answerProfileIntent({ intent: 'profile_status', profiles: [focus] }, ctx)!;
        status.blocks.unshift(
          text(`In Live Surveillance, here is ${PROFILE_BY_ID[focus].displayName} on the latest closed day. Ask "What just changed?" for the live feed.`),
        );
        return status;
      }
    }
    const forProfile = answerProfileIntent(
      { intent: p.intent, profiles: p.profiles ?? [], unknown: p.unknownCondition, day: p.day },
      ctx,
    );
    if (forProfile) return forProfile;
    // "Why is this signal high?" is about the profile on screen.
    if (viewing && (p.intent === 'score_explanation' || p.intent === 'current_score')) {
      return profileScoreExplanation(viewing, ctx, p.day);
    }
    switch (p.intent) {
      case 'greeting': return greeting(ctx);
      case 'about': return about(ctx);
      case 'current_score': return currentScore(p, ctx);
      case 'score_explanation': return scoreExplanation(p, ctx);
      case 'score_method': return scoreMethod(ctx);
      case 'severity_levels': return severityLevels(ctx);
      case 'day_change': return dayChange(p, ctx);
      case 'day_overview': return dayOverview(p, ctx);
      case 'situation_summary': return situationSummary(ctx);
      case 'facilities': return facilities(p, ctx);
      case 'facility_ranking': return facilityRanking(p, ctx, state);
      case 'vendors': return vendors(ctx);
      case 'geography': return geography(p, ctx);
      case 'area_ranking': return areaRanking(p, ctx);
      case 'positivity': return positivity(p, ctx);
      case 'volume': return volume(p, ctx);
      case 'trend': return trend(p, ctx);
      case 'milestone': return milestone(p, ctx);
      case 'persistence': return persistence(p, ctx);
      case 'confidence': return confidence(p, ctx);
      case 'alerts': return alerts(p, ctx);
      case 'observations': return observations(p, ctx);
      case 'privacy': return privacy(ctx);
      case 'investigate': return investigate(ctx);
      case 'navigation': return navigation(p, ctx);
      case 'page_help': return pageHelp(p, ctx);
      case 'simulation_help': return simulationHelp(p, ctx);
      case 'reports': return reportsHelp();
      case 'architecture': return architecture(ctx);
      case 'fhir':
      case 'smart':
      case 'loinc':
      case 'interoperability': return concept(p.intent, ctx);
      case 'medical_advice': return answer('medical_advice', [text(MEDICAL_ADVICE)], ['What is the positivity rate?', 'Summarize the current outbreak situation.']);
      case 'unsupported': return unsupported(ctx);
      default: return answer('out_of_scope', [text(OUT_OF_SCOPE)], PAGE_QUESTIONS[ctx.route]);
    }
  })();
  // The remaining figures are the narrated profile's: say so when another is on screen.
  if (viewing && !ctx.live && RVS_ONLY_INTENTS.includes(result.intent)) {
    result.blocks.unshift(
      text(`This answer is about Respiratory Viral Syndrome, the narrated replay. You are viewing ${PROFILE_BY_ID[viewing].displayName}; ask "What is happening with ${PROFILE_BY_ID[viewing].displayName}?" for its figures.`),
    );
  }
  // Never suggest the question that was just asked; in Live Surveillance, never a replay day.
  const asked = normalize(question);
  result.followUps = result.followUps.filter((q) => normalize(q) !== asked && !(ctx.live && REPLAY_DAY.test(q)));
  const topic = result.intent === 'facilities' || result.intent === 'facility_ranking' ? 'facilities'
    : result.intent === 'geography' || result.intent === 'area_ranking' ? 'areas'
    : state.lastTopic;
  const nextState: ConversationState = {
    lastIntent: ['out_of_scope', 'medical_advice', 'unsupported', 'greeting'].includes(result.intent) ? state.lastIntent : result.intent,
    lastTopic: topic,
    lastDay: p.day ?? state.lastDay,
    lastQuestion: ['out_of_scope', 'medical_advice', 'unsupported', 'greeting'].includes(result.intent) ? state.lastQuestion : p.normalized,
  };
  return { answer: result, state: nextState };
};

/** Plain text of an answer (tests, screen-reader summaries). */
export const answerText = (a: AssistantAnswer): string =>
  a.blocks
    .map((b) => (b.kind === 'text' ? b.text : b.kind === 'list' ? [b.title, ...b.items].filter(Boolean).join('\n') : b.items.map((m) => `${m.label}: ${m.value}`).join('\n')))
    .join('\n');

/** "Day 1" and the like belong to Scenario Replay's day-by-day sequence. */
const REPLAY_DAY = /\bday [1-5]\b/i;

/** Live Surveillance starters: about the live feed, never a replay day. The panel shows all of them. */
export const LIVE_STARTERS = [
  'What just changed?',
  'Which profiles need attention?',
  'Are all sources active?',
  'What is driving the selected signal?',
  'Why did the score change?',
];

/** Starter questions for a screen and day (Scenario Replay) or the live feed. */
export const suggestedQuestions = (ctx: AssistantContext): string[] => {
  if (ctx.live) {
    const forPage = PAGE_QUESTIONS[ctx.route].filter((q) => !REPLAY_DAY.test(q));
    return [...new Set([...LIVE_STARTERS, ...forPage])].slice(0, 6);
  }
  const dayAware = ctx.day === 1
    ? ['What happens on Day 1?', 'Summarize the current outbreak situation.']
    : [`What changed from Day ${ctx.day - 1} to Day ${ctx.day}?`, 'Why is the score this high?'];
  const base = [...dayAware, ...PAGE_QUESTIONS[ctx.route], 'What should I investigate next?', 'What does this page show?'];
  return [...new Set(base)].slice(0, 6);
};
