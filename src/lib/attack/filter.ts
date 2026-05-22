// filter.ts
// Filter-evaluation helpers for the MITRE ATT&CK 3D Explorer.
//
// These pure functions determine whether a given node (technique, group, or software)
// matches the current FilterState. They are used by the constellation components to
// decide which nodes to highlight (full color) vs. dim (near-black) in the 3D scene.
//
// Semantics: AND across filter dimensions (platforms AND tactics AND groups AND software),
// OR within each dimension (any matching platform satisfies the platforms filter).

import type { DataLayer } from './data';
import type { FilterState, Technique, Group, Software } from './types';

/**
 * Returns true if any filter dimension is active (i.e. has at least one selection).
 * Used to skip all per-node matching logic when no filters are set.
 */
export function isAnyFilterActive(filters: FilterState): boolean {
  return (
    filters.platforms.length > 0 ||
    filters.tactics.length > 0 ||
    filters.groups.length > 0 ||
    filters.software.length > 0
  );
}

/**
 * For a given technique, does it match the current filter state?
 *
 * Semantics: AND across sections, OR within section.
 * - platforms: technique must support at least one of the selected platforms
 * - tactics: technique must belong to at least one of the selected tactics
 * - groups: technique must be in the combined techniqueIds of all selected groups
 * - software: technique must be in the combined techniqueIds of all selected software
 *
 * @param t       - The technique to test.
 * @param filters - The current active filter state.
 * @param data    - DataLayer used to resolve group/software techniqueId lists.
 */
export function techniqueMatches(t: Technique, filters: FilterState, data: DataLayer): boolean {
  // Platform filter: reject if the technique doesn't support any selected platform.
  if (filters.platforms.length && !filters.platforms.some(p => t.platforms.includes(p))) return false;

  // Tactic filter: reject if the technique doesn't belong to any selected tactic.
  if (filters.tactics.length && !filters.tactics.some(tid => t.tacticIds.includes(tid))) return false;

  // Group filter: build a unified set of techniqueIds across all selected groups,
  // then reject this technique if it doesn't appear in that set.
  if (filters.groups.length) {
    const groupTechniqueIds = new Set(
      filters.groups.flatMap(gid => data.getGroup(gid)?.techniqueIds ?? [])
    );
    if (!groupTechniqueIds.has(t.id)) return false;
  }

  // Software filter: same pattern as group filter but using selected software entries.
  if (filters.software.length) {
    const swTechniqueIds = new Set(
      filters.software.flatMap(sid => data.getSoftware(sid)?.techniqueIds ?? [])
    );
    if (!swTechniqueIds.has(t.id)) return false;
  }

  // Passed all active filter checks — this technique matches.
  return true;
}

/**
 * For a group: if filters.groups is non-empty, only explicitly-selected groups match.
 * Otherwise all groups match (no group filter active).
 *
 * @param g       - The group to test.
 * @param filters - The current active filter state.
 */
export function groupMatches(g: Group, filters: FilterState): boolean {
  // No group filter selected — every group passes.
  if (filters.groups.length === 0) return true;
  // A group is highlighted only if the user specifically selected it.
  return filters.groups.includes(g.id);
}

/**
 * For software: if filters.software is non-empty, only explicitly-selected software matches.
 * Otherwise all software matches (no software filter active).
 *
 * @param s       - The software entry to test.
 * @param filters - The current active filter state.
 */
export function softwareMatches(s: Software, filters: FilterState): boolean {
  // No software filter selected — every software entry passes.
  if (filters.software.length === 0) return true;
  // A software entry is highlighted only if the user specifically selected it.
  return filters.software.includes(s.id);
}
