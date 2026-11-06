/**
 * Roella — surveillance-profile questions.
 *
 * Answers come from the same portfolio the Dashboard's Active Surveillance
 * section renders (summarizeProfiles / rankProfiles), so Roella and the
 * screens always agree. Only profiles in the registry are ever named; a
 * question about anything else gets the list of real profiles, never a guess.
 */
import { HOSPITAL_BY_ID } from '../data/hospitals';
import { findDay, signalScoreFor } from '../lib/surveillanceDays';
import { STATUS_LABEL } from '../lib/profiles/derive';
import {
  PROFILES,
  PROFILE_BY_ID,
  RVS_PROFILE_ID,
  TEST_BY_CODE,
  DATA_ORIGIN_LABEL,
  type ProfileId,
} from '../lib/profiles/registry';
import {
  activeSignals,
  countStatuses,
  rankProfiles,
  summarizeProfiles,
  type ProfileSummary,
} from '../lib/profiles/portfolio';
import type { AnswerBlock, AssistantAnswer, AssistantContext, IntentId } from './types';
import { componentEvidence, rateDisplay, regionalPositivePrivacy } from '../lib/profiles/privacy';
import { lowVolumeNote } from '../lib/profiles/display';
import type { SimulationDay } from '../types';

const text = (value: string): AnswerBlock => ({ kind: 'text', text: value });
const list = (items: string[], title?: string): AnswerBlock => ({ kind: 'list', items, ...(title ? { title } : {}) });
const metrics = (items: Array<[string, string]>): AnswerBlock => ({
  kind: 'metrics',
  items: items.map(([label, value]) => ({ label, value })),
});
const answer = (intent: IntentId, blocks: AnswerBlock[], followUps: string[] = []): AssistantAnswer => ({
  intent,
  blocks,
  followUps: followUps.slice(0, 3),
});
const joinAnd = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/* ------------------------------------------------------------------------ *
 * Recognising profiles in a question.
 * ------------------------------------------------------------------------ */

const PROFILE_PATTERNS: Array<[RegExp, ProfileId]> = [
  [/\brespiratory viral syndrome\b|\brespiratory syndrome\b|\brvs\b/, RVS_PROFILE_ID],
  [/\binfluenza\b|\bflu\b/, 'influenza-a'],
  [/\bcovid\b|\bcovid-19\b|\bcovid19\b|\bsars-cov-2\b|\bsars cov 2\b|\bsars\b|\bcoronavirus\b/, 'covid-19'],
  [/\brsv\b|\brespiratory syncytial\b/, 'rsv'],
  [/\bcholera\b|\bvibrio\b/, 'cholera'],
  [/\bgastrointestinal\b|\bgastro\b|\bgi syndrome\b|\bgi\b/, 'gastrointestinal-syndrome'],
];

/** Every profile a question names, in the order they appear. */
export const profilesNamed = (normalized: string): ProfileId[] => {
  const found: Array<{ id: ProfileId; at: number }> = [];
  PROFILE_PATTERNS.forEach(([re, id]) => {
    const match = normalized.match(re);
    if (match && match.index !== undefined && !found.some((f) => f.id === id)) found.push({ id, at: match.index });
  });
  return found.sort((a, b) => a.at - b.at).map((f) => f.id);
};

/** Conditions people may ask about that are not profiles here. */
const NOT_PROFILES =
  /\b(measles|ebola|mpox|monkeypox|dengue|zika|malaria|tuberculosis|tb|polio|norovirus|salmonella|shigella|e coli|hepatitis|hiv|plague|anthrax|typhoid|legionella|pertussis|whooping cough|mumps|rubella|chickenpox|varicella|lyme|rabies|meningitis|h5n1|bird flu|avian influenza|influenza b|flu b|hantavirus|marburg)\b/;

export const unknownConditionNamed = (normalized: string): string | null => normalized.match(NOT_PROFILES)?.[1] ?? null;

const PORTFOLIO_WORDS = ['profile', 'profiles', 'pathogen', 'pathogens', 'diseases', 'syndromes', 'conditions', 'portfolio'];

/**
 * The profile intent a question asks, if any. Returns null to let the
 * general intents handle it.
 */
