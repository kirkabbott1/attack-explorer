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
  // Techniques that have no mitigations get an empty array, never undefined.
  mitigationIds: string[];
  // Techniques that have no data-component detections get an empty array.
  dataComponentIds: string[];
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

// A mitigation (STIX course-of-action). Each one names a defensive control
// that reduces the impact or likelihood of one or more techniques.
export interface Mitigation {
  id: string;        // e.g. "M1041"
  name: string;
}

// A data source represents a category of telemetry analysts can use to
// detect a technique (e.g. "Process", "Network Traffic"). Data sources are
// containers for data components, which are the actual detection signals.
export interface DataSource {
  id: string;        // e.g. "DS0009"
  name: string;
}

// A data component is a specific detection signal within a data source
// (e.g. "Process Creation" within "Process"). Data components are what the
// "detects" relationship connects to techniques.
export interface DataComponent {
  id: string;        // e.g. "DS0009-process-creation" -- slug fallback when STIX has no external_id
  name: string;
  dataSourceId: string;
}

export interface GraphData {
  version: string;        // ATT&CK version, e.g., "17.1"
  tactics: Tactic[];
  techniques: Technique[];
  groups: Group[];
  software: Software[];
  // Top-level entity arrays. Always present (possibly empty) after fetcher v2.
  mitigations: Mitigation[];
  dataSources: DataSource[];
  dataComponents: DataComponent[];
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

// --- Navigator-layer coverage state ---
// Filled in by the layer parser; consumed by TechniqueField and DetailPanel.
// A NavigatorLayer is kept around verbatim for re-export and metadata; the
// indexed Map gives O(1) per-technique lookup so the Scene does not re-scan
// the layer's technique array each frame.

export interface CoverageEntry {
  score?: number;
  color?: string;
  comment?: string;
  enabled: boolean;
}

export interface CoverageState {
  /** The imported layer (null when nothing is loaded). */
  layer: import('./layer').NavigatorLayer | null;
  /** Per-technique-id index built at import for O(1) Scene lookup. */
  byTechniqueId: Map<string, CoverageEntry>;
  /** When true and a layer is loaded, TechniqueField paints the score overlay. */
  viewActive: boolean;
  /** Soft parse warnings (e.g. unknown technique IDs). Surfaced in the sidebar. */
  warnings: string[];
}

export const EMPTY_COVERAGE: CoverageState = {
  layer: null,
  byTechniqueId: new Map(),
  viewActive: false,
  warnings: [],
};

// Map from entity ID to its full description text (citation markers
// already stripped at build time). Loaded from attack-descriptions.json
// after first paint. Consumed via useDescription().
export type DescriptionMap = Record<string, string>;
