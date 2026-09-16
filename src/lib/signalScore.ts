/**
 * LabSentinel Composite Outbreak Signal Score.
 *
 * IMPORTANT: The Composite Outbreak Signal Score used in this prototype is an
 * illustrative, non-validated demonstration model. It is not intended for
 * clinical diagnosis or public-health decision-making.
 *
 * The score is always CALCULATED from the five weighted components below.
 * No day's score is hard-coded anywhere in this codebase.
 */
import type {
  ScoreComponent,
  Severity,
  SignalScoreResult,
  SimulationScenario,
} from '../types';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../data/simulation';

export const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(Math.max(value, min), max);

export const SCORE_WEIGHTS = {
  volume: 0.25,
  positivity: 0.3,
  facilities: 0.2,
  geography: 0.15,
  persistence: 0.1,
} as const;

/** Denominators that define "full signal" for each normalized component. */
const POSITIVITY_RANGE_POINTS = 15;
const MAX_FACILITIES = 3;
const MAX_ZIP_CODES = 3;
const MAX_PERSISTENCE_DAYS = 4;

export interface SignalScoreInput {
  totalTests: number;
  positivityRate: number;
  affectedFacilities: number;
  affectedZipCodes: string[];
  persistenceDays: number;
  baselineTestVolume?: number;
  baselinePositivityRate?: number;
}

export const getSeverity = (score: number): Severity => {
  if (score < 20) return 'Low';
  if (score < 40) return 'Watch';
  if (score < 65) return 'Moderate';
  if (score < 85) return 'High';
  return 'Critical';
};

const formatPercent = (value: number, digits = 1): string =>
  `${value.toFixed(digits)}%`;

export const calculateSignalScore = (input: SignalScoreInput): SignalScoreResult => {
  const baselineTestVolume = input.baselineTestVolume ?? BASELINE_TEST_VOLUME;
  const baselinePositivityRate =
    input.baselinePositivityRate ?? BASELINE_POSITIVITY_RATE;

  const volumeIncreasePercent =
    ((input.totalTests - baselineTestVolume) / baselineTestVolume) * 100;
  const positivityDeltaPoints = input.positivityRate - baselinePositivityRate;

  const volumeScore = clamp(volumeIncreasePercent);
  const positivityScore = clamp((positivityDeltaPoints / POSITIVITY_RANGE_POINTS) * 100);
  const facilityScore = clamp((input.affectedFacilities / MAX_FACILITIES) * 100);
  const geographyScore = clamp((input.affectedZipCodes.length / MAX_ZIP_CODES) * 100);
  const persistenceScore = clamp((input.persistenceDays / MAX_PERSISTENCE_DAYS) * 100);

  const composite = Math.round(
    volumeScore * SCORE_WEIGHTS.volume +
      positivityScore * SCORE_WEIGHTS.positivity +
      facilityScore * SCORE_WEIGHTS.facilities +
      geographyScore * SCORE_WEIGHTS.geography +
      persistenceScore * SCORE_WEIGHTS.persistence,
  );

  const components: ScoreComponent[] = [
    {
      key: 'volume',
      label: 'Test Volume',
      evidence: `${input.totalTests} tests vs baseline ${baselineTestVolume} (${
        volumeIncreasePercent >= 0 ? '+' : ''
      }${volumeIncreasePercent.toFixed(0)}%)`,
      score: volumeScore,
      weight: SCORE_WEIGHTS.volume,
      maxPoints: SCORE_WEIGHTS.volume * 100,
      points: Math.round(volumeScore * SCORE_WEIGHTS.volume),
    },
    {
      key: 'positivity',
      label: 'Positivity',
      evidence: `${formatPercent(baselinePositivityRate)} → ${formatPercent(
        input.positivityRate,
      )} (${positivityDeltaPoints >= 0 ? '+' : ''}${positivityDeltaPoints.toFixed(
        1,
      )} percentage points)`,
      score: positivityScore,
      weight: SCORE_WEIGHTS.positivity,
      maxPoints: SCORE_WEIGHTS.positivity * 100,
      points: Math.round(positivityScore * SCORE_WEIGHTS.positivity),
    },
    {
      key: 'facilities',
      label: 'Affected Facilities',
      evidence: `${input.affectedFacilities} of ${MAX_FACILITIES} participating facilities reporting elevated activity`,
      score: facilityScore,
      weight: SCORE_WEIGHTS.facilities,
      maxPoints: SCORE_WEIGHTS.facilities * 100,
      points: Math.round(facilityScore * SCORE_WEIGHTS.facilities),
    },
    {
      key: 'geography',
      label: 'Geographic Spread',
      evidence:
        input.affectedZipCodes.length === 0
          ? 'No surveillance area currently affected'
          : `${input.affectedZipCodes.length} of ${MAX_ZIP_CODES} surveillance areas affected (${input.affectedZipCodes.join(', ')})`,
      score: geographyScore,
      weight: SCORE_WEIGHTS.geography,
      maxPoints: SCORE_WEIGHTS.geography * 100,
      points: Math.round(geographyScore * SCORE_WEIGHTS.geography),
    },
    {
      key: 'persistence',
      label: 'Persistence',
      evidence: `${input.persistenceDays} of ${MAX_PERSISTENCE_DAYS} consecutive days above baseline`,
      score: persistenceScore,
      weight: SCORE_WEIGHTS.persistence,
      maxPoints: SCORE_WEIGHTS.persistence * 100,
      points: Math.round(persistenceScore * SCORE_WEIGHTS.persistence),
    },
  ];

  return {
    composite,
    severity: getSeverity(composite),
    components,
    volumeIncreasePercent,
    positivityDeltaPoints,
  };
};

/** Convenience wrapper: score a five-day simulation scenario directly. */
export const scoreScenario = (scenario: SimulationScenario): SignalScoreResult =>
  calculateSignalScore({
    totalTests: scenario.totalTests,
    positivityRate: scenario.positivityRate,
    affectedFacilities: scenario.affectedHospitals.length,
    affectedZipCodes: scenario.affectedZipCodes,
    persistenceDays: scenario.persistenceDays,
  });

export const SCORE_DISCLAIMER =
  'The LabSentinel Composite Outbreak Signal Score used in this prototype is an illustrative, non-validated demonstration model and is not intended for clinical diagnosis or public-health decision-making.';

export const SIGNAL_DISCLAIMER =
  'Early-warning signal — not a confirmed outbreak. Epidemiological review required.';