export const parseProfileIntent = (t: string): { intent: IntentId; profiles: ProfileId[]; unknown?: string } | null => {
  const has = (...needles: string[]) => needles.some((n) => t.includes(n));
  const named = profilesNamed(t);
  const aboutPortfolio = PORTFOLIO_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(t));

  if (has('which profile', 'what profile', 'current profile', 'selected profile') &&
      has('viewing', 'looking at', 'selected', 'am i', 'on screen', 'showing', 'current profile', 'this')) {
    return { intent: 'profile_current', profiles: [] };
  }
  // A condition that is not monitored here.
  const unknown = unknownConditionNamed(t);
  if (unknown && (!named.length || /flu|influenza/.test(unknown))) return { intent: 'profile_unknown', profiles: [], unknown };

  if (named.length >= 2 && has('compare', 'comparison', 'versus', ' vs', 'and', 'difference', 'between')) {
    return { intent: 'profile_compare', profiles: named.slice(0, 2) };
  }
  if (aboutPortfolio && has('expected range', 'within range', 'within expected', 'normal', 'quiet', 'not elevated', 'low')) {
    return { intent: 'profiles_expected', profiles: [] };
  }
  if ((aboutPortfolio || has('which', 'what')) && has('need a baseline', 'needs a baseline', 'needing a baseline', 'need baseline', 'needs baseline', 'needing baseline', 'insufficient baseline', 'no baseline', 'without a baseline', 'without baseline', 'no data', 'missing data')) {
    return { intent: 'profiles_baseline', profiles: [] };
  }
  if (named.length === 1 && has('facilit', 'hospital', 'site', 'contribut', 'where')) {
    return { intent: 'profile_facilities', profiles: named };
  }
  if (named.length === 1 && has('why did', 'why has', 'why is it', 'jump', 'drop', 'fall', 'fell', 'rise', 'rose', 'swing', 'move', 'moved', 'change', 'sharp')) {
    return { intent: 'profile_change', profiles: named };
  }
  if (named.length === 1 && named[0] !== RVS_PROFILE_ID) return { intent: 'profile_status', profiles: named };
  if (named.length === 1 && has('happening with', 'going on with', 'status of', 'how is', 'tell me about', 'what about')) {
    return { intent: 'profile_status', profiles: named };
  }
  if ((aboutPortfolio || has('signals')) && has('attention', 'active', 'need', 'elevated', 'alerting', 'concern', 'priorit')) {
    return { intent: 'profiles_attention', profiles: [] };
  }
  if (has('any critical', 'critical signal', 'critical profile', 'anything critical', 'is anything critical', 'are any critical', 'which are critical')) {
    return { intent: 'profiles_critical', profiles: [] };
  }
  if (has('highest signal', 'strongest signal', 'top signal', 'biggest signal', 'highest profile', 'most severe profile', 'highest scoring profile', 'highest-scoring profile', 'worst profile')) {
    return { intent: 'profiles_highest', profiles: [] };
  }
  if (aboutPortfolio && has('list', 'which', 'what', 'monitor', 'watch', 'cover', 'all')) {
    return { intent: 'profiles_attention', profiles: [] };
  }
  return null;
};

/* ------------------------------------------------------------------------ *
 * The portfolio Roella answers from.
 * ------------------------------------------------------------------------ */

/**
 * The profiles as the screens show them. The app passes its own (the Active
 * Surveillance section's); otherwise they are rebuilt from the same
 * functions, with the narrated profile taken from the source's days.
 */
export const portfolioFor = (ctx: AssistantContext): ProfileSummary[] => {
  if (ctx.profiles) return ctx.profiles;
  if (!ctx.days) return summarizeProfiles(ctx.day);
  const current = findDay(ctx.days, ctx.day);
  const previous = ctx.day > 1 ? findDay(ctx.days, ctx.day - 1) : null;
  return summarizeProfiles(ctx.day, {
    current: { scenario: current.scenario, score: signalScoreFor(current) },
    previous: previous ? { scenario: previous.scenario, score: signalScoreFor(previous) } : undefined,
  });
};

const reading = (s: ProfileSummary) =>
  s.score ? `${s.score.composite} (${s.score.severity})` : STATUS_LABEL[s.status];

const line = (s: ProfileSummary) =>
  s.score
    ? `${s.profile.displayName}: ${s.score.composite} (${s.score.severity}) — ${STATUS_LABEL[s.status].toLowerCase()}`
    : `${s.profile.displayName}: ${STATUS_LABEL[s.status].toLowerCase()} — ${s.current.statusReason}`;

