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
