// Pure helper functions used by scripts/fetch-attack-data.ts.
// Living under src/ so Jest can unit-test them without touching the network.
// The fetcher script is a thin orchestrator that calls these helpers and
// writes the resulting JSON files.

// A subset of STIX 2.1 fields actually used by the helpers below. The full
// spec has many more fields; we destructure only what matters.
export interface StixObject {
  type: string;
  id: string;
  name?: string;
  description?: string;
  external_references?: { source_name: string; external_id?: string; url?: string }[];
  kill_chain_phases?: { kill_chain_name: string; phase_name: string }[];
  aliases?: string[];
  x_mitre_aliases?: string[];
  x_mitre_shortname?: string;
  x_mitre_version?: string;
  x_mitre_platforms?: string[];
  x_mitre_is_subtechnique?: boolean;
  x_mitre_deprecated?: boolean;
  // Data components carry their parent data source via this STIX-only ref.
  x_mitre_data_source_ref?: string;
  revoked?: boolean;
  source_ref?: string;
  target_ref?: string;
  relationship_type?: string;
}

/**
 * Strip MITRE citation markers like (Citation: Source Name) from description
 * text. Collapses consecutive whitespace into single spaces and trims the
 * result. Citation markers are emitted by MITRE STIX bundles for inline
 * source attribution and have no use in our UI.
 *
 * Note: the regex matches up to the first ')' inside a marker. Citations
 * that themselves contain ')' (e.g. nested parens like "(Citation: X (2024))")
 * will not be fully stripped -- this is a rare edge case in MITRE data and
 * acceptable for v1.
 */
export function stripCitations(raw: string): string {
  return raw
    .replace(/\(Citation:[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Produce a search-index-ready truncation of a raw description: strip
 * citations, then truncate to ~200 chars at the last word boundary that
 * lives in the upper half of the window. If no late-enough word boundary
 * exists, fall back to a hard cut at 200 chars rather than producing a
 * uselessly short string.
 *
 * Length budget of 200 chars chosen to keep attack-index.json under ~70 KB
 * gzipped while preserving the front-loaded terminology that ATT&CK
 * descriptions tend to put in the opening sentences.
 */
export function truncateForSearch(raw: string): string {
  const stripped = stripCitations(raw);
  if (stripped.length <= 200) return stripped;
  const cut = stripped.slice(0, 200);
  const lastSpace = cut.lastIndexOf(' ');
  // Only honour the word boundary if it lives past the midpoint of the cut
  // window -- otherwise we would discard most of the content.
  return lastSpace > 100 ? cut.slice(0, lastSpace) : cut;
}

/**
 * Derive a stable, URL-shareable ID for an x-mitre-data-component STIX
 * object. Prefers the official ATT&CK external_id when MITRE publishes
 * one (true for newer releases). Falls back to a slug formed from the
 * parent data source ID plus a lowercased, dash-separated form of the
 * component's name.
 *
 * Stability across data refreshes matters because these IDs end up in
 * URL query params (?focus=DS0009-process-creation). A name-based slug
 * stays stable until MITRE renames the component itself, which is rare
 * and explicit. Index-based schemes ("DS0009.001") would shift every
 * sibling whenever a new component is added.
 */
export function deriveDataComponentId(obj: StixObject, parentDataSourceId: string): string {
  // Prefer the published external_id when present.
  const ref = obj.external_references?.find(r => r.source_name === 'mitre-attack');
  if (ref?.external_id) return ref.external_id;

  // Otherwise slugify the component name and prefix with the parent ID.
  const slug = (obj.name ?? '')
    .toLowerCase()
    // Replace any run of non-alphanumeric characters with a single dash.
    .replace(/[^a-z0-9]+/g, '-')
    // Trim leading/trailing dashes left over from punctuation at the edges.
    .replace(/^-+|-+$/g, '');
  return `${parentDataSourceId}-${slug}`;
}

/**
 * Walk a list of STIX relationship objects and collect the mitigates-edge
 * graph between mitigations and techniques. Returns both the forward map
 * (technique -> mitigations) and the reverse map (mitigation -> techniques)
 * because both are needed: the forward map populates technique.mitigationIds
 * in the graph file, and the reverse map powers
 * data.getTechniquesForMitigation in the runtime DataLayer.
 *
 * Relationships whose source or target STIX UUID does not resolve to an
 * ATT&CK ID via stixIdToAttackId are silently skipped. This handles the
 * "object dropped because it was deprecated" case cleanly.
 */
export function buildMitigationRelationships(
  relationships: StixObject[],
  stixIdToAttackId: Map<string, string>,
): {
  mitigationIdsByTechnique: Map<string, string[]>;
  techniqueIdsByMitigation: Map<string, string[]>;
} {
  const mitigationIdsByTechnique = new Map<string, string[]>();
  const techniqueIdsByMitigation = new Map<string, string[]>();

  for (const rel of relationships) {
    if (rel.relationship_type !== 'mitigates') continue;
    const mitigationId = stixIdToAttackId.get(rel.source_ref ?? '');
    const techniqueId = stixIdToAttackId.get(rel.target_ref ?? '');
    if (!mitigationId || !techniqueId) continue;

    const forward = mitigationIdsByTechnique.get(techniqueId) ?? [];
    forward.push(mitigationId);
    mitigationIdsByTechnique.set(techniqueId, forward);

    const reverse = techniqueIdsByMitigation.get(mitigationId) ?? [];
    reverse.push(techniqueId);
    techniqueIdsByMitigation.set(mitigationId, reverse);
  }

  return { mitigationIdsByTechnique, techniqueIdsByMitigation };
}

/**
 * Walk STIX relationships and collect the detects-edge graph between
 * data components and techniques. Mirrors buildMitigationRelationships
 * but uses a separate STIX UUID -> data-component-ID lookup because
 * data components don't always have ATT&CK external_ids and we coin
 * synthetic IDs for those that don't (see deriveDataComponentId).
 *
 * stixIdToDataComponentId: STIX UUID of data component -> our chosen ID
 * stixIdToAttackId: STIX UUID of attack-pattern -> ATT&CK technique ID
 */
export function buildDetectionRelationships(
  relationships: StixObject[],
  stixIdToDataComponentId: Map<string, string>,
  stixIdToAttackId: Map<string, string>,
): {
  dataComponentIdsByTechnique: Map<string, string[]>;
  techniqueIdsByDataComponent: Map<string, string[]>;
} {
  const dataComponentIdsByTechnique = new Map<string, string[]>();
  const techniqueIdsByDataComponent = new Map<string, string[]>();

  for (const rel of relationships) {
    if (rel.relationship_type !== 'detects') continue;
    const componentId = stixIdToDataComponentId.get(rel.source_ref ?? '');
    const techniqueId = stixIdToAttackId.get(rel.target_ref ?? '');
    if (!componentId || !techniqueId) continue;

    const forward = dataComponentIdsByTechnique.get(techniqueId) ?? [];
    forward.push(componentId);
    dataComponentIdsByTechnique.set(techniqueId, forward);

    const reverse = techniqueIdsByDataComponent.get(componentId) ?? [];
    reverse.push(techniqueId);
    techniqueIdsByDataComponent.set(componentId, reverse);
  }

  return { dataComponentIdsByTechnique, techniqueIdsByDataComponent };
}
