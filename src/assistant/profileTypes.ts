/**
 * Roella — aggregate and pathogen-specific profiles.
 *
 * Answers come from the profile registry's own membership: which tests each
 * profile has, and so which pathogen profiles an aggregate combines. Nothing
 * is calculated here; the scores stay each profile's own.
 */
import {
  PROFILE_BY_ID,
  TEST_BY_CODE,
  aggregatesContaining,
  constituentProfiles,
  type ProfileId,
} from '../lib/profiles/registry';
import { profilesNamed } from './profiles';
import type { AnswerBlock, AssistantAnswer, IntentId } from './types';

type TypeIntent = Extract<IntentId, 'profile_type_about' | 'profile_membership' | 'profile_difference'>;

const text = (value: string): AnswerBlock => ({ kind: 'text', text: value });
const answer = (intent: IntentId, blocks: AnswerBlock[], followUps: string[]): AssistantAnswer => ({
  intent,
  blocks,
  followUps: followUps.slice(0, 3),
});
const joinAnd = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const testsOf = (id: ProfileId) => PROFILE_BY_ID[id].testCodes.map((code) => TEST_BY_CODE[code]?.name ?? code);

const SCORED_APART =
  'Each profile is scored separately, from its own observations against its own baseline: the aggregate score is calculated from the combined results, not by averaging the pathogen scores. A result counts once in each profile it belongs to.';

const AGGREGATE_DEFINITION =
  /^(what is|whats|what s|explain|describe|define|tell me about|what does) (the )?(respiratory viral activity|respiratory activity|aggregate respiratory|rva|respiratory viral syndrome|rvs|gastrointestinal syndrome|gi syndrome)( profile)?( mean| for)?$/;

/** Which aggregate/pathogen question this is, if any (normalized text). */
export const parseProfileTypeIntent = (t: string): { intent: TypeIntent; profiles: ProfileId[] } | null => {
  const has = (...needles: string[]) => needles.some((n) => t.includes(n));
  const named = profilesNamed(t);
  const aggregate = named.find((id) => PROFILE_BY_ID[id].type === 'Aggregate');
  const pathogen = named.find((id) => PROFILE_BY_ID[id].type === 'Pathogen');
  if (aggregate && pathogen) {
    if (has('part of', 'included in', 'include', 'includes', 'counted in', 'count towards', 'counts towards', 'count toward', 'contribute', 'in the aggregate', 'inside', 'member of', 'belong')) {
      return { intent: 'profile_membership', profiles: [pathogen, aggregate] };
    }
    if (has('different', 'difference', 'differ', ' vs ', 'versus', 'same as', 'same thing', 'compare to', 'compared to', 'separate')) {
      return { intent: 'profile_difference', profiles: [pathogen, aggregate] };
    }
  }
  if (has('aggregate profile', 'pathogen profile', 'pathogen-specific', 'pathogen specific', 'aggregate and pathogen', 'aggregate vs', 'aggregate versus', 'what does aggregate mean', 'what is an aggregate', 'what is aggregate', 'types of profile', 'profile types', 'kinds of profile', 'duplicate monitoring', 'double count', 'double-count', 'counted twice')) {
    return { intent: 'profile_type_about', profiles: aggregate ? [aggregate] : [] };
  }
  // "What is Respiratory Viral Activity?" — the name alone, not "what is happening with …".
  if (aggregate && named.length === 1 && AGGREGATE_DEFINITION.test(t)) {
    return { intent: 'profile_type_about', profiles: [aggregate] };
  }
  if (aggregate && named.length === 1 && has('a disease', 'a separate disease', 'a syndrome', 'a diagnosis', 'is it a disease', 'real disease')) {
    return { intent: 'profile_type_about', profiles: [aggregate] };
  }
  return null;
};

