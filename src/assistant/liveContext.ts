/**
 * Builds what Roella knows about Live Surveillance from the simulator — the
 * same state, views and display rules the screens use. No patient reference
 * or result value is ever included.
 */
import { HOSPITAL_BY_ID } from '../data/hospitals';
import { calculateDataConfidence } from '../lib/dataConfidence';
import { PROFILES } from '../lib/profiles/registry';
import { dayAndMinuteOf, isLiveProfile, LIVE_PROFILES, type LiveSimulator } from '../lib/live/simulator';
import { clock } from '../lib/live/sources';
import { liveDayLabel, liveProfileView, liveSummaries } from '../lib/live/view';
import type { LiveAssistantContext } from './types';

export const buildLiveAssistantContext = (
  sim: LiveSimulator,
  state: { started: boolean; playing: boolean },
): LiveAssistantContext => {
  const now = dayAndMinuteOf(sim.op);
  const summaries = liveSummaries(sim);
  const display: LiveAssistantContext['display'] = {};
  PROFILES.filter((p) => isLiveProfile(p.id)).forEach((p) => {
    const summary = summaries.find((s) => s.profile.id === p.id)!;
    const d = liveProfileView(sim, p.id, summary, []).display;
    display[p.id] = { positivity: d.positivity, baselinePositivity: d.baselinePositivity, ratesWithheld: d.ratesWithheld, lowVolume: d.lowVolume };
  });
  const day = sim.currentDay;
  return {
    clock: `${liveDayLabel(now.dayIndex)} · ${clock(now.minute)}`,
    started: state.started,
    playing: state.playing,
    finished: sim.finished,
    closedDayLabel: liveDayLabel(day),
    closedDay: day,
    dataConfidence: calculateDataConfidence(sim.feedHealth()),
    dayLabel: liveDayLabel,
    now: sim.op,
    sources: sim.feedHealth().map((f) => ({
      hospitalId: f.hospitalId,
      name: f.facilityName,
      sourceType: sim.feeds[f.hospitalId].sourceType,
      status: f.status,
      minutesSinceResult: sim.minutesSinceResult(f.hospitalId),
      minutesSinceContact: f.minutesSinceLastEvent,
    })),
    activity: sim.audit.map((e) => ({
      kind: e.kind,
      op: e.op,
      when: `${liveDayLabel(e.dayIndex)} ${clock(e.minute)}`,
      text: e.text,
      profileId: e.profileId,
      hospitalId: e.hospitalId,
      sourceType: e.sourceType,
      before: e.before,
      after: e.after,
      drivers: e.drivers?.map((d) => ({ label: d.label, before: d.before, after: d.after })),
      facilityChanges: e.facilityChanges,
    })),
    facilities: Object.fromEntries(
      LIVE_PROFILES.map((id) => [
        id,
        (sim.closed[id][day]?.facilities ?? []).map((f) => ({
          hospitalId: f.hospitalId,
          name: HOSPITAL_BY_ID[f.hospitalId].name,
          status: f.status,
          reasons: f.reasons,
        })),
      ]),
    ),
    display,
  };
};
