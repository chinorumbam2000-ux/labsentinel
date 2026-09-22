/**
 * Configurable geographic hierarchy.
 *
 * ZIP codes are a United States artefact. Most of the world does not have
 * them, so hard-coding ZIP as *the* geographic unit would have made this
 * prototype unusable outside the US. Geography is therefore a configuration:
 * a deployment declares its own levels and units, and the rest of the
 * application — including the privacy roll-up chain — follows that config.
 *
 * The Worcester prototype keeps using ZIP → County → State exactly as before.
 * The global template below declares an alternative level structure only; no
 * second-country dataset is built here.
 *
 * DEMO ENVIRONMENT — Synthetic data only. Every unit below is fictional or a
 * coarse public administrative name; no patient location exists anywhere.
 */
import type {
  GeographicHierarchy,
  GeographicLevelDefinition,
  GeographicLevelId,
  GeographicUnit,
} from '../types';
import { HOSPITALS } from './hospitals';
import { ZIP_AREAS } from './zipAreas';

/* ---------------------------------------------------------------- *
 * United States configuration — what the current prototype runs on.
 * ---------------------------------------------------------------- */

export const US_LEVELS: GeographicLevelDefinition[] = [
  { id: 'facility', label: 'Facility', longLabel: 'Participating facility', rank: 0 },
  { id: 'zip', label: 'ZIP', longLabel: 'ZIP Code', rank: 1 },
  { id: 'county', label: 'County', longLabel: 'County', rank: 2 },
  { id: 'state', label: 'State', longLabel: 'State', rank: 3 },
  { id: 'country', label: 'Country', longLabel: 'Country', rank: 4 },
];

const US_COUNTRY: GeographicUnit = {
  id: 'US',
  name: 'United States',
  type: 'country',
  parentId: null,
  countryCode: 'US',
};

const US_STATE: GeographicUnit = {
  id: 'US-MA',
  name: 'Massachusetts',
  type: 'state',
  parentId: 'US',
  countryCode: 'US',
};

const US_COUNTY: GeographicUnit = {
  id: 'US-MA-WORCESTER',
  name: 'Worcester County',
  type: 'county',
  parentId: 'US-MA',
  countryCode: 'US',
};

/** ZIP units are derived from the existing surveillance areas. */
const US_ZIP_UNITS: GeographicUnit[] = ZIP_AREAS.map((area) => ({
  id: area.zipCode,
  name: `${area.zipCode} (${area.city}, ${area.state})`,
  type: 'zip',
  parentId: US_COUNTY.id,
  countryCode: 'US',
}));

/** Facility units are derived from the existing participating hospitals. */
const US_FACILITY_UNITS: GeographicUnit[] = HOSPITALS.map((hospital) => ({
  id: hospital.id,
  name: hospital.name,
  type: 'facility',
  parentId: hospital.zipCode,
  countryCode: 'US',
}));

export const US_HIERARCHY: GeographicHierarchy = {
  id: 'us-worcester',
  label: 'United States — Worcester County, MA',
  countryCode: 'US',
  levels: US_LEVELS,
  units: [US_COUNTRY, US_STATE, US_COUNTY, ...US_ZIP_UNITS, ...US_FACILITY_UNITS],
  description:
    'The configuration the current prototype runs on. Facility → ZIP Code → County → State → Country, covering three synthetic surveillance areas in Worcester County, Massachusetts.',
};

/* ---------------------------------------------------------------- *
 * Global template — level structure only, deliberately no units.
 * ---------------------------------------------------------------- */

export const GLOBAL_LEVELS: GeographicLevelDefinition[] = [
  { id: 'facility', label: 'Facility', longLabel: 'Participating facility', rank: 0 },
  { id: 'district', label: 'District', longLabel: 'District', rank: 1 },
  { id: 'province', label: 'Province', longLabel: 'Province or region', rank: 2 },
  { id: 'country', label: 'Country', longLabel: 'Country', rank: 3 },
];

