/**
 * Roella — the two modes, and why their dates differ.
 *
 * Live Surveillance is the primary experience; Scenario Replay is the
 * secondary, training mode. They are separate synthetic scenarios, each with
 * its own dates: nothing here suggests the data is inconsistent, and nothing
 * is calculated — these answers only explain the modes.
 */
import { formatSimulationDate } from '../lib/format';
import type { AnswerBlock, AssistantAnswer, AssistantContext, IntentId } from './types';

type ModeIntent = Extract<IntentId, 'mode_main' | 'mode_replay' | 'mode_dates'>;

const text = (value: string): AnswerBlock => ({ kind: 'text', text: value });
const answer = (intent: IntentId, blocks: AnswerBlock[], followUps: string[]): AssistantAnswer => ({
  intent,
  blocks,
  followUps: followUps.slice(0, 3),
});

/** Which mode question this is, if any (normalized text). */
export const parseModeIntent = (t: string): ModeIntent | null => {
  const has = (...needles: string[]) => needles.some((n) => t.includes(n));
  if (
    has('dates different', 'different dates', 'dates differ', 'date different', 'different date', 'dates dont match', 'dates do not match',
      'dates not match', 'dates are not the same', 'not the same date', 'same dates', 'same date', 'dates dont line up', 'dates inconsistent',
      'inconsistent dates', 'date mismatch', 'dates mismatch')
  ) {
    return 'mode_dates';
  }
  if (
    has('main mode', 'primary mode', 'default mode', 'which mode', 'what mode', 'what modes', 'which modes', 'two modes', 'both modes',
      'modes are there', 'live or replay', 'replay or live', 'live vs', 'replay vs', 'live versus', 'replay versus',
      'difference between live', 'difference between replay', 'difference between scenario replay', 'difference between the modes')
  ) {
    return 'mode_main';
  }
  if (
    /^(what is|whats|what s|explain|describe|tell me about) (the )?scenario replay( mode)?( for)?$/.test(t) ||
    /^what is (the )?replay mode( for)?$/.test(t) ||
    has('purpose of scenario replay', 'purpose of the replay', 'why use scenario replay', 'what is scenario replay for', 'what is the scenario replay for')
  ) {
    return 'mode_replay';
  }
  return null;
};

const PRIMARY =
  'Live Surveillance is the main mode, and where a new session opens: synthetic observations arrive through three simulated source feeds (FHIR R4, HL7 v2 and LIS/API), and every surveillance profile’s score is recalculated as they do.';
const SECONDARY =
  'Scenario Replay is the secondary mode: a controlled historical training scenario that steps through a known five-day outbreak progression, for training, walkthroughs and review.';

const mainMode = (ctx: AssistantContext): AssistantAnswer =>
  answer('mode_main', [
    text(PRIMARY),
    text(SECONDARY),
    text(
      ctx.live
        ? 'You are in Live Surveillance now.'
        : 'You are in Scenario Replay now. Choose Live Surveillance in the sidebar’s mode switch to return to the current simulated feed.',
    ),
  ], ['What is Scenario Replay?', 'Why are the dates different?']);

const replayMode = (ctx: AssistantContext, replayDate: string): AssistantAnswer =>
  answer('mode_replay', [
    text(
      'Scenario Replay is a controlled historical training scenario. It replays a known Respiratory Viral Activity outbreak progression over five fixed days, so you can review how the signal developed, one day at a time, from the baseline onward.',
    ),
    text('It is used for training, walkthroughs and controlled review. It is not the current operational state: Live Surveillance is the primary mode.'),
    text(
      ctx.live
        ? 'You are in Live Surveillance now; choose Scenario Replay in the sidebar to open it.'
        : `It is on Replay Day ${ctx.day} of 5 (replay date ${replayDate}).`,
    ),
  ], ctx.live ? ['What is the main mode?', 'Why are the dates different?'] : ['Why are the dates different?', 'What is the main mode?']);

const datesDiffer = (ctx: AssistantContext, replayDate: string): AssistantAnswer =>
  answer('mode_dates', [
    text('Live Surveillance and Scenario Replay are separate synthetic scenarios, so their dates are intentionally independent.'),
    text(
      `Live Surveillance uses its own simulated feed timeline: seven days of synthetic history, then live days that stream on a simulated clock${
        ctx.live ? ` (the live surveillance date is now ${ctx.live.clock}, simulated)` : ''
      }.`,
    ),
    text(
      `Scenario Replay preserves the original five-day historical training sequence, with its own replay dates${
        ctx.live ? '' : ` (Replay Day ${ctx.day} is ${replayDate})`
      }.`,
    ),
    text('The data is not inconsistent: each mode keeps its own calendar, and nothing in one mode changes the other.'),
  ], ['What is the main mode?', 'What is Scenario Replay?']);

export const answerModeIntent = (intent: IntentId, ctx: AssistantContext, replaySimulationDate: string): AssistantAnswer | null => {
  const replayDate = formatSimulationDate(replaySimulationDate);
  if (intent === 'mode_main') return mainMode(ctx);
  if (intent === 'mode_replay') return replayMode(ctx, replayDate);
  if (intent === 'mode_dates') return datesDiffer(ctx, replayDate);
  return null;
};
