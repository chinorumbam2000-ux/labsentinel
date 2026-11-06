/**
 * Roella — Live Surveillance questions.
 *
 * Answers come from the live state the screens show (the activity stream,
 * the simulated sources, the latest closed day's signals). Roella always says
 * the sources are SIMULATED: no real hospital, EHR vendor or patient is
 * connected, and she never says otherwise.
 */
import { PROFILE_BY_ID, RVS_PROFILE_ID, type ProfileId } from '../lib/profiles/registry';
import { profilesNamed } from './profiles';
import type { AnswerBlock, AssistantAnswer, AssistantContext, IntentId, LiveAssistantContext } from './types';

const text = (value: string): AnswerBlock => ({ kind: 'text', text: value });
const list = (items: string[], title?: string): AnswerBlock => ({ kind: 'list', items, ...(title ? { title } : {}) });
const answer = (intent: IntentId, blocks: AnswerBlock[], followUps: string[] = []): AssistantAnswer => ({
  intent,
  blocks,
  followUps: followUps.slice(0, 3),
});

export const SIMULATED =
  'Live Surveillance processes synthetic observations from simulated FHIR R4, HL7 v2 and LIS/API source feeds, in your browser. No real hospital, EHR vendor or patient is connected.';

const FACILITY_WORDS: Array<[RegExp, string]> = [
  [/\bworcester\b|\bhosp-a\b/, 'HOSP-A'],
  [/\bcentral massachusetts\b|\bregional hospital\b|\bhosp-b\b/, 'HOSP-B'],
  [/\bshrewsbury\b|\bhosp-c\b/, 'HOSP-C'],
];

/** Which live intent a question asks, if any (only consulted in Live Surveillance, except real-time). */
export const parseLiveIntent = (t: string, ctx: AssistantContext): { intent: IntentId; profiles: ProfileId[]; facility?: string } | null => {
  const has = (...needles: string[]) => needles.some((n) => t.includes(n));
  if (has('real-time', 'real time', 'realtime', 'is this real', 'is this live', 'live data', 'actually live')) {
    return { intent: 'realtime', profiles: [] };
  }
  if (!ctx.live) return null;
  const profiles = profilesNamed(t);
  const facility = FACILITY_WORDS.find(([re]) => re.test(t))?.[1];
  if (has('latest observation', 'last observation', 'latest result', 'last result', 'which source sent', 'which source', 'which feed sent')) {
    return { intent: 'live_latest_source', profiles };
  }
  if (has('which profile changed', 'profile changed most recently', 'changed most recently', 'most recent change')) {
    return { intent: 'live_latest_profile', profiles };
  }
  if (has('all sources', 'sources active', 'source active', 'feeds active', 'any source', 'any feed', 'source delayed', 'feed delayed', 'are the sources', 'are the feeds', 'source status', 'feed status')) {
    return { intent: 'live_sources', profiles };
  }
  if (has('become affected', 'became affected', 'why is this facility', 'facility affected', 'why is worcester', 'why is shrewsbury', 'why is central')) {
    return { intent: 'live_facility', profiles, facility };
  }
  if (has('driving', 'drives', 'driver')) return { intent: 'live_driver', profiles };
  if (has('what just changed', 'what changed', 'what happened', 'last minute', 'last hour', 'just now', "what's new", 'whats new', 'latest change', 'recent activity')) {
    return { intent: 'live_changes', profiles };
  }
  if (has('why did') && has('score', 'increase', 'rise', 'rose', 'go up', 'went up', 'drop', 'fall', 'change', 'move', 'jump')) {
    return { intent: 'live_why', profiles };
  }
  return null;
};

const profileOf = (parsed: { profiles: ProfileId[] }, ctx: AssistantContext): ProfileId =>
  parsed.profiles[0] ?? ctx.profileId ?? RVS_PROFILE_ID;

const driversText = (e: LiveAssistantContext['activity'][number]) =>
  [
    ...(e.drivers ?? []).map((d) => `${d.label}: ${d.before} → ${d.after} points`),
    ...(e.facilityChanges ?? []),
  ];

const scoreEvents = (live: LiveAssistantContext) => live.activity.filter((e) => e.kind === 'score' || e.kind === 'close');

