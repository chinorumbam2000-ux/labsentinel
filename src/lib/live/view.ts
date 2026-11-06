/**
 * Live Surveillance, in the shapes the analyst pages already render.
 *
 * Every page reads the selected profile through usePortfolio(); in Live
 * Surveillance it gets these views instead of the replay's. They are built
 * from the simulator's CLOSED days (the latest complete day is the current
 * signal) and its counts, through the same privacy rule and display logic.
 */
import type {
  DayOverDayComparison,
  HospitalId,
  HospitalMetrics,
  LabObservation,
  PrivacyResult,
  ScoreComponent,
  SimulationDay,
  ZipMetrics,
} from '../../types';
import { HOSPITALS, HOSPITAL_BY_ID } from '../../data/hospitals';
import { ZIP_AREAS } from '../../data/zipAreas';
import { getSeverity } from '../signalScore';
import { compareDays } from '../dayOverDay';
import type { TrendPoint } from '../analytics';
import { applyGeographicPrivacy } from '../geographicPrivacy';
import { PROFILES, PROFILE_BY_ID, type ProfileId, type SurveillanceProfile } from '../profiles/registry';
import { STATUS_LABEL, type ProfileBaseline, type ProfileDay, type ProfileStatus } from '../profiles/derive';
import type { ProfileAlert, ProfileSummary } from '../profiles/portfolio';
import {
  MINIMUM_DISPLAY_COUNT,
  SUPPRESSED_VALUE,
  areaPrivacyFor,
  componentEvidence,
  facilityCumulativePositivePrivacy,
  facilityPositivePrivacy,
  rateDisplay,
  regionalPositivePrivacy,
  type AreaPrivacy,
  type CountTable,
} from '../profiles/privacy';
import type { LowVolumeNote, ProfileDisplay } from '../profiles/display';
import { ALL_DATES, FIRST_LIVE_INDEX } from './dataset';
import { LIVE_PROFILES, isLiveProfile, liveScenario, type LiveSimulator } from './simulator';
import type { LiveSignal } from './engine';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Feb 12" for a live day index. */
export const liveDayLabel = (day: number): string => {
  const date = ALL_DATES[day - 1];
  if (!date) return `Day ${day}`;
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

/** A profile's per-day, per-facility counts in the privacy rule's table shape. */
export const liveCountTable = (sim: LiveSimulator, id: ProfileId): CountTable => {
  const table: CountTable = {};
  if (!isLiveProfile(id)) return table;
  (Object.keys(sim.counts[id]) as HospitalId[]).forEach((h) => {
    Object.entries(sim.counts[id][h]).forEach(([day, c]) => {
      table[Number(day)] ??= { 'HOSP-A': { tests: 0, positives: 0 }, 'HOSP-B': { tests: 0, positives: 0 }, 'HOSP-C': { tests: 0, positives: 0 } };
      table[Number(day)][h] = { tests: c.tests, positives: c.positive };
    });
  });
  return table;
};

const NOT_LIVE_REASON = (name: string) =>
  `${name} is not part of the simulated live source feeds. It is shown in Scenario Replay.`;

/** The volume evidence with the rolling baseline written to one decimal place. */
const tidyEvidence = (component: ScoreComponent, signal: LiveSignal): ScoreComponent =>
  component.key === 'volume' && signal.baseline.meanTests !== null
    ? {
        ...component,
        evidence: `${signal.current.tests} tests vs rolling baseline ${signal.baseline.meanTests.toFixed(1)} (${
          component.score > 0 || signal.current.tests >= signal.baseline.meanTests ? '+' : ''
        }${(((signal.current.tests - signal.baseline.meanTests) / signal.baseline.meanTests) * 100).toFixed(0)}%)`,
      }
    : component;

export const statusOf = (s: LiveSignal | null): ProfileStatus => {
  if (!s) return 'NO_DATA';
  if (s.status === 'NO_DATA') return 'NO_DATA';
  if (s.status === 'INSUFFICIENT_BASELINE') return 'INSUFFICIENT_BASELINE';
  return s.score!.severity === 'Low' ? 'WITHIN_EXPECTED_RANGE' : 'ACTIVE_SIGNAL';
};

const reasonFor = (id: ProfileId, s: LiveSignal | null, status: ProfileStatus): string => {
  const name = PROFILE_BY_ID[id].displayName;
  if (!s || status === 'NO_DATA') return `No ${name} results were received on ${s ? liveDayLabel(s.day) : 'this day'}. No data is not the same as normal activity.`;
  if (status === 'INSUFFICIENT_BASELINE') {
    return `${name} has ${s.baseline.observedDays} of 7 baseline days with data; at least 5 are needed before a score is calculated.`;
  }
  return `${name} scores ${s.score!.composite} (${s.score!.severity}) against its rolling 7-day baseline.`;
};

/** A live signal as a profile day (the shape the summaries use). */
export const liveProfileDay = (id: ProfileId, s: LiveSignal): ProfileDay => {
  const status = statusOf(s);
  const score = s.score ? { ...s.score, components: s.score.components.map((c) => tidyEvidence(c, s)) } : null;
  const scenario = liveScenario(s);
  const baseline: ProfileBaseline = {
    day: s.day,
    tests: s.baseline.meanTests === null ? 0 : Math.round(s.baseline.meanTests * 10) / 10,
    positives: 0,
    positivityRate: s.baseline.positivity ?? 0,
    sufficient: s.baseline.sufficient,
  };
  return {
    profileId: id,
    day: s.day as SimulationDay,
    scenario: { ...scenario, description: reasonFor(id, s, status) },
    baseline,
    score,
    status,
    statusReason: reasonFor(id, s, status),
  };
};

const inactiveDay = (id: ProfileId, day: number): ProfileDay => ({
  profileId: id,
  day: day as SimulationDay,
  scenario: {
    day: day as SimulationDay,
    stage: STATUS_LABEL.INACTIVE,
    description: NOT_LIVE_REASON(PROFILE_BY_ID[id].displayName),
    simulationDate: ALL_DATES[day - 1],
    totalTests: 0,
    totalPositives: 0,
    positivityRate: 0,
    affectedHospitals: [],
    affectedZipCodes: [],
    persistenceDays: 0,
  },
  baseline: { day, tests: 0, positives: 0, positivityRate: 0, sufficient: false },
  score: null,
  status: 'INACTIVE',
  statusReason: NOT_LIVE_REASON(PROFILE_BY_ID[id].displayName),
});

/** Every profile's reading on the latest closed day. Cholera and Gastrointestinal are inactive here. */
export const liveSummaries = (sim: LiveSimulator): ProfileSummary[] => {
  const day = sim.currentDay;
  return PROFILES.map((profile: SurveillanceProfile) => {
    if (!isLiveProfile(profile.id)) {
      const current = inactiveDay(profile.id, day);
      return { profile, current, previous: null, status: 'INACTIVE' as ProfileStatus, score: null, scoreChange: null };
    }
    const current = liveProfileDay(profile.id, sim.closed[profile.id][day]);
    const prevSignal = sim.closed[profile.id][day - 1];
    const previous = prevSignal ? liveProfileDay(profile.id, prevSignal) : null;
    return {
      profile,
      current,
      previous,
      status: current.status,
      score: current.score,
      scoreChange: current.score && previous?.score ? current.score.composite - previous.score.composite : null,
    };
  });
};

/** The open day's calculation so far, per live profile. */
export const liveProvisional = (sim: LiveSimulator): Partial<Record<ProfileId, ProfileDay>> =>
  Object.fromEntries(
    LIVE_PROFILES.flatMap((id) => {
      const s = sim.provisional[id];
      return s ? [[id, liveProfileDay(id, s)]] : [];
    }),
  ) as Partial<Record<ProfileId, ProfileDay>>;

const zipMetricsFor = (day: number, table: CountTable, s: LiveSignal | null): ZipMetrics[] => {
  const composite = s?.score?.composite ?? 0;
  const regionalRate = s?.positivityRate ?? 0;
  return ZIP_AREAS.map((area) => {
    const c = table[day]?.[area.hospitalId] ?? { tests: 0, positives: 0 };
    const rate = c.tests === 0 ? 0 : (c.positives / c.tests) * 100;
    const prev = table[day - 1]?.[area.hospitalId];
    const prevRate = prev && prev.tests ? (prev.positives / prev.tests) * 100 : null;
    const delta = prevRate === null ? null : rate - prevRate;
    const isAffected = Boolean(s?.affectedAreas.includes(area.zipCode));
    const raw = !isAffected || regionalRate === 0 ? 0 : Math.round((composite * rate) / regionalRate);
    const score = Math.min(Math.max(raw, 0), 100);
    let cumulativeTests = 0;
    let cumulativePositives = 0;
    for (let d = FIRST_LIVE_INDEX; d <= day; d += 1) {
      cumulativeTests += table[d]?.[area.hospitalId]?.tests ?? 0;
      cumulativePositives += table[d]?.[area.hospitalId]?.positives ?? 0;
    }
    return {
      zipCode: area.zipCode,
      city: area.city,
      state: area.state,
      hospitalId: area.hospitalId,
      hospitalName: HOSPITAL_BY_ID[area.hospitalId].name,
      totalTests: c.tests,
      positiveTests: c.positives,
      positivityRate: rate,
      cumulativeTests,
      cumulativePositives,
      trend: delta === null ? 'Baseline' : delta > 0.5 ? 'Increasing' : delta < -0.5 ? 'Decreasing' : 'Stable',
      severity: getSeverity(score),
      score,
      isAffected,
    };
  });
};

const hospitalMetricsFor = (
  sim: LiveSimulator,
  id: ProfileId,
  day: number,
  table: CountTable,
  zips: ZipMetrics[],
  observations: LabObservation[],
): HospitalMetrics[] => {
  const days: number[] = [];
  for (let d = FIRST_LIVE_INDEX - 1; d <= day; d += 1) days.push(d);
  const byTimeDesc = (a: LabObservation, b: LabObservation) => b.effectiveDateTime.localeCompare(a.effectiveDateTime);
  return HOSPITALS.map((hospital) => {
    const c = table[day]?.[hospital.id] ?? { tests: 0, positives: 0 };
    const cumulative = days.reduce(
      (acc, d) => ({ tests: acc.tests + (table[d]?.[hospital.id]?.tests ?? 0), positives: acc.positives + (table[d]?.[hospital.id]?.positives ?? 0) }),
      { tests: 0, positives: 0 },
    );
    const firstSignal = isLiveProfile(id)
      ? days.find((d) => d >= FIRST_LIVE_INDEX && sim.closed[id][d]?.affected.includes(hospital.id)) ?? null
      : null;
    const mine = observations.filter((o) => o.hospitalId === hospital.id);
    return {
      hospital,
      totalTests: c.tests,
      positiveTests: c.positives,
      positivityRate: c.tests ? (c.positives / c.tests) * 100 : 0,
      cumulativeTests: cumulative.tests,
      cumulativePositives: cumulative.positives,
      cumulativePositivityRate: cumulative.tests ? (cumulative.positives / cumulative.tests) * 100 : 0,
      firstSignalDay: firstSignal as SimulationDay | null,
      isAffected: Boolean(isLiveProfile(id) && sim.closed[id][day]?.affected.includes(hospital.id)),
      severity: zips.find((z) => z.hospitalId === hospital.id)?.severity ?? 'Low',
      dayObservations: mine.filter((o) => o.day === day).sort(byTimeDesc),
      observations: [...mine].sort(byTimeDesc),
      volumeSeries: days.map((d) => ({ day: d, tests: table[d]?.[hospital.id]?.tests ?? 0 })),
      positivitySeries: days.map((d) => {
        const x = table[d]?.[hospital.id];
        return { day: d, positivity: x && x.tests ? Number(((x.positives / x.tests) * 100).toFixed(1)) : 0 };
      }),
    };
  });
};

export interface LiveProfileView {
  scenario: ProfileDay['scenario'];
  score: ProfileDay['score'];
  baseline: ProfileBaseline;
  cumulativeTotals: { tests: number; positives: number; positivityRate: number };
  trendSeries: TrendPoint[];
  unscoredDays: number[];
  zipMetrics: ZipMetrics[];
  hospitalMetrics: HospitalMetrics[];
  observations: LabObservation[];
  dayOverDay: DayOverDayComparison | null;
  alerts: ProfileAlert[];
  privacy: AreaPrivacy;
  display: ProfileDisplay;
}

/** Positive results in the rolling baseline window: what the baseline rate would reveal. */
const baselineWindowPrivacy = (table: CountTable, day: number): PrivacyResult => {
  let positives = 0;
  for (let d = day - 7; d <= day - 1; d += 1) {
    (['HOSP-A', 'HOSP-B', 'HOSP-C'] as HospitalId[]).forEach((h) => (positives += table[d]?.[h]?.positives ?? 0));
  }
  return applyGeographicPrivacy({ count: positives, level: 'County', measure: 'baseline positive results', areaLabel: 'Worcester County' });
};

export const liveProfileView = (
  sim: LiveSimulator,
  id: ProfileId,
  summary: ProfileSummary,
  alerts: ProfileAlert[],
): LiveProfileView => {
  const day = sim.currentDay;
  const table = liveCountTable(sim, id);
  const signal = isLiveProfile(id) ? sim.closed[id][day] : null;
  const observations = isLiveProfile(id)
    ? sim.observations.filter((o) => PROFILE_BY_ID[id].testCodes.includes(o.loincCode))
    : [];
  const zips = zipMetricsFor(day, table, signal);
  const closedDays = isLiveProfile(id) ? Object.values(sim.closed[id]).filter((s) => s.day <= day).sort((a, b) => a.day - b.day) : [];
  const trendSeries: TrendPoint[] = closedDays.map((s) => ({
    day: s.day,
    dayLabel: liveDayLabel(s.day),
    tests: s.current.tests,
    positivity: s.positivityRate,
    score: s.score?.composite ?? 0,
    affectedZips: s.affectedAreas.length,
    affectedHospitals: s.affected.length,
    stage: statusOf(s) === 'ACTIVE_SIGNAL' ? `Active signal (${s.score!.severity})` : STATUS_LABEL[statusOf(s)],
  }));
  const unscoredDays = closedDays.filter((s) => !s.score).map((s) => s.day);
  const cumulative = closedDays
    .filter((s) => s.day >= FIRST_LIVE_INDEX)
    .reduce((acc, s) => ({ tests: acc.tests + s.current.tests, positives: acc.positives + s.current.positive }), { tests: 0, positives: 0 });
  const current = summary.current;
  const previous = summary.previous;
  const dayOverDay =
    current.score && previous?.score
      ? compareDays(day, { scenario: previous.scenario, composite: previous.score.composite }, { scenario: current.scenario, composite: current.score.composite })
      : null;

  // The small-count rule, applied to the live counts exactly as to the replay's.
  const regional = regionalPositivePrivacy(id, day, table);
  const baselinePrivacy = baselineWindowPrivacy(table, day);
  const withheldDays = new Set(closedDays.filter((s) => regionalPositivePrivacy(id, s.day, table).suppressed).map((s) => s.day));
  const lowVolume: LowVolumeNote | null =
    signal?.score && baselinePrivacy.suppressed
      ? {
          title: 'Small numbers',
          text: `${PROFILE_BY_ID[id].displayName}'s rolling baseline holds fewer than ${MINIMUM_DISPLAY_COUNT} positive results, so a change of one or two results moves its positivity — and its score — sharply. Read its score as illustrative.`,
        }
      : null;
  const ratesWithheld = regional.suppressed || baselinePrivacy.suppressed;
  const display: ProfileDisplay = {
    regional,
    baseline: baselinePrivacy,
    positives: regional.displayValue,
    positivity: rateDisplay(regional, current.scenario.positivityRate),
    baselinePositivity: signal?.baseline.positivity == null ? '—' : rateDisplay(baselinePrivacy, signal.baseline.positivity),
    ratesWithheld,
    trendSeries: trendSeries.map((p) => (withheldDays.has(p.day) ? { ...p, positivity: null as unknown as number } : p)),
    dayOverDay:
      dayOverDay && (regional.suppressed || withheldDays.has(day - 1))
        ? {
            ...dayOverDay,
            metrics: dayOverDay.metrics.map((m) =>
              m.label === 'Positive results' || m.label === 'Positivity'
                ? { ...m, previous: SUPPRESSED_VALUE, current: SUPPRESSED_VALUE, delta: 'Withheld (fewer than 5)' }
                : m,
            ),
          }
        : dayOverDay,
    facility: (h) => facilityPositivePrivacy(id, day, h, table),
    facilityOn: (h, d) => facilityPositivePrivacy(id, d, h, table),
    facilityPositivity: (h, rate) => rateDisplay(facilityPositivePrivacy(id, day, h, table), rate),
    facilityCumulative: (h) => facilityCumulativePositivePrivacy(id, day, h, table),
    evidence: (component) => componentEvidence(component, ratesWithheld),
    lowVolume,
  };

  return {
    scenario: current.scenario,
    score: current.score,
    baseline: current.baseline,
    cumulativeTotals: {
      ...cumulative,
      positivityRate: cumulative.tests ? (cumulative.positives / cumulative.tests) * 100 : 0,
    },
    trendSeries,
    unscoredDays,
    zipMetrics: zips,
    hospitalMetrics: hospitalMetricsFor(sim, id, day, table, zips, observations),
    observations,
    dayOverDay,
    alerts,
    privacy: areaPrivacyFor(id, day, table),
    display,
  };
};
