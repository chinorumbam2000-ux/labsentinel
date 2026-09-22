/**
 * Multi-source surveillance architecture hooks.
 *
 * LabSentinel is LABORATORY-FIRST, and laboratory data is the only active
 * surveillance source in this prototype. Nothing here invents emergency
 * department, hospitalisation, wastewater or pharmacy data — doing so would
 * put fabricated signals in front of an analyst as though they were real
 * inputs, which is exactly the failure this project keeps guarding against.
 *
 * What this module does instead is define a source-agnostic signal shape and
 * prove it works by mapping the EXISTING synthetic laboratory data into it.
 * A future stream would implement the same adapter interface; until one does,
 * it reports itself as PLANNED and returns nothing.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 */
import type {
  SourceAvailability,
  SurveillanceSignal,
  SurveillanceSourceDefinition,
  SurveillanceSourceType,
} from '../types';
import { HOSPITALS, HOSPITAL_BY_ID } from '../data/hospitals';
import { SYNDROME } from '../data/tests';
import { getSiteCounts, positivityOf, HOSPITAL_IDS } from '../data/dataset';
import { getAllFeedHealth } from '../data/feedHealth';
import { simulationTimestamp } from '../data/simulation';
import { ACTIVE_HIERARCHY } from '../data/geography';

export const MULTI_SOURCE_NOTE =
  'The current LabSentinel prototype is laboratory-first. The architecture is designed to support additional surveillance streams in future versions, including emergency-department activity, hospitalization, wastewater and pharmacy signals.';

/**
 * The stream types the architecture accepts. Only LABORATORY is ACTIVE; the
 * rest are declared so the shape of the abstraction is visible and testable.
 */
export const SURVEILLANCE_SOURCES: SurveillanceSourceDefinition[] = [
  {
    type: 'LABORATORY',
    label: 'Laboratory results',
    availability: 'ACTIVE',
    description:
      'Normalized FHIR-style Observation resources from participating laboratories. The only stream carrying data in this prototype.',
    exampleMetrics: ['test_volume', 'positivity_rate'],
  },
  {
    type: 'EMERGENCY_DEPARTMENT',
    label: 'Emergency department activity',
    availability: 'PLANNED',
    description:
      'Chief-complaint and syndromic categorisation of ED visits. Would give an earlier, less specific signal than laboratory confirmation.',
    exampleMetrics: ['visit_count', 'syndromic_share'],
  },
  {
    type: 'HOSPITALIZATION',
    label: 'Hospitalization',
    availability: 'PLANNED',
    description:
      'Admissions and bed occupancy attributable to the syndrome. A severity signal rather than an incidence signal.',
    exampleMetrics: ['admissions', 'occupancy_rate'],
  },
  {
    type: 'WASTEWATER',
    label: 'Wastewater',
    availability: 'PLANNED',
    description:
      'Pathogen concentration from sewershed sampling. Population-level and independent of who seeks testing, so it can lead clinical signals.',
    exampleMetrics: ['copies_per_litre', 'normalized_concentration'],
  },
  {
    type: 'PHARMACY',
    label: 'Pharmacy',
    availability: 'PLANNED',
    description:
      'Over-the-counter and prescription dispensing patterns. A behavioural proxy that can move before testing does.',
    exampleMetrics: ['dispense_count', 'category_share'],
  },
  {
    type: 'OTHER',
    label: 'Other streams',
    availability: 'PLANNED',
    description:
      'An extension point for school absenteeism, telehealth triage, veterinary surveillance or any stream a jurisdiction already collects.',
    exampleMetrics: ['count', 'rate'],
  },
];

export const getSourceDefinition = (
  type: SurveillanceSourceType,
): SurveillanceSourceDefinition | undefined =>
  SURVEILLANCE_SOURCES.find((source) => source.type === type);

export const getSourceAvailability = (
  type: SurveillanceSourceType,
): SourceAvailability => getSourceDefinition(type)?.availability ?? 'PLANNED';

export const getActiveSourceTypes = (): SurveillanceSourceType[] =>
  SURVEILLANCE_SOURCES.filter((source) => source.availability === 'ACTIVE').map(
    (source) => source.type,
  );

/**
 * The contract a surveillance stream implements. A future wastewater or ED
 * adapter would provide exactly this and nothing else would need to change.
 */
export interface SurveillanceSourceAdapter {
  type: SurveillanceSourceType;
  availability: SourceAvailability;
  /** Signals for a simulation day. A PLANNED source returns an empty array. */
  getSignals: (day: number) => SurveillanceSignal[];
}

/** Clock used when mapping a day's aggregate into a point-in-time signal. */
const AGGREGATE_CLOCK = '20:15';

/**
 * The laboratory adapter — the only implemented one. It reads the existing
 * authoritative dataset; it does not introduce any new data.
 */
