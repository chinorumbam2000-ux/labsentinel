/**
 * The portfolio and the selected profile's view, for the current replay day.
 *
 * The narrated profile (Respiratory Viral Activity) is shown with exactly the
 * values the active data source supplied — the same objects every page used
 * before profiles existed — so its screens are unchanged in local and API
 * mode. Other profiles come from the browser's per-profile derivation.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  DayOverDayComparison,
  HospitalMetrics,
  LabObservation,
  SignalScoreResult,
  SimulationScenario,
  ZipMetrics,
} from '../../types';
import { useSimulation } from '../../context/SimulationContext';
import { useOptionalLiveSurveillance, type SurveillanceMode } from '../../context/LiveSurveillanceContext';
import { calculateDataConfidence } from '../dataConfidence';
import { liveDayLabel, liveProfileView, liveSummaries } from '../live/view';
import type { DataConfidenceResult, FacilityFeedHealth } from '../../types';
import type { TrendPoint } from '../analytics';
import { compareDays } from '../dayOverDay';
import { PROFILE_BY_ID, RVS_PROFILE_ID, type ProfileId, type SurveillanceProfile } from './registry';
import { areaPrivacyFor, type AreaPrivacy } from './privacy';
import { buildProfileDisplay, type ProfileDisplay } from './display';
import {
  PROFILE_SITE_DAY_COUNTS,
  profileHospitalMetrics,
  profileObservationsThrough,
  profileTrendSeries,
  profileZipMetrics,
  type ProfileBaseline,
  type ProfileStatus,
} from './derive';
import {
  countStatuses,
  getProfileAlerts,
  rankProfiles,
  summarizeProfiles,
  type ProfileAlert,
  type ProfileSummary,
  type StatusCounts,
} from './portfolio';
import {
  PROFILE_PARAM,
  focusProfileFor,
  parseSelection,
  type ProfileSelection,
} from './selection';

export interface ProfileView {
  profile: SurveillanceProfile;
  /** True for the narrated Scenario Replay profile. */
  isNarrated: boolean;
  summary: ProfileSummary;
  status: ProfileStatus;
  statusReason: string;
  scenario: SimulationScenario;
  /** Null when the profile has no data or no usable baseline on this day. */
  score: SignalScoreResult | null;
  baseline: ProfileBaseline;
  cumulativeTotals: { tests: number; positives: number; positivityRate: number };
  trendSeries: TrendPoint[];
  zipMetrics: ZipMetrics[];
  hospitalMetrics: HospitalMetrics[];
  /** Day 1 through the current day. */
  observations: LabObservation[];
  dayOverDay: DayOverDayComparison | null;
  alerts: ProfileAlert[];
  /** Small-count suppression for this profile's area counts. */
  privacy: AreaPrivacy;
  /** Every count and rate as it may be displayed (small-count rule applied). */
  display: ProfileDisplay;
  /** Days in the trend series that have no score (never plotted as 0). */
  unscoredDays?: number[];
}

/**
 * The surveillance period every page is showing, and the source-wide
 * readings that go with it. Scenario Replay: the replay day. Live
 * Surveillance: the latest closed day of the live simulation.
 */
export interface SurveillancePeriod {
  mode: SurveillanceMode;
  /** The day index the views show. */
  day: number;
  /** "Day 5" in Scenario Replay, "Feb 12" in Live Surveillance. */
  label: (day: number) => string;
  currentLabel: string;
  /** ISO date of the day shown. */
  date: string;
  dataConfidence: DataConfidenceResult;
  feedHealth: FacilityFeedHealth[];
}

export interface Portfolio {
  selection: ProfileSelection;
  invalidSelection: string | null;
  setSelection: (next: ProfileSelection) => void;
  summaries: ProfileSummary[];
  ranked: ProfileSummary[];
  counts: StatusCounts;
  alerts: ProfileAlert[];
  focusId: ProfileId;
  view: ProfileView;
  period: SurveillancePeriod;
}

export function useProfileSelection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selection, invalid } = parseSelection(searchParams.get(PROFILE_PARAM));
  const setSelection = useCallback(
    (next: ProfileSelection) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          params.set(PROFILE_PARAM, next);
          return params;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );
  return { selection, invalid, setSelection };
}

