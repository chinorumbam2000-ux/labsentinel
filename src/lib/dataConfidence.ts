/**
 * LabSentinel Data Confidence Score.
 *
 * This answers a DIFFERENT question from the Composite Outbreak Signal Score:
 *
 *   Composite Outbreak Signal Score → "How concerning is the signal?"
 *   Data Confidence Score           → "How trustworthy is the data behind it?"
 *
 * The two are never added, averaged or otherwise combined. A Critical signal
 * on Low-confidence data and a Critical signal on Very High-confidence data
 * should look different to an epidemiologist, and collapsing them into one
 * number would hide exactly that.
 *
 * Data Confidence is an illustrative prototype quality indicator.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  ConfidenceComponent,
  ConfidenceLevel,
  DataConfidenceResult,
  FacilityFeedHealth,
} from '../types';
import { TOTAL_FACILITIES, getAllFeedHealth } from '../data/feedHealth';

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(Math.max(value, min), max);

export const CONFIDENCE_WEIGHTS = {
  freshness: 0.3,
  completeness: 0.25,
  terminology: 0.2,
  participation: 0.15,
  integrity: 0.1,
} as const;

/** A feed this fresh scores full marks; past the ceiling it scores nothing. */
const FRESHNESS_FLOOR_MINUTES = 5;
const FRESHNESS_CEILING_MINUTES = 120;

/** Each 1% of failed or duplicate events costs this many integrity points. */
const INTEGRITY_PENALTY_PER_PERCENT = 4;

export const CONFIDENCE_DISCLAIMER =
  'Data Confidence is an illustrative prototype quality indicator.';

export const getConfidenceLevel = (score: number): ConfidenceLevel => {
  if (score >= 90) return 'Very High';
  if (score >= 75) return 'High';
  if (score >= 50) return 'Moderate';
  return 'Low';
};

/** Freshness for a single feed: 100 at the floor, 0 at the ceiling. */
export const freshnessFor = (minutesSinceLastEvent: number): number => {
  if (minutesSinceLastEvent <= FRESHNESS_FLOOR_MINUTES) return 100;
  if (minutesSinceLastEvent >= FRESHNESS_CEILING_MINUTES) return 0;
  const span = FRESHNESS_CEILING_MINUTES - FRESHNESS_FLOOR_MINUTES;
  return clamp(100 - ((minutesSinceLastEvent - FRESHNESS_FLOOR_MINUTES) / span) * 100);
};

/** Weighted mean across feeds, weighted by how many events each delivered. */
const weightedByEvents = (
  feeds: FacilityFeedHealth[],
  pick: (feed: FacilityFeedHealth) => number,
): number => {
  const reporting = feeds.filter((feed) => feed.isReporting);
  const totalEvents = reporting.reduce((sum, feed) => sum + feed.eventsReceived, 0);
  if (totalEvents === 0) return 0;
  return (
    reporting.reduce((sum, feed) => sum + pick(feed) * feed.eventsReceived, 0) / totalEvents
  );
};

const formatMinutes = (minutes: number): string => {
  if (minutes < 1) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
    : `${hours}h ${rest}m ago`;
};

/**
 * Calculates the Data Confidence Score from the facility feeds.
 *
 * Takes feeds rather than a day so the model stays pure and testable against
 * hand-built scenarios, including ones the five-day simulation never produces
 * (an offline facility, for example).
 */
