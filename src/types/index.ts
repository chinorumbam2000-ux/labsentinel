/**
 * LabSentinel shared domain types.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 * Every identifier, organization and observation described by these types is
 * fictional. Nothing here maps to a real patient, facility or EHR system.
 */

export type VendorName = 'Epic' | 'Oracle Health' | 'MEDITECH';

export type HospitalId = 'HOSP-A' | 'HOSP-B' | 'HOSP-C';

export type Severity = 'Low' | 'Watch' | 'Moderate' | 'High' | 'Critical';

export type ObservationResult = 'Positive' | 'Negative';

export type SimulationDay = 1 | 2 | 3 | 4 | 5;

export interface Hospital {
  id: HospitalId;
  name: string;
  vendor: VendorName;
  zipCode: string;
  city: string;
  county: string;
  state: string;
  /** Simulated EHR environment label. Never a real vendor product name. */
  environmentLabel: string;
}

export interface LabTest {
  name: string;
  shortName: string;
  loincCode: string;
  syndrome: string;
  specimen: string;
}

/** A synthetic FHIR-style Observation record. */
export interface LabObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final';
  day: SimulationDay;
  hospitalId: HospitalId;
  hospitalName: string;
  vendor: VendorName;
  syndrome: string;
  testName: string;
  loincCode: string;
  result: ObservationResult;
  effectiveDateTime: string;
  zipCode: string;
  county: string;
  state: string;
  patientId: string;
  fhirStatus: 'Received';
  normalized: boolean;
}

export interface SimulationScenario {
  day: SimulationDay;
  stage: string;
  description: string;
  /** Simulation-calendar date, distinct from the real session clock. */
  simulationDate: string;
  totalTests: number;
  totalPositives: number;
  /** Derived as totalPositives / totalTests. Unrounded. */
  positivityRate: number;
  affectedHospitals: HospitalId[];
  affectedZipCodes: string[];
  persistenceDays: number;
}

export interface ScoreComponent {
  key: 'volume' | 'positivity' | 'facilities' | 'geography' | 'persistence';
  label: string;
  /** Plain-language description of the raw input that produced the score. */
  evidence: string;
  /** Normalized 0-100 component score. */
  score: number;
  /** Weight as a fraction, e.g. 0.25. */
  weight: number;
  /** Maximum points this component can contribute, e.g. 25. */
  maxPoints: number;
  /** Actual points contributed to the composite, rounded for display. */
  points: number;
}

export interface SignalScoreResult {
  composite: number;
  severity: Severity;
  components: ScoreComponent[];
  volumeIncreasePercent: number;
  positivityDeltaPoints: number;
}

export interface ZipArea {
  zipCode: string;
  city: string;
  state: string;
  county: string;
  hospitalId: HospitalId;
  center: [number, number];
  /** Simplified synthetic polygon — NOT an official ZIP boundary. */
  polygon: Array<[number, number]>;
}

export interface ZipMetrics {
  zipCode: string;
  city: string;
  state: string;
  hospitalId: HospitalId;
  hospitalName: string;
  totalTests: number;
  positiveTests: number;
  positivityRate: number;
  /** Day 1 through the current day inclusive. */
  cumulativeTests: number;
  cumulativePositives: number;
  trend: 'Baseline' | 'Increasing' | 'Stable' | 'Decreasing';
  severity: Severity;
  score: number;
  isAffected: boolean;
}

export interface HospitalMetrics {
  hospital: Hospital;
  /** Current simulation day only. */
  totalTests: number;
  positiveTests: number;
  positivityRate: number;
  /** Day 1 through the current day inclusive. */
  cumulativeTests: number;
  cumulativePositives: number;
  cumulativePositivityRate: number;
  /** Null until this facility actually signals; never reveals a future day. */
  firstSignalDay: SimulationDay | null;
  isAffected: boolean;
  severity: Severity;
  /** Observations for the current day only. */
  dayObservations: LabObservation[];
  /** Observations from Day 1 through the current day. */
  observations: LabObservation[];
  volumeSeries: Array<{ day: number; tests: number }>;
  positivitySeries: Array<{ day: number; positivity: number }>;
}

export type AlertStatus = 'New' | 'Active' | 'Acknowledged';