export function usePortfolio(): Portfolio {
  const sim = useSimulation();
  const live = useOptionalLiveSurveillance();
  const isLive = live?.mode === 'live';
  const liveVersion = live?.version ?? 0;
  const { selection, invalid, setSelection } = useProfileSelection();
  const {
    currentDay,
    currentScenario,
    signalScore,
    surveillanceDays,
    scoreForDay,
    acknowledgements,
    cumulativeTotals,
    trendSeries,
    zipMetrics,
    hospitalMetrics,
    visibleObservations,
    dayOverDay,
  } = sim;

  const replaySummaries = useMemo(() => {
    const previousDay = surveillanceDays.find((d) => d.scenario.day === currentDay - 1);
    return summarizeProfiles(currentDay, {
      current: { scenario: currentScenario, score: signalScore },
      previous: previousDay ? { scenario: previousDay.scenario, score: scoreForDay(currentDay - 1) } : undefined,
    });
  }, [currentDay, currentScenario, signalScore, surveillanceDays, scoreForDay]);

  // Live Surveillance: the same shapes, from the simulator's latest closed day.
  const liveAcks = live?.acknowledgements;
  const liveSim = live?.simulator;
  const liveState = useMemo(() => {
    if (!isLive || !liveSim) return null;
    return {
      summaries: liveSummaries(liveSim),
      alerts: liveSim.alerts(liveAcks) as ProfileAlert[],
      feedHealth: liveSim.feedHealth(),
    };
    // liveVersion changes whenever the simulator does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, liveSim, liveVersion, liveAcks]);

  const summaries = liveState ? liveState.summaries : replaySummaries;
  const ranked = useMemo(() => rankProfiles(summaries), [summaries]);
  const counts = useMemo(() => countStatuses(summaries), [summaries]);
  const replayAlerts = useMemo(() => getProfileAlerts(currentDay, acknowledgements), [currentDay, acknowledgements]);
  const alerts = liveState ? liveState.alerts : replayAlerts;
  const focusId = focusProfileFor(selection, summaries);

  const baseView = useMemo<Omit<ProfileView, 'display'>>(() => {
    const summary = summaries.find((s) => s.profile.id === focusId) ?? summaries[0];
    const profileAlerts = alerts.filter((a) => a.profileId === focusId);
    if (focusId === RVS_PROFILE_ID) {
      return {
        profile: PROFILE_BY_ID[focusId],
        isNarrated: true,
        summary,
        status: summary.status,
        statusReason: summary.current.statusReason,
        scenario: currentScenario,
        score: signalScore,
        baseline: summary.current.baseline,
        cumulativeTotals,
        trendSeries,
        zipMetrics,
        hospitalMetrics,
        observations: visibleObservations,
        dayOverDay,
        alerts: profileAlerts,
        privacy: areaPrivacyFor(focusId, currentDay),
      };
    }
    const counts = PROFILE_SITE_DAY_COUNTS[focusId];
    const cumulative = Object.entries(counts)
      .filter(([day]) => Number(day) <= currentDay)
      .flatMap(([, sites]) => Object.values(sites))
      .reduce((acc, site) => ({ tests: acc.tests + site.tests, positives: acc.positives + site.positives }), {
        tests: 0,
        positives: 0,
      });
    const { current, previous } = summary;
    return {
      profile: PROFILE_BY_ID[focusId],
      isNarrated: false,
      summary,
      status: summary.status,
      statusReason: current.statusReason,
      scenario: current.scenario,
      score: current.score,
      baseline: current.baseline,
      cumulativeTotals: {
        ...cumulative,
        positivityRate: cumulative.tests === 0 ? 0 : (cumulative.positives / cumulative.tests) * 100,
      },
      trendSeries: profileTrendSeries(focusId, currentDay),
      zipMetrics: profileZipMetrics(focusId, currentDay),
      hospitalMetrics: profileHospitalMetrics(focusId, currentDay),
      observations: profileObservationsThrough(focusId, currentDay),
      dayOverDay:
        current.score && (!previous || previous.score)
          ? compareDays(
              currentDay,
              previous?.score ? { scenario: previous.scenario, composite: previous.score.composite } : null,
              { scenario: current.scenario, composite: current.score.composite },
            )
          : null,
      alerts: profileAlerts,
      privacy: areaPrivacyFor(focusId, currentDay),
    };
  }, [
    summaries,
    focusId,
    alerts,
    currentDay,
    currentScenario,
    signalScore,
    cumulativeTotals,
    trendSeries,
    zipMetrics,
    hospitalMetrics,
    visibleObservations,
    dayOverDay,
  ]);
  const replayView = useMemo<ProfileView>(
    () => ({
      ...baseView,
      display: buildProfileDisplay(focusId, currentDay, baseView.trendSeries, baseView.dayOverDay, baseView.status),
    }),
    [baseView, focusId, currentDay],
  );

  const liveView = useMemo<ProfileView | null>(() => {
    if (!liveState || !liveSim) return null;
    const summary = liveState.summaries.find((s) => s.profile.id === focusId) ?? liveState.summaries[0];
    const built = liveProfileView(
      liveSim,
      focusId,
      summary,
      liveState.alerts.filter((a) => a.profileId === focusId),
    );
    return {
      profile: PROFILE_BY_ID[focusId],
      isNarrated: false,
      summary,
      status: summary.status,
      statusReason: summary.current.statusReason,
      ...built,
    };
  }, [liveState, liveSim, focusId]);

  const view = liveView ?? replayView;

  const period = useMemo<SurveillancePeriod>(() => {
    if (liveState && liveSim) {
      const day = liveSim.currentDay;
      return {
        mode: 'live',
        day,
        label: liveDayLabel,
        currentLabel: liveDayLabel(day),
        date: summaries[0].current.scenario.simulationDate,
        // The existing Data Confidence model, fed from the live source telemetry.
        dataConfidence: calculateDataConfidence(liveState.feedHealth),
        feedHealth: liveState.feedHealth,
      };
    }
    return {
      mode: 'replay',
      day: currentDay,
      label: (day: number) => `Day ${day}`,
      currentLabel: `Day ${currentDay}`,
      date: sim.simulationDate,
      dataConfidence: sim.dataConfidence,
      feedHealth: sim.feedHealth,
    };
  }, [liveState, liveSim, summaries, currentDay, sim.simulationDate, sim.dataConfidence, sim.feedHealth]);

  return {
    selection,
    invalidSelection: invalid,
    setSelection,
    summaries,
    ranked,
    counts,
    alerts,
    focusId,
    view,
    period,
  };
}
