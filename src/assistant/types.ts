/**
 * Roella (Ask Roella) — types.
 *
 * Roella runs entirely in the browser. It answers from the same data the UI
 * shows (the active source's surveillance days, the signal scorer, data
 * confidence, facility and area selectors, alerts, privacy rules) plus a small
 * curated knowledge base. No question is ever sent anywhere.
 */
import type { OutbreakAlert, SimulationDay, SurveillanceDay } from '../types';

export type AssistantRoute =
  | 'dashboard'
  | 'map'
  | 'laboratory-data'
  | 'signals'
  | 'hospitals'
  | 'analytics'
  | 'simulation'
  | 'reports'
  | 'architecture'
  | 'overview'
  | 'fhir-ingestion'
  | 'dynamic-surveillance'
  | 'evaluation'
  | 'smart-demo'
  | 'other';

export type DataMode = 'local' | 'api';

/** What the assistant knows about where the analyst is. */
export interface AssistantContext {
  /** The simulation day currently shown everywhere in the app. */
  day: SimulationDay;
  route: AssistantRoute;
  /** The live alert list (with acknowledgement status) for the current day, when available. */
  alerts?: OutbreakAlert[];
  /** The active data source's surveillance days (what every page renders). Defaults to the browser's own. */
  days?: SurveillanceDay[];
  /**
   * Which data source the app is running on: 'local' (synthetic data computed
   * in the browser, no backend) or 'api' (the FastAPI + PostgreSQL backend).
   * Decides what Roella may say about backends and FHIR. Defaults to 'local'.
   */
  dataMode?: DataMode;
  /** Whether this build enables the SMART on FHIR sandbox launch. */
  smartEnabled?: boolean;
}

export type IntentId =
  | 'greeting'
  | 'about'
  | 'current_score'
  | 'score_explanation'
  | 'score_method'
  | 'severity_levels'
  | 'day_change'
  | 'day_overview'
  | 'situation_summary'
  | 'facilities'
  | 'facility_ranking'
  | 'vendors'
  | 'geography'
  | 'area_ranking'
  | 'positivity'
  | 'volume'
  | 'trend'
  | 'milestone'
  | 'persistence'
  | 'confidence'
  | 'alerts'
  | 'observations'
  | 'privacy'
  | 'investigate'
  | 'navigation'
  | 'page_help'
  | 'simulation_help'
  | 'reports'
  | 'architecture'
  | 'fhir'
  | 'smart'
  | 'loinc'
  | 'interoperability'
  | 'unsupported'
  | 'medical_advice'
  | 'out_of_scope';

export type AnswerBlock =
  | { kind: 'text'; text: string }
  | { kind: 'metrics'; items: Array<{ label: string; value: string }> }
  | { kind: 'list'; title?: string; items: string[] };

export interface AssistantAnswer {
  intent: IntentId;
  blocks: AnswerBlock[];
  /** Short suggested follow-up questions. */
  followUps: string[];
}

/** Lightweight, per-panel conversation memory (never persisted). */
export interface ConversationState {
  lastIntent?: IntentId;
  /** What "which one" / "them" refers to. */
  lastTopic?: 'facilities' | 'areas';
  lastDay?: SimulationDay;
  /** The previous question (normalized), so "what about Day 3?" keeps its focus. */
  lastQuestion?: string;
}
