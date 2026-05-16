// Shared types for the MITRE ATT&CK 3D Explorer.
// The shape of the data on disk (public/data/attack-graph.json) is GraphData.
// Filter/selection state lives in React context and is encoded to URL via lib/attack/url.ts.

export interface Tactic {
  id: string;        // e.g., "TA0001"
  name: string;      // e.g., "Initial Access"
  shortName: string; // e.g., "initial-access" (matches STIX x_mitre_shortname)
  order: number;     // 0..13 — position in the kill chain
}

export interface Technique {
  id: string;            // e.g., "T1059" or "T1059.001" for sub-techniques
  name: string;
  tacticIds: string[];   // a technique can belong to multiple tactics
  platforms: string[];   // ["Linux", "Windows", "macOS", "Network", "Containers", ...]
  parentId?: string;     // for sub-techniques: "T1059.001" -> parent "T1059"
  isSubtechnique: boolean;
}

export interface Group {
  id: string;            // e.g., "G0016"
  name: string;          // e.g., "APT29"
  aliases: string[];     // ["APT29", "Cozy Bear", "Midnight Blizzard"]
  techniqueIds: string[];
  softwareIds: string[];
}

export interface Software {
  id: string;                       // e.g., "S0002" (malware) or "S0030" (tool)
  name: string;
  type: 'malware' | 'tool';
  techniqueIds: string[];
}

export interface GraphData {
  version: string;        // ATT&CK version, e.g., "17.1"
  tactics: Tactic[];
  techniques: Technique[];
  groups: Group[];
  software: Software[];
}

// Search index is a flat list of entries — separate from GraphData to keep the
// main fetch lean and the search payload optimized for full-text matching.
export interface SearchIndexEntry {
  id: string;
  type: 'technique' | 'group' | 'software';
  name: string;
  aliases: string[];
  description: string;
}

export interface SearchIndex {
  entries: SearchIndexEntry[];
}

// Filter state, encoded to URL query params via lib/attack/url.ts.
// Semantics: AND across sections, OR within section.
export interface FilterState {
  platforms: string[];
  tactics: string[];    // tactic IDs
  groups: string[];     // group IDs
  software: string[];   // software IDs
}

export const EMPTY_FILTERS: FilterState = {
  platforms: [],
  tactics: [],
  groups: [],
  software: [],
};

// Vec3 used by lib/attack/layout.ts
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// What a node is in the unified graph — only used for cross-type operations
// like search results and detail panel relationship traversal.
export type NodeKind = 'tactic' | 'technique' | 'subtechnique' | 'group' | 'software';
