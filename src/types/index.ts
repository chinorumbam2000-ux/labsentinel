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
  totalTests: number;
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
  trend: 'Baseline' | 'Increasing' | 'Stable' | 'Decreasing';
  severity: Severity;
  score: number;
  isAffected: boolean;
}

export interface HospitalMetrics {
  hospital: Hospital;
  totalTests: number;
  positiveTests: number;
  positivityRate: number;
  firstSignalDay: SimulationDay | null;
  isAffected: boolean;
  severity: Severity;
  observations: LabObservation[];
  volumeSeries: Array<{ day: number; tests: number }>;
  positivitySeries: Array<{ day: number; positivity: number }>;
}

export type AlertStatus = 'NEW' | 'Acknowledged';

export type AlertKind =
  | 'volume'
  | 'positivity'
  | 'cluster'
  | 'regional';

export interface OutbreakAlert {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string;
  severity: Severity;
  geography: string;
  facilities: string;
  status: AlertStatus;
  triggeredDay: SimulationDay;
  time: string;
  /** Only the regional signal opens the full investigation view. */
  investigable: boolean;
}
