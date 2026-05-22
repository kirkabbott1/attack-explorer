// lib/attack/url.ts
// Encodes and decodes the MITRE ATT&CK Explorer's app state (filters + focusId)
// to/from URL query-string records. Used so users can share and bookmark filtered views.
//
// URL keys are short, singular, and human-friendly (e.g. "platform" not "platforms").
// Empty arrays and null focusId are omitted so the URL stays clean when state is default.

import { EMPTY_FILTERS, type FilterState } from './types';

// AppState is the shape of state that gets encoded into / decoded from URL params.
export interface AppState {
  filters: FilterState;
  focusId: string | null;
}

// Mapping from internal FilterState field name -> short URL query key.
// Keeping keys singular matches common REST/URL conventions ("platform=Linux,Windows").
const URL_KEYS = {
  platforms: 'platform',
  tactics: 'tactic',
  groups: 'group',
  software: 'software',
} as const;

// QueryRecord matches what Next.js router.query provides: values can be a plain
// string, an array of strings (repeated param), or undefined.
type QueryRecord = Record<string, string | string[] | undefined>;

/**
 * encodeStateToQuery
 * Converts app state into a plain Record<string, string> suitable for
 * Next.js router.push / router.replace. Empty arrays and null focusId
 * are omitted entirely so the URL stays minimal.
 *
 * Example output: { platform: "Linux,macOS", tactic: "TA0001", focus: "T1059" }
 */
export function encodeStateToQuery(state: AppState): Record<string, string> {
  const out: Record<string, string> = {};

  // Each filter array is joined with commas and only included when non-empty.
  if (state.filters.platforms.length) out[URL_KEYS.platforms] = state.filters.platforms.join(',');
  if (state.filters.tactics.length)   out[URL_KEYS.tactics]   = state.filters.tactics.join(',');
  if (state.filters.groups.length)    out[URL_KEYS.groups]    = state.filters.groups.join(',');
  if (state.filters.software.length)  out[URL_KEYS.software]  = state.filters.software.join(',');

  // focusId is only included when non-null / non-empty.
  if (state.focusId) out.focus = state.focusId;

  return out;
}

/**
 * decodeStateFromQuery
 * Reconstructs AppState from a Next.js query-string record. Tolerant of:
 *   - missing keys    -> defaults to empty arrays / null
 *   - string values   -> split on comma
 *   - string[] values -> use first element then split on comma (repeated params
 *     from router.query are rare here but handled for safety)
 *
 * Example input:  { platform: "Linux,macOS", tactic: "TA0001" }
 * Example output: { filters: { platforms: ["Linux","macOS"], tactics: ["TA0001"], ... }, focusId: null }
 */
export function decodeStateFromQuery(query: QueryRecord): AppState {
  // readList: extract a comma-separated list from a query param, returning [] when absent.
  const readList = (key: string): string[] => {
    const raw = query[key];
    if (!raw) return [];
    // If Next.js gave us string[], take the first element (repeated keys are unexpected here).
    const s = Array.isArray(raw) ? raw[0] : raw;
    return s.split(',').filter(Boolean);
  };

  // readScalar: extract a single string from a query param, returning null when absent.
  const readScalar = (key: string): string | null => {
    const raw = query[key];
    if (!raw) return null;
    return Array.isArray(raw) ? raw[0] : raw;
  };

  return {
    filters: {
      platforms: readList(URL_KEYS.platforms),
      tactics:   readList(URL_KEYS.tactics),
      groups:    readList(URL_KEYS.groups),
      software:  readList(URL_KEYS.software),
    },
    focusId: readScalar('focus'),
  };
}

// Re-export EMPTY_FILTERS for convenience so consumers of url.ts don't need
// to separately import from types.ts.
export { EMPTY_FILTERS };