export type AlertKind =
  | 'volume'
  | 'positivity'
  | 'cluster'
  | 'regional';

/**
 * A frozen snapshot of what was true at the moment an alert was detected.
 * These values never change as the simulation advances — that is the whole
 * point of an alert history.
 */
export interface AlertDetectionSnapshot {
  detail: string;
  severity: Severity;
  geography: string;
  facilities: string;
  totalTests: number;
  positivityRate: number;
  compositeScore: number;
  affectedHospitals: number;
  affectedZipCodes: number;
}

export interface AcknowledgementRecord {
  /** Simulation day on which the user acknowledged. */
  day: SimulationDay;
  /** Simulation-calendar timestamp of the acknowledgement. */
  simulationTime: string;
  /** Real wall-clock ISO timestamp of the acknowledgement. */
  realTime: string;
}

export interface OutbreakAlert {
  id: string;
  kind: AlertKind;
  title: string;
  /** Simulation day on which this alert was first detected. */
  detectedDay: SimulationDay;
  /** Simulation-calendar timestamp of detection. */
  detectedAt: string;
  /** Frozen detection-time values. */
  detection: AlertDetectionSnapshot;
  /** Only the regional signal opens the full investigation view. */
  investigable: boolean;
  status: AlertStatus;
  acknowledgement: AcknowledgementRecord | null;
}

/* ------------------------------------------------------------------------ *
 * Phase 1 — data trust, transparency and explainability.
 *
 * These describe how trustworthy the DATA is. They are deliberately separate
 * from the Composite Outbreak Signal Score, which describes how concerning the
 * EPIDEMIOLOGICAL SIGNAL is. The two must never be combined.
 * ------------------------------------------------------------------------ */

/** Operational state of one facility's simulated data feed. */
export type FeedStatus = 'HEALTHY' | 'DELAYED' | 'DEGRADED' | 'OFFLINE';

export interface FacilityFeedHealth {
  hospitalId: HospitalId;
  facilityName: string;
  vendor: VendorName;
  status: FeedStatus;
  /** Simulation-calendar timestamp of the most recent event. */
  lastEventAt: string;
  minutesSinceLastEvent: number;
  eventsReceived: number;
  terminologyMappedPercent: number;
  completenessPercent: number;
  failedEvents: number;
  duplicateEvents: number;
  /** Mean delivery latency, in seconds. */
  latencySeconds: number;
  /**
   * False only when the feed is OFFLINE. An offline feed means NO DATA IS
   * AVAILABLE — it must never be read as "no abnormal activity detected".
   */
  isReporting: boolean;
  /** Plain-language note explaining the current status. */
  note: string;
}

export type ConfidenceLevel = 'Very High' | 'High' | 'Moderate' | 'Low';

export interface ConfidenceComponent {
  key: 'freshness' | 'completeness' | 'terminology' | 'participation' | 'integrity';
  label: string;
  /** Normalized 0-100 component score. */
  score: number;
  /** Weight as a fraction, e.g. 0.30. */
  weight: number;
  /** Maximum points this component can contribute, e.g. 30. */
  maxPoints: number;
  /** Weighted contribution, rounded for display. */
  points: number;
  /** Plain-language description of what produced the score. */
  evidence: string;
}

export interface DataConfidenceResult {
  /** 0-100, rounded. Never combined with the outbreak signal score. */
  score: number;
  level: ConfidenceLevel;
  components: ConfidenceComponent[];
  /** Plain-language summary of overall data trustworthiness. */
  explanation: string;
  facilitiesReporting: number;
  facilitiesTotal: number;
  terminologyMappedPercent: number;
  completenessPercent: number;
  freshestMinutes: number;
  totalIssues: number;
  hasOfflineFacility: boolean;
}

export type ChangeDirection = 'up' | 'down' | 'none';

export interface DayOverDayMetric {
  label: string;
  previous: string;
  current: string;
  /** Formatted delta, e.g. "+18" or "No change". */
  delta: string;
  direction: ChangeDirection;
}

export interface DayOverDayComparison {
  available: boolean;
  previousDay: number | null;
  currentDay: number;
  metrics: DayOverDayMetric[];
  /** Plain-language explanation of why the score moved. */
  explanation: string;
  scoreDelta: number;
}
