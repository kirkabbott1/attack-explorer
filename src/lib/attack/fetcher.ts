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