/**
 * An example of a non-US configuration. It carries no units on purpose — this
 * phase makes the architecture configurable, it does not build a second
 * country's dataset.
 */
export const GLOBAL_TEMPLATE_HIERARCHY: GeographicHierarchy = {
  id: 'global-template',
  label: 'Global template — District → Province → Country',
  countryCode: 'XX',
  levels: GLOBAL_LEVELS,
  units: [],
  description:
    'An example alternative configuration for deployments without ZIP codes. Declared as a template only — no units are defined and no data is attached to it in this prototype.',
};

export const AVAILABLE_HIERARCHIES: GeographicHierarchy[] = [
  US_HIERARCHY,
  GLOBAL_TEMPLATE_HIERARCHY,
];

/**
 * The hierarchy the running prototype uses. Changing this one binding is what
 * would retarget the application at a different jurisdictional structure.
 */
export const ACTIVE_HIERARCHY: GeographicHierarchy = US_HIERARCHY;

export const GEOGRAPHY_CONFIGURABILITY_NOTE =
  'LabSentinel is geographically configurable. ZIP codes are used in the U.S. prototype, but deployments may use districts, municipalities, provinces, regions or other jurisdictional units.';

/* ---------------------------------------------------------------- *
 * Helpers
 * ---------------------------------------------------------------- */

export const getLevel = (
  levelId: GeographicLevelId,
  hierarchy: GeographicHierarchy = ACTIVE_HIERARCHY,
): GeographicLevelDefinition | undefined =>
  hierarchy.levels.find((level) => level.id === levelId);

/** The next broader level, or null at the top of the hierarchy. */
export const getBroaderLevel = (
  levelId: GeographicLevelId,
  hierarchy: GeographicHierarchy = ACTIVE_HIERARCHY,
): GeographicLevelDefinition | null => {
  const current = getLevel(levelId, hierarchy);
  if (!current) return null;
  const broader = hierarchy.levels
    .filter((level) => level.rank > current.rank)
    .sort((a, b) => a.rank - b.rank);
  return broader[0] ?? null;
};

export const getUnit = (
  unitId: string,
  hierarchy: GeographicHierarchy = ACTIVE_HIERARCHY,
): GeographicUnit | undefined => hierarchy.units.find((unit) => unit.id === unitId);

/** Walks a unit up to the top of the hierarchy, finest first. */
export const getAncestry = (
  unitId: string,
  hierarchy: GeographicHierarchy = ACTIVE_HIERARCHY,
): GeographicUnit[] => {
  const chain: GeographicUnit[] = [];
  let current = getUnit(unitId, hierarchy);
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parentId ? getUnit(current.parentId, hierarchy) : undefined;
  }
  return chain;
};

/** The containing unit at a given level, e.g. the county holding a ZIP. */
export const getAncestorAtLevel = (
  unitId: string,
  levelId: GeographicLevelId,
  hierarchy: GeographicHierarchy = ACTIVE_HIERARCHY,
): GeographicUnit | undefined =>
  getAncestry(unitId, hierarchy).find((unit) => unit.type === levelId);

export const getUnitsAtLevel = (
  levelId: GeographicLevelId,
  hierarchy: GeographicHierarchy = ACTIVE_HIERARCHY,
): GeographicUnit[] => hierarchy.units.filter((unit) => unit.type === levelId);

/** Display labels finest → broadest, used by the privacy roll-up chain. */
export const getLevelLabels = (
  hierarchy: GeographicHierarchy = ACTIVE_HIERARCHY,
): string[] =>
  [...hierarchy.levels].sort((a, b) => a.rank - b.rank).map((level) => level.label);

/** "Facility → ZIP Code → County → State → Country" */
export const describeHierarchy = (hierarchy: GeographicHierarchy): string =>
  [...hierarchy.levels]
    .sort((a, b) => a.rank - b.rank)
    .map((level) => level.longLabel)
    .join(' → ');
