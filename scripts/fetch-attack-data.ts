/**
 * Fetch MITRE ATT&CK Enterprise STIX data from GitHub and transform it
 * into the app's GraphData + SearchIndex shape. Writes output to
 * public/data/attack-graph.json and public/data/attack-index.json.
 *
 * Run: npx tsx scripts/fetch-attack-data.ts
 *   or: npm run fetch-attack-data
 *
 * STIX 2.1 reference: https://github.com/mitre-attack/attack-stix-data
 */

import fs from 'fs';
import path from 'path';

const STIX_URL =
  'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json';

// Output directory under public so Next.js serves these as static assets
const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const GRAPH_OUT = path.join(OUT_DIR, 'attack-graph.json');
const INDEX_OUT = path.join(OUT_DIR, 'attack-index.json');

// --- STIX shape (subset of fields we actually use) ---
// Full STIX 2.1 spec has many more fields; we only destructure what matters for the graph
interface StixObject {
  type: string;
  id: string;
  name?: string;
  description?: string;
  // External references carry the ATT&CK ID (e.g., T1059) and URLs
  external_references?: { source_name: string; external_id?: string; url?: string }[];
  // Kill chain phases map techniques to tactics via phase_name (slug, e.g., "execution")
  kill_chain_phases?: { kill_chain_name: string; phase_name: string }[];
  aliases?: string[];
  x_mitre_aliases?: string[];
  // Tactic short name used to correlate with kill_chain_phases
  x_mitre_shortname?: string;
  x_mitre_version?: string;
  x_mitre_platforms?: string[];
  // True when this attack-pattern is a sub-technique (e.g., T1059.001)
  x_mitre_is_subtechnique?: boolean;
  // Deprecated/revoked objects should be filtered out before processing
  x_mitre_deprecated?: boolean;
  revoked?: boolean;
  // Relationship fields (used by 'relationship' type objects)
  source_ref?: string;
  target_ref?: string;
  relationship_type?: string;
}

interface StixBundle {
  type: 'bundle';
  objects: StixObject[];
}

/**
 * Extract the ATT&CK ID (e.g., "T1059", "G0016", "S0002") from an object's
 * external_references array. Returns null if not found.
 */
function attackId(obj: StixObject): string | null {
  const ref = obj.external_references?.find(r => r.source_name === 'mitre-attack');
  return ref?.external_id ?? null;
}

/**
 * Given a sub-technique ID like "T1059.001", return the parent "T1059".
 * Returns null if the ID has no dot (i.e., it is not a sub-technique).
 */
function parentIdFor(subId: string): string | null {
  const dot = subId.indexOf('.');
  return dot === -1 ? null : subId.slice(0, dot);
}

