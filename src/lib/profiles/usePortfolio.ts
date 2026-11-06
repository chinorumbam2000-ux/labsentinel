/**
 * The portfolio and the selected profile's view, for the current replay day.
 *
 * The narrated profile (Respiratory Viral Syndrome) is shown with exactly the
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

  const summaries = useMemo(() => {
    const previousDay = surveillanceDays.find((d) => d.scenario.day === currentDay - 1);
    return summarizeProfiles(currentDay, {
      current: { scenario: currentScenario, score: signalScore },
      previous: previousDay ? { scenario: previousDay.scenario, score: scoreForDay(currentDay - 1) } : undefined,
    });
  }, [currentDay, currentScenario, signalScore, surveillanceDays, scoreForDay]);

  const ranked = useMemo(() => rankProfiles(summaries), [summaries]);
  const counts = useMemo(() => countStatuses(summaries), [summaries]);
  const alerts = useMemo(() => getProfileAlerts(currentDay, acknowledgements), [currentDay, acknowledgements]);
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
  const view = useMemo<ProfileView>(
    () => ({
      ...baseView,
      display: buildProfileDisplay(focusId, currentDay, baseView.trendSeries, baseView.dayOverDay, baseView.status),
    }),
    [baseView, focusId, currentDay],
  );

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
  };
}