const SEPARATE = 'Each profile is scored against its own baseline; scores are never combined.';
const SYNTHETIC = 'All profile data is synthetic.';

/* ------------------------------------------------------------------------ *
 * Answers.
 * ------------------------------------------------------------------------ */

const profilesAttention = (ctx: AssistantContext): AssistantAnswer => {
  const all = portfolioFor(ctx);
  const active = activeSignals(all);
  const counts = countStatuses(all);
  const blocks: AnswerBlock[] = [
    text(
      active.length === 0
        ? `On Replay Day ${ctx.day} no surveillance profile has an active signal.`
        : `On Replay Day ${ctx.day}, ${active.length} of ${all.length} surveillance profiles ${active.length === 1 ? 'has an active signal' : 'have active signals'}, highest first:`,
    ),
  ];
  if (active.length) blocks.push(list(active.map(line)));
  blocks.push(
    metrics([
      ['Active signal', String(counts.activeSignal)],
      ['Within expected range', String(counts.withinExpectedRange)],
      ['Insufficient baseline', String(counts.insufficientBaseline)],
      ['No data', String(counts.noData)],
    ]),
  );
  blocks.push(text(`${SEPARATE} Profiles with no data or no baseline are not counted as within expected range. ${SYNTHETIC}`));
  return answer('profiles_attention', blocks, [
    'What is the highest signal?',
    'Which profiles are within expected range?',
    'Which profiles need a baseline?',
  ]);
};

const profilesHighest = (ctx: AssistantContext): AssistantAnswer => {
  const top = rankProfiles(portfolioFor(ctx)).find((s) => s.score);
  if (!top || !top.score) {
    return answer('profiles_highest', [text(`No surveillance profile has a score on Replay Day ${ctx.day}.`)]);
  }
  const blocks = [
    text(
      `The highest signal on Replay Day ${ctx.day} is ${top.profile.displayName}: ${top.score.composite} of 100 (${top.score.severity}), ${STATUS_LABEL[top.status].toLowerCase()}.`,
    ),
    profileMetrics(top),
    text(SEPARATE),
  ];
  return answer('profiles_highest', blocks, [
    `What is happening with ${top.profile.displayName}?`,
    `Which facilities contribute to ${top.profile.displayName}?`,
    'Which profiles need attention?',
  ]);
};

const profilesCritical = (ctx: AssistantContext): AssistantAnswer => {
  const critical = rankProfiles(portfolioFor(ctx)).filter((s) => s.score?.severity === 'Critical');
  if (critical.length === 0) {
    return answer('profiles_critical', [
      text(`No surveillance profile is Critical on Replay Day ${ctx.day}.`),
      text(SEPARATE),
    ], ['Which profiles need attention?', 'What is the highest signal?']);
  }
  return answer('profiles_critical', [
    text(`${critical.length === 1 ? 'One profile is' : `${critical.length} profiles are`} Critical (85 or above) on Replay Day ${ctx.day}:`),
    list(critical.map(line)),
    text(`A Critical score is an early-warning signal for epidemiological review, not a confirmed outbreak. ${SEPARATE}`),
  ], ['Which profiles need attention?', `What is happening with ${critical[0].profile.displayName}?`]);
};

/** A regional positivity as the screens show it: withheld when its count is under 5. */
const shownRate = (id: ProfileId, day: number, rate: number) => rateDisplay(regionalPositivePrivacy(id, day), rate);

/** The baseline day's positivity as the screens show it. */
const shownBaseline = (s: ProfileSummary) =>
  rateDisplay(regionalPositivePrivacy(s.profile.id, s.current.baseline.day), s.current.baseline.positivityRate);

/** Whether a day's positivity evidence is withheld (the day's or the baseline's count is under 5). */
const ratesWithheld = (s: ProfileSummary) =>
  regionalPositivePrivacy(s.profile.id, s.current.day).suppressed ||
  regionalPositivePrivacy(s.profile.id, s.current.baseline.day).suppressed;

const lowVolume = (s: ProfileSummary): AnswerBlock[] => {
  const note = lowVolumeNote(s.profile.id, s.status);
  return note ? [text(`${note.title}: ${note.text}`)] : [];
};