export const calculateDataConfidence = (
  feeds: FacilityFeedHealth[],
  totalFacilities: number = TOTAL_FACILITIES,
): DataConfidenceResult => {
  const reporting = feeds.filter((feed) => feed.isReporting);
  const facilitiesReporting = reporting.length;
  const hasOfflineFacility = feeds.some((feed) => !feed.isReporting);

  // 1. Feed freshness — how recently data actually arrived.
  const freshnessScore =
    reporting.length === 0
      ? 0
      : reporting.reduce((sum, feed) => sum + freshnessFor(feed.minutesSinceLastEvent), 0) /
        reporting.length;
  const freshestMinutes =
    reporting.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...reporting.map((feed) => feed.minutesSinceLastEvent));

  // 2. Completeness — how many required fields were populated.
  const completenessScore = clamp(weightedByEvents(reporting, (f) => f.completenessPercent));

  // 3. Terminology mapping — how much mapped cleanly to LOINC.
  const terminologyScore = clamp(
    weightedByEvents(reporting, (f) => f.terminologyMappedPercent),
  );

  // 4. Participation — how many facilities are contributing at all.
  const participationScore =
    totalFacilities === 0 ? 0 : clamp((facilitiesReporting / totalFacilities) * 100);

  // 5. Integrity — failed and duplicate events as a share of delivery.
  const totalEvents = reporting.reduce((sum, feed) => sum + feed.eventsReceived, 0);
  const totalIssues = reporting.reduce(
    (sum, feed) => sum + feed.failedEvents + feed.duplicateEvents,
    0,
  );
  const issueRatePercent = totalEvents === 0 ? 100 : (totalIssues / totalEvents) * 100;
  const integrityScore = clamp(100 - issueRatePercent * INTEGRITY_PENALTY_PER_PERCENT);

  const score = Math.round(
    freshnessScore * CONFIDENCE_WEIGHTS.freshness +
      completenessScore * CONFIDENCE_WEIGHTS.completeness +
      terminologyScore * CONFIDENCE_WEIGHTS.terminology +
      participationScore * CONFIDENCE_WEIGHTS.participation +
      integrityScore * CONFIDENCE_WEIGHTS.integrity,
  );

  const level = getConfidenceLevel(score);

  const components: ConfidenceComponent[] = [
    {
      key: 'freshness',
      label: 'Feed Freshness',
      score: freshnessScore,
      weight: CONFIDENCE_WEIGHTS.freshness,
      maxPoints: CONFIDENCE_WEIGHTS.freshness * 100,
      points: Math.round(freshnessScore * CONFIDENCE_WEIGHTS.freshness),
      evidence:
        reporting.length === 0
          ? 'No facility has delivered data'
          : `Most recent event ${formatMinutes(freshestMinutes)}`,
    },
    {
      key: 'completeness',
      label: 'Data Completeness',
      score: completenessScore,
      weight: CONFIDENCE_WEIGHTS.completeness,
      maxPoints: CONFIDENCE_WEIGHTS.completeness * 100,
      points: Math.round(completenessScore * CONFIDENCE_WEIGHTS.completeness),
      evidence: `${completenessScore.toFixed(1)}% of required fields populated`,
    },
    {
      key: 'terminology',
      label: 'Terminology Mapping Quality',
      score: terminologyScore,
      weight: CONFIDENCE_WEIGHTS.terminology,
      maxPoints: CONFIDENCE_WEIGHTS.terminology * 100,
      points: Math.round(terminologyScore * CONFIDENCE_WEIGHTS.terminology),
      evidence: `${terminologyScore.toFixed(1)}% mapped to LOINC`,
    },
    {
      key: 'participation',
      label: 'Facility Participation',
      score: participationScore,
      weight: CONFIDENCE_WEIGHTS.participation,
      maxPoints: CONFIDENCE_WEIGHTS.participation * 100,
      points: Math.round(participationScore * CONFIDENCE_WEIGHTS.participation),
      evidence: `${facilitiesReporting} of ${totalFacilities} facilities reporting`,
    },
    {
      key: 'integrity',
      label: 'Data Integrity',
      score: integrityScore,
      weight: CONFIDENCE_WEIGHTS.integrity,
      maxPoints: CONFIDENCE_WEIGHTS.integrity * 100,
      points: Math.round(integrityScore * CONFIDENCE_WEIGHTS.integrity),
      evidence:
        totalIssues === 0
          ? 'No failed or duplicate events'
          : `${totalIssues} failed or duplicate ${
              totalIssues === 1 ? 'event' : 'events'
            } (${issueRatePercent.toFixed(1)}% of delivery)`,
    },
  ];

  const explanation = (() => {
    if (facilitiesReporting === 0) {
      return 'No facility is currently reporting, so there is no data to assess. Absence of data is not evidence that activity is normal.';
    }
    if (hasOfflineFacility) {
      const offline = feeds.filter((feed) => !feed.isReporting).length;
      return `Confidence is reduced because ${offline} of ${totalFacilities} ${
        offline === 1 ? 'facility is' : 'facilities are'
      } offline. Regional figures describe only the facilities still reporting — the missing sites are unknown, not normal.`;
    }
    const weakest = [...components].sort((a, b) => a.score - b.score)[0];
    if (score >= 90) {
      return `All ${facilitiesReporting} facilities are reporting, data is arriving promptly and mapping quality is high. The signal is well supported by the underlying data.`;
    }
    if (score >= 75) {
      return `All reporting facilities are delivering, but ${weakest.label.toLowerCase()} is the weakest contributor (${weakest.score.toFixed(
        0,
      )}/100). The signal is supported, with minor data-quality caveats.`;
    }
    if (score >= 50) {
      return `Data quality is mixed — ${weakest.label.toLowerCase()} is materially reduced (${weakest.score.toFixed(
        0,
      )}/100). Interpret the signal with caution and check the facility feeds.`;
    }
    return `Data quality is poor — ${weakest.label.toLowerCase()} is failing (${weakest.score.toFixed(
      0,
    )}/100). The signal should not be relied on until the feeds are restored.`;
  })();

  return {
    score,
    level,
    components,
    explanation,
    facilitiesReporting,
    facilitiesTotal: totalFacilities,
    terminologyMappedPercent: terminologyScore,
    completenessPercent: completenessScore,
    freshestMinutes: Number.isFinite(freshestMinutes) ? freshestMinutes : -1,
    totalIssues,
    hasOfflineFacility,
  };
};

/** Data confidence for a given simulation day. */
export const getDataConfidence = (day: number): DataConfidenceResult =>
  calculateDataConfidence(getAllFeedHealth(day));

export { formatMinutes as formatMinutesAgo };