const liveChanges = (live: LiveAssistantContext): AssistantAnswer => {
  // "The last minute" of a simulation is read as the last simulated hour.
  const window = live.activity.filter((e) => e.op >= live.now - 60);
  const observations = window.filter((e) => e.kind === 'observation').length;
  const changes = scoreEvents(live).filter((e) => e.op >= live.now - 60).slice(-6);
  const sources = window.filter((e) => e.kind === 'source');
  if (!live.started && live.activity.length === 0) {
    return answer('live_changes', [text('The live simulation has not started yet. Start it on the Live Surveillance page to see observations arrive.'), text(SIMULATED)]);
  }
  const blocks: AnswerBlock[] = [
    text(`In the last simulated hour (to ${live.clock}), ${observations} ${observations === 1 ? 'observation' : 'observations'} arrived from the simulated feeds.`),
  ];
  if (changes.length) blocks.push(list(changes.map((e) => `${e.when} — ${e.text}`), 'Score changes'));
  else blocks.push(text('No profile score changed in that hour.'));
  if (sources.length) blocks.push(list(sources.map((e) => `${e.when} — ${e.text}`), 'Source status'));
  blocks.push(text(SIMULATED));
  return answer('live_changes', blocks, ['Why did the score increase?', 'Are all sources active?', 'Which source sent the latest observation?']);
};

const liveWhy = (id: ProfileId, live: LiveAssistantContext): AssistantAnswer => {
  const name = PROFILE_BY_ID[id].displayName;
  const events = scoreEvents(live).filter((e) => e.profileId === id && e.after !== null && e.before !== null && e.after !== e.before);
  const latest = events[events.length - 1];
  if (!latest) {
    return answer('live_why', [text(`${name}'s score has not changed yet in this live session.`), text(SIMULATED)]);
  }
  const drivers = driversText(latest);
  return answer('live_why', [
    text(
      `${name}'s latest change: ${latest.before} → ${latest.after} at ${latest.when}${latest.kind === 'score' ? ' (today so far, provisional)' : ' (when the day closed)'}.`,
    ),
    drivers.length ? list(drivers, 'From the engine’s own components') : text('No single component changed by a whole point.'),
    text('Each new observation changes the day’s counts; the engine recalculates the five components against the rolling 7-day baseline. Volume is compared with a full-day baseline, so it builds up through the day.'),
  ], [`What is driving ${name} right now?`, 'What just changed?']);
};

const latestSource = (live: LiveAssistantContext): AssistantAnswer => {
  const last = [...live.activity].reverse().find((e) => e.kind === 'observation' || e.kind === 'unmapped');
  if (!last) return answer('live_latest_source', [text('No observation has arrived yet in this live session.')]);
  const source = live.sources.find((s) => s.hospitalId === last.hospitalId);
  return answer('live_latest_source', [
    text(`The latest observation arrived at ${last.when} from ${source?.name ?? last.hospitalId}, through the simulated ${last.sourceType} source.`),
    text(last.text),
    text('Patient references and individual results are never shown in the activity stream.'),
  ], ['Are all sources active?', 'What just changed?']);
};

const latestProfile = (live: LiveAssistantContext): AssistantAnswer => {
  const last = [...scoreEvents(live)].reverse().find((e) => e.before !== e.after);
  if (!last || !last.profileId) return answer('live_latest_profile', [text('No profile score has changed yet in this live session.')]);
  return answer('live_latest_profile', [
    text(`${PROFILE_BY_ID[last.profileId].displayName} changed most recently: ${last.before ?? '—'} → ${last.after ?? '—'} at ${last.when}.`),
    ...(driversText(last).length ? [list(driversText(last), 'Drivers')] : []),
  ], [`Why did the score increase?`, 'What just changed?']);
};

const sourcesAnswer = (live: LiveAssistantContext): AssistantAnswer => {
  const active = live.sources.filter((s) => s.status === 'HEALTHY').length;
  return answer('live_sources', [
    text(
      active === live.sources.length
        ? `All ${live.sources.length} simulated sources are active.`
        : `${active} of ${live.sources.length} simulated sources are active.`,
    ),
    list(
      live.sources.map(
        (s) =>
          `${s.name} — simulated ${s.sourceType}: ${s.status === 'HEALTHY' ? 'active' : s.status.toLowerCase()}; last contact ${s.minutesSinceContact} min ago; last observation ${
            s.minutesSinceResult === null ? 'none yet' : `${s.minutesSinceResult} min ago`
          } (simulated time)`,
      ),
    ),
    text('A source is delayed when it has made no contact for more than 30 minutes — the existing feed-health rule. Shrewsbury Community’s simulated LIS feed has an outage on Feb 13.'),
    text(SIMULATED),
  ], ['What just changed?', 'Is this real-time?']);
};