const profileMetrics = (s: ProfileSummary): AnswerBlock => {
  const sc = s.current.scenario;
  const items: Array<[string, string]> = [
    ['Status', STATUS_LABEL[s.status]],
    ['Score', s.score ? `${s.score.composite} / 100 (${s.score.severity})` : 'No score'],
    ['Tests', String(sc.totalTests)],
    ['Positivity', sc.totalTests ? shownRate(s.profile.id, s.current.day, sc.positivityRate) : '—'],
    ['Facilities above margin', `${sc.affectedHospitals.length} of 3`],
  ];
  if (s.scoreChange !== null) items.push(['Change since previous day', `${s.scoreChange > 0 ? '+' : ''}${s.scoreChange}`]);
  return metrics(items);
};

const profileStatus = (id: ProfileId, ctx: AssistantContext, day?: SimulationDay): AssistantAnswer => {
  const profile = PROFILE_BY_ID[id];
  const s =
    day && day !== ctx.day
      ? summaryForDay(id, day)
      : portfolioFor(ctx).find((item) => item.profile.id === id) ?? summaryForDay(id, ctx.day);
  const tests = profile.testCodes.map((code) => TEST_BY_CODE[code]?.name ?? code);
  const blocks: AnswerBlock[] = [
    text(`${profile.displayName} on Replay Day ${s.current.day}: ${s.current.statusReason}`),
    profileMetrics(s),
    text(
      `${profile.displayName} counts ${joinAnd(tests)} results (${DATA_ORIGIN_LABEL[profile.dataOrigin].toLowerCase()}). ${SEPARATE}`,
    ),
  ];
  blocks.push(...lowVolume(s));
  if (day && day > ctx.day) blocks.push(text(`Note: Day ${day} is ahead of the current replay day (Day ${ctx.day}).`));
  return answer('profile_status', blocks, [
    `Which facilities contribute to ${profile.displayName}?`,
    'Which profiles need attention?',
    'What is the highest signal?',
  ]);
};

const summaryForDay = (id: ProfileId, day: SimulationDay): ProfileSummary => {
  const all = summarizeProfiles(day);
  return all.find((s) => s.profile.id === id) ?? all[0];
};

const profileCompare = (ids: ProfileId[], ctx: AssistantContext): AssistantAnswer => {
  const all = portfolioFor(ctx);
  const [a, b] = ids.map((id) => all.find((s) => s.profile.id === id)!);
  const blocks: AnswerBlock[] = [
    text(`${a.profile.displayName} and ${b.profile.displayName} on Replay Day ${ctx.day}:`),
    list([line(a), line(b)]),
  ];
  if (a.score && b.score) {
    const higher = a.score.composite === b.score.composite ? null : a.score.composite > b.score.composite ? a : b;
    blocks.push(
      text(
        higher
          ? `${higher.profile.displayName} is higher by ${Math.abs(a.score.composite - b.score.composite)} ${Math.abs(a.score.composite - b.score.composite) === 1 ? 'point' : 'points'}. Tests: ${a.current.scenario.totalTests} vs ${b.current.scenario.totalTests}; positivity ${shownRate(a.profile.id, a.current.day, a.current.scenario.positivityRate)} vs ${shownRate(b.profile.id, b.current.day, b.current.scenario.positivityRate)}.`
          : 'Both have the same score.',
      ),
    );
  }
  blocks.push(text(`The two are compared side by side, never combined. ${SEPARATE}`));
  return answer('profile_compare', blocks, [
    `What is happening with ${a.profile.displayName}?`,
    `What is happening with ${b.profile.displayName}?`,
  ]);
};

const profileFacilities = (id: ProfileId, ctx: AssistantContext): AssistantAnswer => {
  const s = portfolioFor(ctx).find((item) => item.profile.id === id)!;
  const name = s.profile.displayName;
  if (!s.score) {
    return answer('profile_facilities', [
      text(`${name} has no score on Replay Day ${ctx.day}, so no facility is assessed as contributing. ${s.current.statusReason}`),
    ], ['Which profiles need a baseline?']);
  }
  const affected = s.current.scenario.affectedHospitals.map((h) => `${HOSPITAL_BY_ID[h].name} (${HOSPITAL_BY_ID[h].zipCode})`);
  return answer('profile_facilities', [
    text(
      affected.length === 0
        ? `No facility is above the detection margin for ${name} on Replay Day ${ctx.day}.`
        : `${affected.length} of 3 facilities ${affected.length === 1 ? 'is' : 'are'} above ${name}'s detection margin on Replay Day ${ctx.day}: ${joinAnd(affected)}.`,
    ),
    text(
      `A facility contributes when its own ${name} positivity is at least 3 percentage points above ${name}'s Day 1 baseline (${shownBaseline(s)}), with at least 10 tests that day. Counts under 5 are withheld on the Map and the Facilities page.`,
    ),
  ], [`What is happening with ${name}?`, 'Which profiles need attention?']);
};

