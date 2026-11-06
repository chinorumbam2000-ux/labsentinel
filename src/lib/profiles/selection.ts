/**
 * The selected surveillance profile lives in the URL: `?profile=<id>`.
 *
 * - No parameter means Respiratory Viral Syndrome, so every existing link and
 *   bookmark behaves exactly as before.
 * - `active` and `all` are portfolio views. Pages that show one profile then
 *   focus on the highest-ranked active signal (falling back to the default).
 * - An unrecognised value falls back to the default and says so — it never
 *   selects a guessed profile.
 */
import { DEFAULT_PROFILE_ID, PROFILE_BY_ID, isProfileId, type ProfileId } from './registry';
import { activeSignals, type ProfileSummary } from './portfolio';

export const PROFILE_PARAM = 'profile';

export type ProfileScope = 'active' | 'all';
export type ProfileSelection = ProfileScope | ProfileId;

export const SCOPE_LABEL: Record<ProfileScope, string> = {
  active: 'Active signals',
  all: 'All profiles',
};

export const isScope = (value: unknown): value is ProfileScope => value === 'active' || value === 'all';

export interface ParsedSelection {
  selection: ProfileSelection;
  /** The unrecognised value that was replaced by the default, if any. */
  invalid: string | null;
}

export const parseSelection = (value: string | null): ParsedSelection => {
  if (value === null || value === '') return { selection: DEFAULT_PROFILE_ID, invalid: null };
  if (isScope(value) || isProfileId(value)) return { selection: value, invalid: null };
  return { selection: DEFAULT_PROFILE_ID, invalid: value };
};

/** The one profile a single-profile page shows for this selection. */
export const focusProfileFor = (selection: ProfileSelection, summaries: ProfileSummary[]): ProfileId => {
  if (isProfileId(selection)) return selection;
  return activeSignals(summaries)[0]?.profile.id ?? DEFAULT_PROFILE_ID;
};

export const selectionLabel = (selection: ProfileSelection): string =>
  isScope(selection) ? SCOPE_LABEL[selection] : PROFILE_BY_ID[selection].displayName;

/** Pages that follow the selected profile. */
export const PROFILE_AWARE_PATHS = ['/dashboard', '/map', '/signals', '/facilities', '/laboratory-data', '/analytics'];

/**
 * Analyst pages the sidebar carries `?profile=` to, so the selection never
 * resets on the way through: the profile-aware pages, plus Investigations and
 * Reports (which list every profile) and Scenario Replay (which always shows
 * its own profile, and hands the selection back on the way out).
 */
export const PROFILE_CARRYING_PATHS = [...PROFILE_AWARE_PATHS, '/investigations', '/reports', '/replay', '/live'];

/** A link target that keeps the current profile selection, when there is one to keep. */
export const withProfileParam = (to: string, search: string): string => {
  if (!PROFILE_CARRYING_PATHS.includes(to)) return to;
  const value = new URLSearchParams(search).get(PROFILE_PARAM);
  const { selection, invalid } = parseSelection(value);
  if (value === null || invalid) return to;
  return `${to}?${PROFILE_PARAM}=${encodeURIComponent(selection)}`;
};