const driverAnswer = (id: ProfileId, ctx: AssistantContext): AssistantAnswer => {
  const live = ctx.live!;
  const name = PROFILE_BY_ID[id].displayName;
  const s = ctx.profiles?.find((p) => p.profile.id === id);
  if (!s || !s.score) {
    return answer('live_driver', [text(`${name} has no score on ${live.closedDayLabel}: ${s?.current.statusReason ?? 'no data'}`)]);
  }
  const parts = [...s.score.components].sort((a, b) => b.points - a.points);
  const withheld = Boolean(live.display[id]?.ratesWithheld);
  return answer('live_driver', [
    text(`${name} scores ${s.score.composite} (${s.score.severity}) on ${live.closedDayLabel}, the latest closed day. Its components, largest first:`),
    list(parts.map((c) => `${c.label}: ${c.points} of ${c.maxPoints} points${withheld && c.key === 'positivity' ? ' (rates withheld: fewer than 5 positive results)' : ` — ${c.evidence}`}`)),
    text('Today’s observations are recalculated as they arrive (provisional) and become the current signal when the day closes.'),
  ], ['Why did the score increase?', 'What just changed?']);
};

const facilityAnswer = (id: ProfileId, facility: string | undefined, ctx: AssistantContext): AssistantAnswer => {
  const live = ctx.live!;
  const name = PROFILE_BY_ID[id].displayName;
  const rows = live.facilities[id] ?? [];
  const pick = facility ? rows.filter((r) => r.hospitalId === facility) : rows.filter((r) => r.status === 'ABNORMAL');
  if (!pick.length) {
    return answer('live_facility', [text(`No facility is affected for ${name} on ${live.closedDayLabel}.`)]);
  }
  return answer('live_facility', [
    text(`On ${live.closedDayLabel}, for ${name}:`),
    list(
      pick.map((r) =>
        r.status === 'ABNORMAL'
          ? `${r.name} is affected: ${r.reasons.join('; ')}, against its own rolling 7-day baseline.`
          : `${r.name} is not affected (${r.status.toLowerCase().replace(/_/g, ' ')}${r.reasons.length ? `: ${r.reasons.join('; ')}` : ''}).`,
      ),
    ),
    text('A facility is affected with its own sufficient baseline, at least 10 tests that day, and volume at least +25% or positivity at least +5 points over that baseline.'),
  ], [`What is driving ${name} right now?`]);
};

const realtimeAnswer = (ctx: AssistantContext): AssistantAnswer =>
  ctx.live
    ? answer('realtime', [
        text(
          'Yes, in the sense that matters for this demonstration: synthetic observations are processed one by one, as they arrive, and every score is recalculated from them in your browser — the architecture a live deployment would use.',
        ),
        text(`It is not real patient data. ${SIMULATED} Time is simulated: one surveillance day passes in about 12 seconds at 1×.`),
      ], ['What just changed?', 'Are all sources active?'])
    : answer('realtime', [
        text(
          'Not on this screen. Scenario Replay steps through a fixed five-day synthetic scenario, one day at a time. Switch to Live Surveillance to watch synthetic observations arrive from simulated source feeds and scores recalculate as they do.',
        ),
        text('Neither mode uses real patient data or a real hospital connection.'),
      ], ['What is Scenario Replay?']);

export const answerLiveIntent = (
  parsed: { intent: IntentId; profiles: ProfileId[]; facility?: string },
  ctx: AssistantContext,
): AssistantAnswer | null => {
  if (parsed.intent === 'realtime') return realtimeAnswer(ctx);
  const live = ctx.live;
  if (!live) return null;
  const id = profileOf(parsed, ctx);
  switch (parsed.intent) {
    case 'live_changes': return liveChanges(live);
    case 'live_why': return liveWhy(id, live);
    case 'live_latest_source': return latestSource(live);
    case 'live_latest_profile': return latestProfile(live);
    case 'live_sources': return sourcesAnswer(live);
    case 'live_driver': return driverAnswer(id, ctx);
    case 'live_facility': return facilityAnswer(id, parsed.facility, ctx);
    default: return null;
  }
};