const profilesExpected = (ctx: AssistantContext): AssistantAnswer => {
  const all = rankProfiles(portfolioFor(ctx));
  const within = all.filter((s) => s.status === 'WITHIN_EXPECTED_RANGE');
  const notScored = all.filter((s) => s.status === 'NO_DATA' || s.status === 'INSUFFICIENT_BASELINE');
  const blocks: AnswerBlock[] = [
    text(
      within.length
        ? `${within.length} ${within.length === 1 ? 'profile is' : 'profiles are'} within the expected range (Low) on Replay Day ${ctx.day}:`
        : `No profile is within the expected range on Replay Day ${ctx.day}.`,
    ),
  ];
  if (within.length) blocks.push(list(within.map(line)));
  if (notScored.length) {
    blocks.push(
      text(`Not counted as within range, because they have no score: ${joinAnd(notScored.map((s) => `${s.profile.displayName} (${STATUS_LABEL[s.status].toLowerCase()})`))}.`),
    );
  }
  return answer('profiles_expected', blocks, ['Which profiles need attention?', 'Which profiles need a baseline?']);
};

const profilesBaseline = (ctx: AssistantContext): AssistantAnswer => {
  const all = rankProfiles(portfolioFor(ctx));
  const insufficient = all.filter((s) => s.status === 'INSUFFICIENT_BASELINE');
  const noData = all.filter((s) => s.status === 'NO_DATA');
  const blocks: AnswerBlock[] = [];
  blocks.push(
    text(
      insufficient.length
        ? `${insufficient.length === 1 ? 'One profile needs' : `${insufficient.length} profiles need`} a baseline on Replay Day ${ctx.day}:`
        : `Every profile with data has a usable baseline on Replay Day ${ctx.day}.`,
    ),
  );
  if (insufficient.length) blocks.push(list(insufficient.map((s) => `${s.profile.displayName}: ${s.current.statusReason}`)));
  if (noData.length) blocks.push(list(noData.map((s) => `${s.profile.displayName}: ${s.current.statusReason}`), 'No data'));
  blocks.push(text('A profile without data or without a baseline gets no score, and is never shown as within expected range.'));
  return answer('profiles_baseline', blocks, ['Which profiles need attention?', 'Which profiles are within expected range?']);
};

const profileCurrent = (ctx: AssistantContext): AssistantAnswer => {
  const id = ctx.profileId ?? RVS_PROFILE_ID;
  const s = portfolioFor(ctx).find((item) => item.profile.id === id)!;
  const scope =
    ctx.profileSelection === 'active'
      ? ' (Active signals view: the highest active signal is shown)'
      : ctx.profileSelection === 'all'
        ? ' (All profiles view: the highest-ranked profile is shown)'
        : '';
  return answer('profile_current', [
    text(`You are viewing ${s.profile.displayName}${scope}: ${reading(s)} on Replay Day ${ctx.day}.`),
    text('Change it with the Surveillance profile selector on the Dashboard, Map, Signals, Facilities, Laboratory Data and Analytics pages.'),
  ], [`What is happening with ${s.profile.displayName}?`, 'Which profiles need attention?']);
};

const profileUnknown = (name: string): AssistantAnswer =>
  answer('profile_unknown', [
    text(`${name.charAt(0).toUpperCase()}${name.slice(1)} is not a surveillance profile in Signal by ProbeSyQ, so there is no data about it here.`),
    list(PROFILES.map((p) => p.displayName), 'The surveillance profiles are'),
  ], ['Which profiles need attention?']);

