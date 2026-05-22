import type { GraphData, Tactic, Technique, Group, Software } from './types';

// DataLayer is the accessor surface over the loaded GraphData. All lookups
// are O(1) where possible — we build indexes once at construction time.
export interface DataLayer {
  version: string;
  getTactic(id: string): Tactic | null;
  getTechnique(id: string): Technique | null;
  getGroup(id: string): Group | null;
  getSoftware(id: string): Software | null;
  getSubtechniquesOf(parentId: string): Technique[];
  getGroupsUsingTechnique(techniqueId: string): Group[];
  getSoftwareUsingTechnique(techniqueId: string): Software[];
  getTechniquesForGroup(groupId: string): Technique[];
  getTechniquesForSoftware(softwareId: string): Technique[];
  getAllTactics(): Tactic[];
  getAllTechniques(): Technique[];
  getAllGroups(): Group[];
  getAllSoftware(): Software[];
}

/**
 * Build a DataLayer over the given GraphData. Indexes built eagerly at
 * construction so all accessors are O(1) or O(k) where k is the result count.
 *
 * Relationship indexes are built by iterating each group/software once and
 * inverting their techniqueIds lists — this gives us O(1) reverse lookups
 * (e.g. "which groups use technique T?") without scanning on every call.
 */
export function createDataLayer(graph: GraphData): DataLayer {
  // Primary by-id indexes — built from the flat arrays in GraphData.
  const tacticById = new Map(graph.tactics.map(t => [t.id, t]));
  const techniqueById = new Map(graph.techniques.map(t => [t.id, t]));
  const groupById = new Map(graph.groups.map(g => [g.id, g]));
  const softwareById = new Map(graph.software.map(s => [s.id, s]));

  // Sub-technique reverse index: parentId -> Technique[].
  // A technique is a sub-technique when it has a parentId field set.
  const subtechniquesByParent = new Map<string, Technique[]>();
  for (const t of graph.techniques) {
    if (t.parentId) {
      const arr = subtechniquesByParent.get(t.parentId) ?? [];
      arr.push(t);
      subtechniquesByParent.set(t.parentId, arr);
    }
  }

  // Group reverse index: techniqueId -> Group[].
  // Iterate each group's techniqueIds list and push the group into each entry.
  const groupsByTechnique = new Map<string, Group[]>();
  for (const g of graph.groups) {
    for (const tid of g.techniqueIds) {
      const arr = groupsByTechnique.get(tid) ?? [];
      arr.push(g);
      groupsByTechnique.set(tid, arr);
    }
  }

  // Software reverse index: techniqueId -> Software[].
  // Same pattern as the group reverse index above.
  const softwareByTechnique = new Map<string, Software[]>();
  for (const s of graph.software) {
    for (const tid of s.techniqueIds) {
      const arr = softwareByTechnique.get(tid) ?? [];
      arr.push(s);
      softwareByTechnique.set(tid, arr);
    }
  }

  return {
    // Expose the ATT&CK version string from the source data file.
    version: graph.version,

    // Single-item lookups — return null (not undefined) when not found so
    // callers can use strict equality checks.
    getTactic: (id) => tacticById.get(id) ?? null,
    getTechnique: (id) => techniqueById.get(id) ?? null,
    getGroup: (id) => groupById.get(id) ?? null,
    getSoftware: (id) => softwareById.get(id) ?? null,

    // Return all sub-techniques whose parentId matches the given technique id.
    getSubtechniquesOf: (parentId) => subtechniquesByParent.get(parentId) ?? [],

    // Return all groups that list the given technique in their techniqueIds.
    getGroupsUsingTechnique: (techniqueId) => groupsByTechnique.get(techniqueId) ?? [],

    // Return all software that list the given technique in their techniqueIds.
    getSoftwareUsingTechnique: (techniqueId) => softwareByTechnique.get(techniqueId) ?? [],

    // Forward lookup: resolve each techniqueId in the group to a Technique object.
    // Filters out any ids that are not present in the technique index (defensive).
    getTechniquesForGroup: (groupId) => {
      const g = groupById.get(groupId);
      if (!g) return [];
      return g.techniqueIds
        .map(tid => techniqueById.get(tid))
        .filter((t): t is Technique => !!t);
    },

    // Forward lookup: resolve each techniqueId in the software to a Technique object.
    getTechniquesForSoftware: (softwareId) => {
      const s = softwareById.get(softwareId);
      if (!s) return [];
      return s.techniqueIds
        .map(tid => techniqueById.get(tid))
        .filter((t): t is Technique => !!t);
    },

    // Bulk getters — return the underlying arrays directly (no defensive copy needed
    // since callers should treat these as read-only).
    getAllTactics: () => graph.tactics,
    getAllTechniques: () => graph.techniques,
    getAllGroups: () => graph.groups,
    getAllSoftware: () => graph.software,
  };
}