export const laboratoryAdapter: SurveillanceSourceAdapter = {
  type: 'LABORATORY',
  availability: 'ACTIVE',
  getSignals: (day: number): SurveillanceSignal[] => {
    const feeds = getAllFeedHealth(day);

    return HOSPITAL_IDS.flatMap((hospitalId) => {
      const hospital = HOSPITAL_BY_ID[hospitalId];
      const counts = getSiteCounts(day, hospitalId);
      const feed = feeds.find((item) => item.hospitalId === hospitalId);

      const geography = {
        unitId: hospital.zipCode,
        level: 'zip',
        label: `${hospital.zipCode} (${hospital.city}, ${hospital.state})`,
        countryCode: ACTIVE_HIERARCHY.countryCode,
      };
      const organization = {
        id: hospital.id,
        name: hospital.name,
        vendor: hospital.vendor,
      };
      // Quality carries the feed's own mapping and completeness, so a
      // downstream consumer can weight a signal by how trustworthy it is.
      const quality = feed
        ? Math.round((feed.terminologyMappedPercent + feed.completenessPercent) / 2)
        : 0;
      const timestamp = simulationTimestamp(day, AGGREGATE_CLOCK);

      return [
        {
          sourceType: 'LABORATORY' as const,
          timestamp,
          geography,
          organization,
          syndrome: SYNDROME,
          metric: 'test_volume',
          value: counts.tests,
          quality,
        },
        {
          sourceType: 'LABORATORY' as const,
          timestamp,
          geography,
          organization,
          syndrome: SYNDROME,
          metric: 'positivity_rate',
          value: Number(positivityOf(counts).toFixed(2)),
          quality,
        },
      ];
    });
  },
};

/** A stream that is declared but not implemented. Always returns nothing. */
const plannedAdapter = (type: SurveillanceSourceType): SurveillanceSourceAdapter => ({
  type,
  availability: 'PLANNED',
  // Deliberately empty: a planned stream must never fabricate observations.
  getSignals: () => [],
});

export const SOURCE_ADAPTERS: SurveillanceSourceAdapter[] = [
  laboratoryAdapter,
  plannedAdapter('EMERGENCY_DEPARTMENT'),
  plannedAdapter('HOSPITALIZATION'),
  plannedAdapter('WASTEWATER'),
  plannedAdapter('PHARMACY'),
  plannedAdapter('OTHER'),
];

/**
 * All signals from every ACTIVE adapter. Today that is laboratory only, so
 * this returns exactly the laboratory signals — which is the point: the
 * dashboard's inputs do not change when the abstraction is introduced.
 */
export const getAllSurveillanceSignals = (day: number): SurveillanceSignal[] =>
  SOURCE_ADAPTERS.filter((adapter) => adapter.availability === 'ACTIVE').flatMap(
    (adapter) => adapter.getSignals(day),
  );

/** Facility count, used by the architecture page to describe the current shape. */
export const PARTICIPATING_FACILITY_COUNT = HOSPITALS.length;

/* ---------------------------------------------------------------- *
 * Federated surveillance — a future concept, not implemented.
 * ---------------------------------------------------------------- */

export const FEDERATED_NOTE =
  'Federated surveillance can reduce unnecessary movement of patient-level information by allowing local systems to calculate and share aggregated surveillance signals.';

export const FUTURE_CONCEPT_LABEL =
  'Future Architecture Concept — not implemented in the current prototype.';

export interface FederatedAggregatePayload {
  facilityId: string;
  syndrome: string;
  geography: string;
  timestamp: string;
  testVolume: number;
  positivityRate: number;
  anomalyScore: number;
  confidenceScore: number;
}

/**
 * Builds an ILLUSTRATIVE example of what a facility would send under a
 * federated model. It is rendered as a sample payload on the architecture
 * page and is never ingested by the running signal engine — the prototype's
 * synthetic Observation pipeline is untouched.
 */
export const buildExampleAggregatePayload = (
  day: number,
  hospitalId: (typeof HOSPITAL_IDS)[number] = 'HOSP-A',
): FederatedAggregatePayload => {
  const hospital = HOSPITAL_BY_ID[hospitalId];
  const counts = getSiteCounts(day, hospitalId);
  const feed = getAllFeedHealth(day).find((item) => item.hospitalId === hospitalId);

  return {
    facilityId: hospital.id,
    syndrome: SYNDROME,
    geography: hospital.zipCode,
    timestamp: simulationTimestamp(day, AGGREGATE_CLOCK),
    testVolume: counts.tests,
    positivityRate: Number(positivityOf(counts).toFixed(2)),
    // An anomaly score would be computed locally by the facility, not centrally.
    anomalyScore: Number(
      Math.min(Math.max(positivityOf(counts) - 8, 0) * 6, 100).toFixed(1),
    ),
    confidenceScore: feed
      ? Math.round((feed.terminologyMappedPercent + feed.completenessPercent) / 2)
      : 0,
  };
};