async function main(): Promise<void> {
  console.log('Fetching STIX bundle from MITRE...');
  const res = await fetch(STIX_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch STIX: HTTP ${res.status}`);
  }
  const bundle = (await res.json()) as StixBundle;
  console.log(`Got ${bundle.objects.length} STIX objects.`);

  // Filter out deprecated and revoked objects — these should not appear in the graph
  const live = bundle.objects.filter(o => !o.x_mitre_deprecated && !o.revoked);

  // The x-mitre-collection object carries the ATT&CK version string
  const collection = bundle.objects.find(o => o.type === 'x-mitre-collection');
  const version = collection?.x_mitre_version ?? 'unknown';

  // --- Transform tactics ---
  // Each tactic gets an index (order) for layout purposes in the 3D scene
  const tactics = live
    .filter(o => o.type === 'x-mitre-tactic')
    .map((o, idx) => ({
      id: attackId(o)!,
      name: o.name!,
      // shortName is the slug used in kill_chain_phases (e.g., "execution")
      shortName: o.x_mitre_shortname ?? '',
      order: idx,
    }))
    .filter(t => t.id);

  // Build a lookup from phase slug -> tactic ATT&CK ID for resolving technique->tactic edges
  const tacticIdByShortName = new Map(tactics.map(t => [t.shortName, t.id]));

  // --- Transform techniques (attack-patterns) ---
  const techniques = live
    .filter(o => o.type === 'attack-pattern')
    .map(o => {
      const id = attackId(o);
      if (!id) return null;
      // Resolve which tactics this technique belongs to via kill_chain_phases
      const phaseNames = (o.kill_chain_phases ?? [])
        .filter(p => p.kill_chain_name === 'mitre-attack')
        .map(p => p.phase_name);
      const tacticIds = phaseNames
        .map(pn => tacticIdByShortName.get(pn))
        .filter((x): x is string => !!x);
      const isSubtechnique = !!o.x_mitre_is_subtechnique;
      // Derive parent ID from the dotted notation (T1059.001 -> T1059)
      const parentId = isSubtechnique ? parentIdFor(id) : undefined;
      return {
        id,
        name: o.name!,
        tacticIds,
        platforms: o.x_mitre_platforms ?? [],
        parentId: parentId ?? undefined,
        isSubtechnique,
      };
    })
    .filter((t): t is NonNullable<typeof t> => !!t);

  // --- Collect groups (intrusion-sets) and software (malware/tool) ---
  const groupObjs = live.filter(o => o.type === 'intrusion-set');
  const softwareObjs = live.filter(o => o.type === 'malware' || o.type === 'tool');

  // Only 'uses' relationships connect groups/software to techniques
  const relationships = live.filter(o => o.type === 'relationship' && o.relationship_type === 'uses');

  // Build a map from STIX UUID -> ATT&CK ID for resolving relationship refs
  // We need this because relationship source_ref/target_ref use STIX UUIDs, not ATT&CK IDs
  const stixIdToAttackId = new Map<string, string>();
  for (const o of live) {
    if (
      o.type !== 'attack-pattern' &&
      o.type !== 'intrusion-set' &&
      o.type !== 'malware' &&
      o.type !== 'tool'
    ) continue;
    const aid = attackId(o);
    if (aid) stixIdToAttackId.set(o.id, aid);
  }

  // For each group/software source, accumulate the technique and software IDs it uses
  const techniqueIdsBySource = new Map<string, string[]>();
  const softwareIdsBySource = new Map<string, string[]>();

  for (const rel of relationships) {
    const srcAttack = stixIdToAttackId.get(rel.source_ref!);
    const tgtAttack = stixIdToAttackId.get(rel.target_ref!);
    if (!srcAttack || !tgtAttack) continue;
    // Determine target type by ATT&CK ID prefix: T = technique, S = software
    const tgtType = tgtAttack.startsWith('T')
      ? 'technique'
      : tgtAttack.startsWith('S')
      ? 'software'
      : null;
    if (tgtType === 'technique') {
      const arr = techniqueIdsBySource.get(srcAttack) ?? [];
      arr.push(tgtAttack);
      techniqueIdsBySource.set(srcAttack, arr);
    } else if (tgtType === 'software') {
      const arr = softwareIdsBySource.get(srcAttack) ?? [];
      arr.push(tgtAttack);
      softwareIdsBySource.set(srcAttack, arr);
    }
  }

  // --- Transform groups ---
  const groups = groupObjs
    .map(o => {
      const id = attackId(o);
      if (!id) return null;
      return {
        id,
        name: o.name!,
        // aliases include common alternative names for the group (e.g., "APT29", "Cozy Bear")
        aliases: o.aliases ?? o.x_mitre_aliases ?? [],
        techniqueIds: techniqueIdsBySource.get(id) ?? [],
        softwareIds: softwareIdsBySource.get(id) ?? [],
      };
    })
    .filter((g): g is NonNullable<typeof g> => !!g);

  // --- Transform software ---
  const software = softwareObjs
    .map(o => {
      const id = attackId(o);
      if (!id) return null;
      return {
        id,
        name: o.name!,
        // Preserve distinction between malware and legitimate tools
        type: o.type === 'malware' ? ('malware' as const) : ('tool' as const),
        techniqueIds: techniqueIdsBySource.get(id) ?? [],
      };
    })
    .filter((s): s is NonNullable<typeof s> => !!s);

  // --- Build flat search index ---
  // All searchable entities in one array for fast client-side lookup
  const searchEntries = [
    ...techniques.map(t => ({
      id: t.id,
      type: 'technique' as const,
      name: t.name,
      aliases: [] as string[],
      description: '',
    })),
    ...groups.map(g => ({
      id: g.id,
      type: 'group' as const,
      name: g.name,
      aliases: g.aliases,
      description: '',
    })),
    ...software.map(s => ({
      id: s.id,
      type: 'software' as const,
      name: s.name,
      aliases: [] as string[],
      description: '',
    })),
  ];

  // Ensure the output directory exists before writing
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Write attack-graph.json: the structured data used by the 3D scene renderer
  const graph = { version, tactics, techniques, groups, software };
  fs.writeFileSync(GRAPH_OUT, JSON.stringify(graph, null, 2));

  // Write attack-index.json: flat array used by the search component
  fs.writeFileSync(INDEX_OUT, JSON.stringify({ entries: searchEntries }, null, 2));

  console.log(`Wrote ${GRAPH_OUT}`);
  console.log(`  tactics: ${tactics.length}`);
  console.log(
    `  techniques: ${techniques.length} (${techniques.filter(t => t.isSubtechnique).length} sub-techniques)`
  );
  console.log(`  groups: ${groups.length}`);
  console.log(`  software: ${software.length}`);
  console.log(`Wrote ${INDEX_OUT} (${searchEntries.length} entries)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