const aboutAggregate = (id: ProfileId): AssistantAnswer => {
  const profile = PROFILE_BY_ID[id];
  const members = constituentProfiles(id).map((p) => p.displayName);
  return answer('profile_type_about', [
    text(
      `${profile.displayName} is an aggregate surveillance profile, not a separate disease. It combines ${joinAnd(testsOf(id))} results${
        members.length ? ` — the tests of the pathogen-specific ${joinAnd(members)} ${members.length === 1 ? 'profile' : 'profiles'}` : ''
      } — to show overall activity across participating facilities and areas.`,
    ),
    text(SCORED_APART),
    text('It does not diagnose anything: it is a surveillance view over synthetic laboratory results.'),
  ], members.length ? [`Is ${members[members.length > 1 ? 1 : 0]} part of ${profile.displayName}?`, 'Which profiles need attention?'] : ['Which profiles need attention?']);
};

const aboutTypes = (): AssistantAnswer => {
  const aggregates = Object.values(PROFILE_BY_ID).filter((p) => p.type === 'Aggregate');
  const pathogens = Object.values(PROFILE_BY_ID).filter((p) => p.type === 'Pathogen');
  return answer('profile_type_about', [
    text('Signal by ProbeSyQ has two kinds of surveillance profile, on purpose — it is not duplicate monitoring.'),
    text(`Aggregate profiles combine several tests into one view: ${joinAnd(aggregates.map((p) => `${p.displayName} (${joinAnd(testsOf(p.id))})`))}.`),
    text(`Pathogen-specific profiles cover one pathogen's own tests: ${joinAnd(pathogens.map((p) => p.displayName))}.`),
    text(SCORED_APART),
  ], ['What is Respiratory Viral Activity?', 'Is COVID-19 part of Respiratory Viral Activity?']);
};

const membership = (pathogen: ProfileId, aggregate: ProfileId): AssistantAnswer => {
  const p = PROFILE_BY_ID[pathogen];
  const a = PROFILE_BY_ID[aggregate];
  const inside = aggregatesContaining(pathogen).some((x) => x.id === aggregate);
  if (!inside) {
    const elsewhere = aggregatesContaining(pathogen).map((x) => x.displayName);
    return answer('profile_membership', [
      text(
        `No. ${p.displayName} is a pathogen-specific profile, and its ${joinAnd(testsOf(pathogen))} results are not part of ${a.displayName}${
          elsewhere.length ? `; they count towards ${joinAnd(elsewhere)} instead` : ''
        }.`,
      ),
    ], [`What is ${a.displayName}?`]);
  }
  return answer('profile_membership', [
    text(
      `Yes. ${p.displayName} is a pathogen-specific profile, and its mapped laboratory results (${joinAnd(testsOf(pathogen))}) also contribute to the broader ${a.displayName} aggregate.`,
    ),
    text(SCORED_APART),
  ], [`Is RSV different from ${a.displayName}?`, `What is ${a.displayName}?`]);
};

const difference = (pathogen: ProfileId, aggregate: ProfileId): AssistantAnswer => {
  const p = PROFILE_BY_ID[pathogen];
  const a = PROFILE_BY_ID[aggregate];
  const members = constituentProfiles(aggregate).map((x) => x.displayName);
  const inside = members.includes(p.displayName);
  return answer('profile_difference', [
    text(
      `${p.displayName} is a specific ${inside ? 'respiratory virus' : 'pathogen'} profile: only its ${joinAnd(testsOf(pathogen))} results. ${a.displayName} is the aggregate surveillance view combining ${joinAnd(members.length ? members : testsOf(aggregate))} activity.`,
    ),
    text(
      inside
        ? `So ${p.displayName}'s results are counted in both, once each — that is intended, not duplicate monitoring. ${SCORED_APART}`
        : `${p.displayName}'s results are not part of ${a.displayName}.`,
    ),
  ], [`Is ${p.displayName} part of ${a.displayName}?`, `What is ${a.displayName}?`]);
};

export const answerProfileTypeIntent = (parsed: { intent: IntentId; profiles: ProfileId[] }): AssistantAnswer | null => {
  if (parsed.intent === 'profile_membership') return membership(parsed.profiles[0], parsed.profiles[1]);
  if (parsed.intent === 'profile_difference') return difference(parsed.profiles[0], parsed.profiles[1]);
  if (parsed.intent === 'profile_type_about') return parsed.profiles[0] ? aboutAggregate(parsed.profiles[0]) : aboutTypes();
  return null;
};