/** Why the selected (non-narrated) profile's score is what it is. */
export const profileScoreExplanation = (id: ProfileId, ctx: AssistantContext, day?: SimulationDay): AssistantAnswer => {
  const s =
    day && day !== ctx.day ? summaryForDay(id, day) : portfolioFor(ctx).find((item) => item.profile.id === id)!;
  const name = s.profile.displayName;
  if (!s.score) {
    return answer('score_explanation', [
      text(`You are viewing ${name}. It has no score on Replay Day ${s.current.day}: ${s.current.statusReason}`),
    ], ['Which profiles need attention?']);
  }
  const parts = [...s.score.components].sort((a, b) => b.points - a.points);
  const top = parts.filter((c) => c.points > 0).slice(0, 2).map((c) => c.label);
  return answer('score_explanation', [
    text(
      `You are viewing ${name}. On Replay Day ${s.current.day} its score is ${s.score.composite} (${s.score.severity}), measured against ${name}'s own Day 1 baseline (${s.current.baseline.tests} tests, ${shownBaseline(s)} positive). It is the sum of five weighted components:`,
    ),
    // The same components, and the same withheld rates, as the Score components list on screen.
    list(parts.map((c) => `${c.label}: ${c.points} of ${c.maxPoints} points — ${componentEvidence(c, ratesWithheld(s))}`)),
    ...lowVolume(s),
    ...(top.length ? [text(`The largest contributions come from ${joinAnd(top)}.`)] : []),
    text(`${SEPARATE} The score is an illustrative, non-validated demonstration model.`),
  ], ['Which profiles need attention?', `Which facilities contribute to ${name}?`]);
};

/** Why a profile's score moved since the previous day: component by component. */
const profileChange = (id: ProfileId, ctx: AssistantContext, day?: SimulationDay): AssistantAnswer => {
  const s = day && day !== ctx.day ? summaryForDay(id, day) : portfolioFor(ctx).find((item) => item.profile.id === id)!;
  const name = s.profile.displayName;
  if (!s.score) {
    return answer('profile_change', [text(`${name} has no score on Replay Day ${s.current.day}: ${s.current.statusReason}`)]);
  }
  if (!s.previous?.score) {
    return answer('profile_change', [
      text(`${name} scores ${s.score.composite} (${s.score.severity}) on Replay Day ${s.current.day}; there is no scored previous day to compare with.`),
      ...lowVolume(s),
    ]);
  }
  const before = s.previous.score;
  const delta = s.score.composite - before.composite;
  const moves = s.score.components.map((c) => {
    const was = before.components.find((p) => p.key === c.key)?.points ?? 0;
    const d = c.points - was;
    return { label: c.label, d, line: `${c.label}: ${was} → ${c.points} points (${d > 0 ? '+' : ''}${d})` };
  });
  const biggest = [...moves].filter((m) => m.d !== 0).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 2);
  return answer('profile_change', [
    text(
      `${name} moved from ${before.composite} to ${s.score.composite} (${delta > 0 ? '+' : ''}${delta}) between Replay Day ${s.current.day - 1} and Day ${s.current.day}.${
        biggest.length ? ` The largest changes are in ${joinAnd(biggest.map((m) => m.label))}.` : ''
      }`,
    ),
    list(moves.map((m) => m.line), 'Component points, previous day → this day'),
    ...lowVolume(s),
    text(SEPARATE),
  ], [`What is happening with ${name}?`, 'Which profiles need attention?']);
};

export const answerProfileIntent = (
  parsed: { intent: IntentId; profiles: ProfileId[]; unknown?: string; day?: SimulationDay },
  ctx: AssistantContext,
): AssistantAnswer | null => {
  switch (parsed.intent) {
    case 'profiles_attention': return profilesAttention(ctx);
    case 'profiles_highest': return profilesHighest(ctx);
    case 'profiles_critical': return profilesCritical(ctx);
    case 'profiles_expected': return profilesExpected(ctx);
    case 'profiles_baseline': return profilesBaseline(ctx);
    case 'profile_current': return profileCurrent(ctx);
    case 'profile_status': return profileStatus(parsed.profiles[0], ctx, parsed.day);
    case 'profile_compare': return profileCompare(parsed.profiles, ctx);
    case 'profile_facilities': return profileFacilities(parsed.profiles[0], ctx);
    case 'profile_unknown': return profileUnknown(parsed.unknown ?? 'That');
    case 'profile_change': return profileChange(parsed.profiles[0], ctx, parsed.day);
    default: return null;
  }
};

