# Richer ATT&CK Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add descriptions, mitigations, and detections (data sources / data components) to the DetailPanel so analysts see what a technique is, what stops it, and how to detect it.

**Architecture:** Extend `scripts/fetch-attack-data.ts` with two new STIX entity collections (`course-of-action`, `x-mitre-data-source` + `x-mitre-data-component`) and two new relationship passes (`mitigates`, `detects`). Pure helpers move to `src/lib/attack/fetcher.ts` so they can be unit-tested under Jest. Ship descriptions in a separate `public/data/attack-descriptions.json` loaded fire-and-forget after first paint; the panel reads via a new `useDescription` hook so `DataLayer` stays pure. Two new DetailPanel sections (Mitigations, Detections) plus new detail branches for the Mitigation and DataComponent entity views.

**Tech Stack:** TypeScript, Vite, React 18, react-three-fiber, Tailwind, Jest + ts-jest + jsdom, React Testing Library. Build: `npm run build`. Test: `npm test`. Type-check: `npm run type-check`. Fetcher: `npm run fetch-attack-data`.

**Spec reference:** `docs/superpowers/specs/2026-06-14-attack-richer-content-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/attack/types.ts` | Modify | Add `Mitigation`, `DataSource`, `DataComponent`, `DescriptionMap` types; extend `Technique` with `mitigationIds` and `dataComponentIds`; extend `GraphData`. |
| `src/lib/attack/fetcher.ts` | Create | Pure helpers extracted from `scripts/fetch-attack-data.ts`: `stripCitations`, `truncateForSearch`, `deriveDataComponentId`, `buildMitigationRelationships`, `buildDetectionRelationships`. Importable by Jest. |
| `src/lib/attack/__tests__/fetcher.test.ts` | Create | Unit tests for every helper above. Hand-rolled STIX fixture, no network. |
| `scripts/fetch-attack-data.ts` | Modify | Use the helpers; collect mitigations + data sources + data components; emit `attack-descriptions.json`; populate search index descriptions (truncated). |
| `src/lib/attack/__tests__/fixtures/mini-graph.json` | Modify | Add 2 mitigations, 2 data sources, 3 data components; populate `mitigationIds` / `dataComponentIds` on existing techniques. |
| `src/components/attack/__tests__/MobileHint.test.tsx` | Modify | One-line update of inline `GraphData` fixture so it has the new top-level arrays. |
| `src/lib/attack/data.ts` | Modify | Add six accessors for mitigation / data-source / data-component lookups, both forward and reverse. |
| `src/lib/attack/__tests__/data.test.ts` | Modify | Tests for the six new accessors. |
| `src/lib/attack/context.tsx` | Modify | Accept `descriptions?: DescriptionMap \| null` prop on `AttackProvider`; expose `useDescription(id)` hook. |
| `src/lib/attack/__tests__/descriptions.test.ts` | Create | Tests for `useDescription` hook against in-memory map states. |
| `src/App.tsx` | Modify | Fire-and-forget parallel fetch of `attack-descriptions.json`; pass `descriptions` into `AttackProvider`. |
| `src/components/attack/DetailPanel.tsx` | Modify | Add `Description` sub-component; add Description to all entity branches; add `MitigationSection` and `DetectionSection` on technique view; add Mitigation and DataComponent detail branches. |
| `src/components/attack/__tests__/DetailPanel.test.tsx` | Modify | Tests for description rendering, Show more toggle, mitigation/detection sections, new entity branches. |
| `src/lib/attack/search.ts` | Modify | Add minimum-query-length guard on description matching (>=3 chars) to prevent common-word flood. |
| `src/lib/attack/__tests__/search.test.ts` | Modify | New test: short queries (<3 chars) don't match descriptions. |
| `public/data/attack-graph.json` | Regenerate | Output of running the fetcher locally. |
| `public/data/attack-index.json` | Regenerate | Output of running the fetcher locally. |
| `public/data/attack-descriptions.json` | Create | Output of running the fetcher locally. |

---

## Task 1: Add new types to `types.ts`

**Files:**
- Modify: `src/lib/attack/types.ts`

- [ ] **Step 1: Open `src/lib/attack/types.ts` and add the new entity interfaces after the existing `Software` interface (around line 35)**

```ts
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
  id: string;        // e.g. "DS0009-process-creation" — slug fallback when STIX has no external_id
  name: string;
  dataSourceId: string;
}
```

- [ ] **Step 2: Extend the `Technique` interface to add `mitigationIds` and `dataComponentIds`**

Find the existing `Technique` interface and add two fields:

```ts
export interface Technique {
  id: string;
  name: string;
  tacticIds: string[];
  platforms: string[];
  parentId?: string;
  isSubtechnique: boolean;
  // NEW: techniques that have no mitigations get an empty array, never undefined.
  mitigationIds: string[];
  // NEW: techniques that have no data-component detections get an empty array.
  dataComponentIds: string[];
}
```

- [ ] **Step 3: Extend `GraphData` to carry the three new top-level entity arrays**

```ts
export interface GraphData {
  version: string;
  tactics: Tactic[];
  techniques: Technique[];
  groups: Group[];
  software: Software[];
  // NEW: top-level entity arrays. Always present (possibly empty) after fetcher v2.
  mitigations: Mitigation[];
  dataSources: DataSource[];
  dataComponents: DataComponent[];
}
```

- [ ] **Step 4: Add `DescriptionMap` type at the bottom of the file**

```ts
// Map from entity ID to its full description text (citation markers
// already stripped at build time). Loaded from attack-descriptions.json
// after first paint. Consumed via useDescription().
export type DescriptionMap = Record<string, string>;
```

- [ ] **Step 5: Run type-check to verify the types are syntactically valid**

Run: `npm run type-check`
Expected: many errors. Existing files that construct `GraphData` or `Technique` inline without the new fields will fail. That is intentional and is fixed in the next two tasks.

Do NOT commit yet — leave the types broken until the fixture and inline test fixture are updated.

---

## Task 2: Update `mini-graph.json` fixture

**Files:**
- Modify: `src/lib/attack/__tests__/fixtures/mini-graph.json`

- [ ] **Step 1: Replace the entire contents of `mini-graph.json` with the extended fixture below**

```json
{
  "version": "test-1.0",
  "tactics": [
    { "id": "TA0001", "name": "Initial Access", "shortName": "initial-access", "order": 0 },
    { "id": "TA0002", "name": "Execution", "shortName": "execution", "order": 1 },
    { "id": "TA0003", "name": "Persistence", "shortName": "persistence", "order": 2 }
  ],
  "techniques": [
    {
      "id": "T1566",
      "name": "Phishing",
      "tacticIds": ["TA0001"],
      "platforms": ["Linux", "Windows", "macOS"],
      "isSubtechnique": false,
      "mitigationIds": ["M1041"],
      "dataComponentIds": []
    },
    {
      "id": "T1566.001",
      "name": "Spearphishing Attachment",
      "tacticIds": ["TA0001"],
      "platforms": ["Linux", "Windows", "macOS"],
      "parentId": "T1566",
      "isSubtechnique": true,
      "mitigationIds": ["M1041"],
      "dataComponentIds": ["DS0017-command-execution"]
    },
    {
      "id": "T1059",
      "name": "Command and Scripting Interpreter",
      "tacticIds": ["TA0002"],
      "platforms": ["Linux", "Windows", "macOS"],
      "isSubtechnique": false,
      "mitigationIds": ["M1042"],
      "dataComponentIds": ["DS0009-process-creation", "DS0017-command-execution"]
    },
    {
      "id": "T1059.001",
      "name": "PowerShell",
      "tacticIds": ["TA0002"],
      "platforms": ["Windows"],
      "parentId": "T1059",
      "isSubtechnique": true,
      "mitigationIds": ["M1042"],
      "dataComponentIds": ["DS0009-process-creation"]
    },
    {
      "id": "T1098",
      "name": "Account Manipulation",
      "tacticIds": ["TA0003"],
      "platforms": ["Linux", "Windows", "macOS"],
      "isSubtechnique": false,
      "mitigationIds": [],
      "dataComponentIds": ["DS0009-process-metadata"]
    }
  ],
  "groups": [
    {
      "id": "G0016",
      "name": "APT29",
      "aliases": ["APT29", "Cozy Bear"],
      "techniqueIds": ["T1566.001", "T1059.001", "T1098"],
      "softwareIds": ["S0001"]
    },
    {
      "id": "G0032",
      "name": "Lazarus Group",
      "aliases": ["Lazarus", "Hidden Cobra"],
      "techniqueIds": ["T1059", "T1098"],
      "softwareIds": ["S0002"]
    }
  ],
  "software": [
    {
      "id": "S0001",
      "name": "TestMalware",
      "type": "malware",
      "techniqueIds": ["T1059.001"]
    },
    {
      "id": "S0002",
      "name": "TestTool",
      "type": "tool",
      "techniqueIds": ["T1059"]
    }
  ],
  "mitigations": [
    { "id": "M1041", "name": "Encrypt Sensitive Information" },
    { "id": "M1042", "name": "Disable or Remove Feature or Program" }
  ],
  "dataSources": [
    { "id": "DS0009", "name": "Process" },
    { "id": "DS0017", "name": "Command" }
  ],
  "dataComponents": [
    { "id": "DS0009-process-creation", "name": "Process Creation", "dataSourceId": "DS0009" },
    { "id": "DS0009-process-metadata", "name": "Process Metadata", "dataSourceId": "DS0009" },
    { "id": "DS0017-command-execution", "name": "Command Execution", "dataSourceId": "DS0017" }
  ]
}
```

- [ ] **Step 2: Run type-check to verify the fixture now satisfies `GraphData`**

Run: `npm run type-check`
Expected: errors related to the JSON fixture resolve. There will still be one remaining error from `MobileHint.test.tsx` which constructs an inline `GraphData` — that is fixed in Task 3.

Do NOT commit yet.

---

## Task 3: Update inline fixture in `MobileHint.test.tsx`

**Files:**
- Modify: `src/components/attack/__tests__/MobileHint.test.tsx`

- [ ] **Step 1: Locate the inline `fakeGraph` constant (around line 14) and extend it**

Find this block:

```ts
const fakeGraph: GraphData = {
  version: '17.1',
  tactics: [{ id: 'TA0001', name: 'Initial Access', shortName: 'initial-access', order: 1 }],
  techniques: [{
    id: 'T1059', name: 'PowerShell', isSubtechnique: false,
    tacticIds: ['TA0001'], platforms: [],
  }],
  groups: [],
  software: [],
};
```

Replace with:

```ts
const fakeGraph: GraphData = {
  version: '17.1',
  tactics: [{ id: 'TA0001', name: 'Initial Access', shortName: 'initial-access', order: 1 }],
  techniques: [{
    id: 'T1059', name: 'PowerShell', isSubtechnique: false,
    tacticIds: ['TA0001'], platforms: [],
    mitigationIds: [], dataComponentIds: [],
  }],
  groups: [],
  software: [],
  mitigations: [],
  dataSources: [],
  dataComponents: [],
};
```

- [ ] **Step 2: Run type-check — should now be clean**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 3: Run the existing test suite to confirm the type changes didn't break behaviour**

Run: `npm test`
Expected: all existing tests pass. The fixture extension and type additions are purely additive.

- [ ] **Step 4: Commit**

```bash
git add src/lib/attack/types.ts src/lib/attack/__tests__/fixtures/mini-graph.json src/components/attack/__tests__/MobileHint.test.tsx
git commit -m "feat(types): add Mitigation, DataSource, DataComponent and DescriptionMap

Extends Technique with mitigationIds and dataComponentIds (always
populated, possibly empty). Extends GraphData with mitigations,
dataSources, dataComponents top-level arrays. Updates the test
fixture so the existing data layer tests still type-check."
```

---

## Task 4: Create `src/lib/attack/fetcher.ts` skeleton

**Files:**
- Create: `src/lib/attack/fetcher.ts`

The fetcher module holds all pure helpers used by `scripts/fetch-attack-data.ts`. Living under `src/` means Jest's `testMatch` picks up sibling test files automatically. We seed the file with type re-exports and an empty exports block; subsequent tasks add one helper at a time TDD-style.

- [ ] **Step 1: Create the file with the header and the StixObject type used by all helpers**

```ts
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
```

- [ ] **Step 2: Confirm the file compiles**

Run: `npm run type-check`
Expected: no errors. The file exports a type only; no runtime code yet.

- [ ] **Step 3: Commit**

```bash
git add src/lib/attack/fetcher.ts
git commit -m "chore(fetcher): scaffold pure-helper module under src/lib/attack

The orchestrator script (scripts/fetch-attack-data.ts) stays in place;
this new module holds testable helpers that will be added one at a
time. Living under src/ means Jest picks up the sibling test file
automatically."
```

---

## Task 5: Implement `stripCitations` helper (TDD)

**Files:**
- Modify: `src/lib/attack/fetcher.ts`
- Create: `src/lib/attack/__tests__/fetcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/attack/__tests__/fetcher.test.ts`:

```ts
// Unit tests for the pure helpers in src/lib/attack/fetcher.ts.
// These run under Jest (jsdom) without any network access.

import { stripCitations } from '../fetcher';

describe('lib/attack/fetcher: stripCitations', () => {
  test('removes a single (Citation: X) marker', () => {
    expect(stripCitations('PowerShell is widely used. (Citation: Microsoft 2024)'))
      .toBe('PowerShell is widely used.');
  });

  test('removes multiple citation markers', () => {
    expect(stripCitations('Foo (Citation: A) bar (Citation: B) baz.'))
      .toBe('Foo bar baz.');
  });

  test('collapses internal whitespace from stripping', () => {
    expect(stripCitations('A  (Citation: X)  B')).toBe('A B');
  });

  test('preserves text with no citations untouched (trimmed)', () => {
    expect(stripCitations('Plain text with no markers.'))
      .toBe('Plain text with no markers.');
  });

  test('handles empty input', () => {
    expect(stripCitations('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fetcher.test`
Expected: FAIL — `stripCitations` is not exported from fetcher.ts.

- [ ] **Step 3: Implement `stripCitations` in `src/lib/attack/fetcher.ts`**

Add at the bottom of the file:

```ts
/**
 * Strip MITRE citation markers like (Citation: Source Name) from description
 * text. Collapses consecutive whitespace into single spaces and trims the
 * result. Citation markers are emitted by MITRE STIX bundles for inline
 * source attribution and have no use in our UI.
 *
 * Note: the regex matches up to the first ')' inside a marker. Citations
 * that themselves contain ')' (e.g. nested parens like "(Citation: X (2024))")
 * will not be fully stripped — this is a rare edge case in MITRE data and
 * acceptable for v1.
 */
export function stripCitations(raw: string): string {
  return raw
    .replace(/\(Citation:[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fetcher.test`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attack/fetcher.ts src/lib/attack/__tests__/fetcher.test.ts
git commit -m "feat(fetcher): add stripCitations helper with tests"
```

---

## Task 6: Implement `truncateForSearch` helper (TDD)

**Files:**
- Modify: `src/lib/attack/fetcher.ts`
- Modify: `src/lib/attack/__tests__/fetcher.test.ts`

- [ ] **Step 1: Append failing tests to `fetcher.test.ts`**

Add this `describe` block below the existing one:

```ts
import { stripCitations, truncateForSearch } from '../fetcher';

describe('lib/attack/fetcher: truncateForSearch', () => {
  test('returns short input unchanged', () => {
    expect(truncateForSearch('Short text.')).toBe('Short text.');
  });

  test('strips citations before measuring length', () => {
    const raw = 'PowerShell is everywhere. (Citation: A)(Citation: B)';
    expect(truncateForSearch(raw)).toBe('PowerShell is everywhere.');
  });

  test('truncates at a word boundary for long input', () => {
    // Build a deterministic long string of repeated 10-char words.
    const word = 'abcdefghi '; // 10 chars including trailing space
    const long = word.repeat(50).trim(); // ~500 chars
    const result = truncateForSearch(long);
    expect(result.length).toBeLessThanOrEqual(200);
    // Must not end mid-word: the result should end at a complete word.
    expect(result.endsWith('abcdefghi')).toBe(true);
  });

  test('hard-cuts at 200 chars when no late-enough space exists', () => {
    // 300-char run of non-space characters: no word boundary within the
    // upper half of the truncation window, so we fall back to a hard cut.
    const noSpaces = 'x'.repeat(300);
    const result = truncateForSearch(noSpaces);
    expect(result).toHaveLength(200);
  });
});
```

Also update the import at the top of the test file (replace the existing import line):

```ts
import { stripCitations, truncateForSearch } from '../fetcher';
```

- [ ] **Step 2: Run test to verify the new block fails**

Run: `npm test -- fetcher.test`
Expected: FAIL — `truncateForSearch` is not exported.

- [ ] **Step 3: Implement `truncateForSearch` in `src/lib/attack/fetcher.ts`**

Append:

```ts
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
  // window — otherwise we would discard most of the content.
  return lastSpace > 100 ? cut.slice(0, lastSpace) : cut;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fetcher.test`
Expected: PASS — all tests in both describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attack/fetcher.ts src/lib/attack/__tests__/fetcher.test.ts
git commit -m "feat(fetcher): add truncateForSearch helper with tests"
```

---

## Task 7: Implement `deriveDataComponentId` helper (TDD)

**Files:**
- Modify: `src/lib/attack/fetcher.ts`
- Modify: `src/lib/attack/__tests__/fetcher.test.ts`

This helper produces a stable, URL-shareable ID for a data component STIX object. Newer ATT&CK releases sometimes publish an `external_id`; older ones don't. We prefer the published ID when present and fall back to a deterministic name-based slug prefixed with the parent data source's ID.

- [ ] **Step 1: Append failing tests to `fetcher.test.ts`**

Update the import line at the top of the file to include the new export:

```ts
import { stripCitations, truncateForSearch, deriveDataComponentId } from '../fetcher';
```

Then add this `describe` block:

```ts
describe('lib/attack/fetcher: deriveDataComponentId', () => {
  test('prefers the STIX external_id when present', () => {
    const obj = {
      type: 'x-mitre-data-component',
      id: 'x-mitre-data-component--abc',
      name: 'Process Creation',
      external_references: [{ source_name: 'mitre-attack', external_id: 'DC0001' }],
    };
    expect(deriveDataComponentId(obj as any, 'DS0009')).toBe('DC0001');
  });

  test('falls back to slug derived from parent data source + component name', () => {
    const obj = {
      type: 'x-mitre-data-component',
      id: 'x-mitre-data-component--abc',
      name: 'Process Creation',
    };
    expect(deriveDataComponentId(obj as any, 'DS0009')).toBe('DS0009-process-creation');
  });

  test('slug lowercases and replaces spaces and slashes', () => {
    const obj = {
      type: 'x-mitre-data-component',
      id: 'x-mitre-data-component--xyz',
      name: 'OS API Execution / Hook',
    };
    expect(deriveDataComponentId(obj as any, 'DS0011'))
      .toBe('DS0011-os-api-execution-hook');
  });

  test('strips any character that is not [a-z0-9-]', () => {
    const obj = {
      type: 'x-mitre-data-component',
      id: 'x-mitre-data-component--zzz',
      name: 'Network "Connection" Creation!',
    };
    expect(deriveDataComponentId(obj as any, 'DS0029'))
      .toBe('DS0029-network-connection-creation');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fetcher.test`
Expected: FAIL — `deriveDataComponentId` is not exported.

- [ ] **Step 3: Implement `deriveDataComponentId` in `src/lib/attack/fetcher.ts`**

Append:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fetcher.test`
Expected: PASS — all 4 new tests green plus existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attack/fetcher.ts src/lib/attack/__tests__/fetcher.test.ts
git commit -m "feat(fetcher): add deriveDataComponentId helper with tests"
```

---

## Task 8: Implement `buildMitigationRelationships` helper (TDD)

**Files:**
- Modify: `src/lib/attack/fetcher.ts`
- Modify: `src/lib/attack/__tests__/fetcher.test.ts`

- [ ] **Step 1: Append failing tests to `fetcher.test.ts`**

Update the import line again:

```ts
import {
  stripCitations,
  truncateForSearch,
  deriveDataComponentId,
  buildMitigationRelationships,
} from '../fetcher';
```

Add the describe block:

```ts
describe('lib/attack/fetcher: buildMitigationRelationships', () => {
  // STIX UUIDs are arbitrary but must match between objects and relationships.
  const mitigationStixId = 'course-of-action--m1';
  const technique1StixId = 'attack-pattern--t1';
  const technique2StixId = 'attack-pattern--t2';

  // Map from STIX UUID to ATT&CK ID — built by the fetcher's existing
  // stixIdToAttackId pass; here we pre-build it for the test.
  const stixIdToAttackId = new Map([
    [mitigationStixId, 'M1041'],
    [technique1StixId, 'T1566'],
    [technique2StixId, 'T1566.001'],
  ]);

  const relationships: any[] = [
    {
      type: 'relationship',
      relationship_type: 'mitigates',
      source_ref: mitigationStixId,
      target_ref: technique1StixId,
    },
    {
      type: 'relationship',
      relationship_type: 'mitigates',
      source_ref: mitigationStixId,
      target_ref: technique2StixId,
    },
    // A 'uses' relationship should be ignored by this builder.
    {
      type: 'relationship',
      relationship_type: 'uses',
      source_ref: 'intrusion-set--g1',
      target_ref: technique1StixId,
    },
  ];

  test('builds techniqueId -> mitigationIds map', () => {
    const { mitigationIdsByTechnique } = buildMitigationRelationships(relationships, stixIdToAttackId);
    expect(mitigationIdsByTechnique.get('T1566')).toEqual(['M1041']);
    expect(mitigationIdsByTechnique.get('T1566.001')).toEqual(['M1041']);
  });

  test('builds reverse mitigationId -> techniqueIds map', () => {
    const { techniqueIdsByMitigation } = buildMitigationRelationships(relationships, stixIdToAttackId);
    expect(techniqueIdsByMitigation.get('M1041')?.sort()).toEqual(['T1566', 'T1566.001']);
  });

  test('ignores relationships whose source or target ID is unknown', () => {
    const orphan: any[] = [
      {
        type: 'relationship',
        relationship_type: 'mitigates',
        source_ref: 'course-of-action--unknown',
        target_ref: technique1StixId,
      },
    ];
    const { mitigationIdsByTechnique } = buildMitigationRelationships(orphan, stixIdToAttackId);
    expect(mitigationIdsByTechnique.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fetcher.test`
Expected: FAIL — `buildMitigationRelationships` is not exported.

- [ ] **Step 3: Implement `buildMitigationRelationships` in `src/lib/attack/fetcher.ts`**

Append:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fetcher.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attack/fetcher.ts src/lib/attack/__tests__/fetcher.test.ts
git commit -m "feat(fetcher): add buildMitigationRelationships helper with tests"
```

---

## Task 9: Implement `buildDetectionRelationships` helper (TDD)

**Files:**
- Modify: `src/lib/attack/fetcher.ts`
- Modify: `src/lib/attack/__tests__/fetcher.test.ts`

- [ ] **Step 1: Append failing tests to `fetcher.test.ts`**

Update the import line:

```ts
import {
  stripCitations,
  truncateForSearch,
  deriveDataComponentId,
  buildMitigationRelationships,
  buildDetectionRelationships,
} from '../fetcher';
```

Add the describe block:

```ts
describe('lib/attack/fetcher: buildDetectionRelationships', () => {
  const componentStixId = 'x-mitre-data-component--c1';
  const techniqueStixId = 'attack-pattern--t1';

  // For detections the relationship source uses the STIX UUID of the
  // data component, NOT the data component's ATT&CK ID. The caller
  // resolves the UUID to our (possibly synthetic) data component ID.
  const stixIdToDataComponentId = new Map([
    [componentStixId, 'DS0009-process-creation'],
  ]);
  const stixIdToAttackId = new Map([
    [techniqueStixId, 'T1059'],
  ]);

  const relationships: any[] = [
    {
      type: 'relationship',
      relationship_type: 'detects',
      source_ref: componentStixId,
      target_ref: techniqueStixId,
    },
    // 'uses' should be ignored.
    {
      type: 'relationship',
      relationship_type: 'uses',
      source_ref: 'intrusion-set--g1',
      target_ref: techniqueStixId,
    },
  ];

  test('builds techniqueId -> dataComponentIds map', () => {
    const { dataComponentIdsByTechnique } = buildDetectionRelationships(
      relationships,
      stixIdToDataComponentId,
      stixIdToAttackId,
    );
    expect(dataComponentIdsByTechnique.get('T1059')).toEqual(['DS0009-process-creation']);
  });

  test('builds reverse dataComponentId -> techniqueIds map', () => {
    const { techniqueIdsByDataComponent } = buildDetectionRelationships(
      relationships,
      stixIdToDataComponentId,
      stixIdToAttackId,
    );
    expect(techniqueIdsByDataComponent.get('DS0009-process-creation')).toEqual(['T1059']);
  });

  test('skips relationships whose source data component is unknown', () => {
    const orphan: any[] = [
      {
        type: 'relationship',
        relationship_type: 'detects',
        source_ref: 'x-mitre-data-component--unknown',
        target_ref: techniqueStixId,
      },
    ];
    const { dataComponentIdsByTechnique } = buildDetectionRelationships(
      orphan,
      stixIdToDataComponentId,
      stixIdToAttackId,
    );
    expect(dataComponentIdsByTechnique.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fetcher.test`
Expected: FAIL.

- [ ] **Step 3: Implement `buildDetectionRelationships` in `src/lib/attack/fetcher.ts`**

Append:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fetcher.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attack/fetcher.ts src/lib/attack/__tests__/fetcher.test.ts
git commit -m "feat(fetcher): add buildDetectionRelationships helper with tests"
```

---

## Task 10: Wire helpers into `scripts/fetch-attack-data.ts` and emit new output

**Files:**
- Modify: `scripts/fetch-attack-data.ts`

This is the largest single change in the plan and is exclusively script-level integration. No tests are added here because the unit tests in `fetcher.test.ts` cover the pure logic; the only thing left is the orchestration. Manual verification at Task 19 confirms the output looks right against real MITRE data.

**Required order of operations inside `main()`** (because the new relationship builders must run BEFORE the technique transform so techniques can read `mitigationIds` and `dataComponentIds`):

1. live filter (existing)
2. tactics transform + `tacticIdByShortName` (existing)
3. **NEW:** mitigation collection
4. **NEW:** data source + data component collection (produces `dataComponentIdByStixId`)
5. broader relationships filter (modify existing — include `mitigates`, `detects`)
6. extended `stixIdToAttackId` build (modify existing — include `course-of-action`)
7. **NEW:** `buildMitigationRelationships` + `buildDetectionRelationships` calls
8. techniques transform (existing — extended to read the builder maps)
9. existing `uses` relationship forward-collection loop (unchanged)
10. groups + software transforms (unchanged)
11. search-entries build (modified — populate truncated descriptions)
12. write `attack-graph.json` (modified — include new top-level arrays)
13. **NEW:** build + write `attack-descriptions.json`

The steps below assume you apply changes in this order. If a step references something not yet built when you read it linearly, hoist the producing step above the consumer first.

- [ ] **Step 1: Open `scripts/fetch-attack-data.ts` and import the new helpers**

At the top of the file, replace the existing imports with:

```ts
import fs from 'fs';
import path from 'path';
import {
  stripCitations,
  truncateForSearch,
  deriveDataComponentId,
  buildMitigationRelationships,
  buildDetectionRelationships,
  type StixObject,
} from '../src/lib/attack/fetcher';
```

Then delete the local `StixObject` interface (the imported one is now the source of truth). Keep the local `attackId(obj)` and `parentIdFor(subId)` helpers in place — they are small, only used by the orchestration script, and not duplicated anywhere.

- [ ] **Step 2: Add an `OUT_DESCRIPTIONS` path constant beside the existing output paths**

Find the existing constants block and add:

```ts
const OUT_DESCRIPTIONS = path.join(OUT_DIR, 'attack-descriptions.json');
```

- [ ] **Step 3: In `main()`, after the existing technique transform, add the mitigation collection**

Find the section that currently ends with the techniques transform (just before "Collect groups (intrusion-sets) and software"). Insert:

```ts
  // --- Collect mitigations (course-of-action objects) ---
  const mitigations = live
    .filter(o => o.type === 'course-of-action')
    .map(o => {
      const id = attackId(o);
      if (!id) return null;
      return { id, name: o.name ?? '' };
    })
    .filter((m): m is { id: string; name: string } => !!m);
```

- [ ] **Step 4: Below the mitigation collection, add data source + data component collection**

```ts
  // --- Collect data sources and data components ---
  // Data sources are top-level entities (DS0009 = "Process") and own data
  // components (e.g. "Process Creation"). Data components carry a
  // x_mitre_data_source_ref pointing to their parent data source's STIX UUID.
  const dataSourceObjs = live.filter(o => o.type === 'x-mitre-data-source');
  const dataSources = dataSourceObjs
    .map(o => {
      const id = attackId(o);
      if (!id) return null;
      return { id, name: o.name ?? '' };
    })
    .filter((d): d is { id: string; name: string } => !!d);

  // Build a STIX-UUID -> ATT&CK-ID map for data sources so we can resolve
  // each data component's x_mitre_data_source_ref to a known parent.
  const dataSourceIdByStixId = new Map<string, string>();
  for (const o of dataSourceObjs) {
    const aid = attackId(o);
    if (aid) dataSourceIdByStixId.set(o.id, aid);
  }

  // Transform data components, deriving an ID via the helper.
  // dataComponentIdByStixId is used in the detects-relationship pass below.
  const dataComponentObjs = live.filter(o => o.type === 'x-mitre-data-component');
  const dataComponentIdByStixId = new Map<string, string>();
  const dataComponents = dataComponentObjs
    .map(o => {
      const parentStixId = o.x_mitre_data_source_ref;
      if (!parentStixId) return null;
      const parentId = dataSourceIdByStixId.get(parentStixId);
      if (!parentId) return null;
      const id = deriveDataComponentId(o, parentId);
      dataComponentIdByStixId.set(o.id, id);
      return { id, name: o.name ?? '', dataSourceId: parentId };
    })
    .filter((d): d is { id: string; name: string; dataSourceId: string } => !!d);
```

- [ ] **Step 5: Extend the existing `stixIdToAttackId` build to include course-of-action**

Find the existing loop that populates `stixIdToAttackId`:

```ts
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
```

Replace with:

```ts
  for (const o of live) {
    if (
      o.type !== 'attack-pattern' &&
      o.type !== 'intrusion-set' &&
      o.type !== 'malware' &&
      o.type !== 'tool' &&
      // course-of-action joins the resolver because mitigates relationships
      // resolve their source through this same map.
      o.type !== 'course-of-action'
    ) continue;
    const aid = attackId(o);
    if (aid) stixIdToAttackId.set(o.id, aid);
  }
```

- [ ] **Step 6: Broaden the relationships filter to include `mitigates` and `detects`**

Find:

```ts
  const relationships = live.filter(o => o.type === 'relationship' && o.relationship_type === 'uses');
```

Replace with:

```ts
  // We now consume three relationship types. Each helper below filters its
  // own type; this top-level fetch just narrows from 'all STIX objects' to
  // 'all relationship objects we care about'.
  const relationships = live.filter(o =>
    o.type === 'relationship' &&
    (o.relationship_type === 'uses' ||
      o.relationship_type === 'mitigates' ||
      o.relationship_type === 'detects'),
  );
```

- [ ] **Step 7: Call the two new builders so the technique transform can read them**

Per the "Required order of operations" preamble at the top of this task, the builder calls must run BEFORE the techniques transform (because the technique transform reads `mitigationIdsByTechnique` and `dataComponentIdsByTechnique`). They must run AFTER the broader relationships filter (Step 6) and the extended `stixIdToAttackId` build (Step 5) and the data component collection (Step 4).

Place this block immediately after the extended `stixIdToAttackId` build and before the techniques `.map(...)` transform:

```ts
  // Mitigates: course-of-action -> attack-pattern. Only the forward map is
  // read by the fetcher — DataLayer rebuilds the reverse direction at
  // runtime by iterating techniques (Task 11). Destructure only what we use
  // to avoid 'unused variable' lint complaints.
  const { mitigationIdsByTechnique } =
    buildMitigationRelationships(relationships, stixIdToAttackId);

  // Detects: x-mitre-data-component -> attack-pattern. The data-component
  // source uses dataComponentIdByStixId (built in Step 4) because data
  // components may not have a stable mitre-attack external_id. Same
  // forward-only destructure as the mitigation builder above.
  const { dataComponentIdsByTechnique } =
    buildDetectionRelationships(relationships, dataComponentIdByStixId, stixIdToAttackId);
```

- [ ] **Step 8: In the technique transform, populate `mitigationIds` and `dataComponentIds`**

The existing techniques `.map(...)` now has access to the builder maps (since Step 7 runs before it). At the bottom of the existing `return` block inside the map, add the two new fields:

```ts
      return {
        id,
        name: o.name!,
        tacticIds,
        platforms: o.x_mitre_platforms ?? [],
        parentId: parentId ?? undefined,
        isSubtechnique,
        // NEW: empty array fallback ensures the field is always present.
        mitigationIds: mitigationIdsByTechnique.get(id) ?? [],
        dataComponentIds: dataComponentIdsByTechnique.get(id) ?? [],
      };
```

- [ ] **Step 9: Write the new top-level arrays into the graph output**

Find the existing `graph` constant near the bottom of `main()`:

```ts
  const graph = { version, tactics, techniques, groups, software };
```

Replace with:

```ts
  const graph = {
    version,
    tactics,
    techniques,
    groups,
    software,
    mitigations,
    dataSources,
    dataComponents,
  };
```

- [ ] **Step 10: Build and emit `attack-descriptions.json`**

After the existing `fs.writeFileSync(GRAPH_OUT, ...)` line and before the search index build, add:

```ts
  // --- Build the descriptions map ---
  // Maps every entity ID (technique, group, software, tactic, mitigation,
  // data source, data component) to its full citation-stripped description.
  // Entities without a description in MITRE's data are omitted; the runtime
  // hook returns null for missing keys.
  const descriptions: Record<string, string> = {};

  for (const obj of live) {
    const aid = attackId(obj);
    if (!aid || !obj.description) continue;
    descriptions[aid] = stripCitations(obj.description);
  }

  // Data components have synthetic IDs, so we map them separately by
  // pairing each STIX UUID we resolved earlier with its derived ID.
  for (const obj of dataComponentObjs) {
    const derivedId = dataComponentIdByStixId.get(obj.id);
    if (!derivedId || !obj.description) continue;
    descriptions[derivedId] = stripCitations(obj.description);
  }

  fs.writeFileSync(OUT_DESCRIPTIONS, JSON.stringify(descriptions, null, 2));
```

- [ ] **Step 11: Populate truncated descriptions in the search index**

Find the existing search-entries construction:

```ts
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
```

Replace with:

```ts
  // Build a STIX-UUID -> description lookup so we can attach truncated
  // descriptions to each search-index entry without scanning the bundle
  // multiple times. Keyed by ATT&CK ID since that's what each entry has.
  const descriptionByAttackId = new Map<string, string>();
  for (const obj of live) {
    const aid = attackId(obj);
    if (aid && obj.description) descriptionByAttackId.set(aid, obj.description);
  }

  const searchEntries = [
    ...techniques.map(t => ({
      id: t.id,
      type: 'technique' as const,
      name: t.name,
      aliases: [] as string[],
      description: truncateForSearch(descriptionByAttackId.get(t.id) ?? ''),
    })),
    ...groups.map(g => ({
      id: g.id,
      type: 'group' as const,
      name: g.name,
      aliases: g.aliases,
      description: truncateForSearch(descriptionByAttackId.get(g.id) ?? ''),
    })),
    ...software.map(s => ({
      id: s.id,
      type: 'software' as const,
      name: s.name,
      aliases: [] as string[],
      description: truncateForSearch(descriptionByAttackId.get(s.id) ?? ''),
    })),
  ];
```

- [ ] **Step 12: Add a console log for the descriptions file at the end of `main()`**

After the existing two `console.log(`Wrote ...`)` lines, add:

```ts
  console.log(`Wrote ${OUT_DESCRIPTIONS} (${Object.keys(descriptions).length} entries)`);
  console.log(`  mitigations: ${mitigations.length}`);
  console.log(`  data sources: ${dataSources.length}`);
  console.log(`  data components: ${dataComponents.length}`);
```

- [ ] **Step 13: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add scripts/fetch-attack-data.ts
git commit -m "feat(fetcher): collect mitigations + data sources + emit descriptions

Extends scripts/fetch-attack-data.ts to collect course-of-action and
x-mitre-data-source / x-mitre-data-component STIX entities and the
mitigates / detects relationships. Emits a third output file
public/data/attack-descriptions.json that maps entity IDs to full
citation-stripped description text. The search index now carries
truncated descriptions so ranking can use them. All new logic is
delegated to pure helpers in src/lib/attack/fetcher.ts which are
covered by fetcher.test.ts."
```

---

## Task 11: Extend `DataLayer` with new accessors (TDD)

**Files:**
- Modify: `src/lib/attack/data.ts`
- Modify: `src/lib/attack/__tests__/data.test.ts`

- [ ] **Step 1: Append failing tests to `data.test.ts`**

Add this `describe` block at the end of the file (inside the outer `describe('lib/attack/data', ...)`):

```ts
  test('getMitigation returns a mitigation by id', () => {
    expect(dl.getMitigation('M1041')?.name).toBe('Encrypt Sensitive Information');
    expect(dl.getMitigation('M9999')).toBeNull();
  });

  test('getDataSource returns a data source by id', () => {
    expect(dl.getDataSource('DS0009')?.name).toBe('Process');
    expect(dl.getDataSource('DS9999')).toBeNull();
  });

  test('getDataComponent returns a data component by id', () => {
    expect(dl.getDataComponent('DS0009-process-creation')?.name).toBe('Process Creation');
    expect(dl.getDataComponent('does-not-exist')).toBeNull();
  });

  test('getMitigationsForTechnique returns mitigations forward-listed on the technique', () => {
    const ms = dl.getMitigationsForTechnique('T1059');
    expect(ms.map(m => m.id)).toEqual(['M1042']);
    expect(dl.getMitigationsForTechnique('T1098')).toEqual([]);
  });

  test('getDataComponentsForTechnique returns components forward-listed on the technique', () => {
    const cs = dl.getDataComponentsForTechnique('T1059');
    expect(cs.map(c => c.id).sort()).toEqual([
      'DS0009-process-creation',
      'DS0017-command-execution',
    ]);
  });

  test('getTechniquesForMitigation returns reverse-listed techniques (symmetric to forward)', () => {
    const ts = dl.getTechniquesForMitigation('M1041');
    expect(ts.map(t => t.id).sort()).toEqual(['T1566', 'T1566.001']);
    expect(dl.getTechniquesForMitigation('M9999')).toEqual([]);
  });

  test('getTechniquesForDataComponent returns reverse-listed techniques (symmetric to forward)', () => {
    const ts = dl.getTechniquesForDataComponent('DS0009-process-creation');
    expect(ts.map(t => t.id).sort()).toEqual(['T1059', 'T1059.001']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- data.test`
Expected: FAIL — none of the new methods exist on `DataLayer`.

- [ ] **Step 3: Extend the `DataLayer` interface and implementation**

Open `src/lib/attack/data.ts`. Add the new types to the import line:

```ts
import type {
  GraphData,
  Tactic,
  Technique,
  Group,
  Software,
  Mitigation,
  DataSource,
  DataComponent,
} from './types';
```

Extend the `DataLayer` interface with the six new method signatures (insert after `getAllSoftware()`):

```ts
  // New mitigation accessors
  getMitigation(id: string): Mitigation | null;
  getDataSource(id: string): DataSource | null;
  getDataComponent(id: string): DataComponent | null;
  getMitigationsForTechnique(techniqueId: string): Mitigation[];
  getDataComponentsForTechnique(techniqueId: string): DataComponent[];
  getTechniquesForMitigation(mitigationId: string): Technique[];
  getTechniquesForDataComponent(componentId: string): Technique[];
```

Inside `createDataLayer`, after the existing `softwareByTechnique` build, add the new indexes:

```ts
  // Primary by-id indexes for the new entity types.
  const mitigationById = new Map(graph.mitigations.map(m => [m.id, m]));
  const dataSourceById = new Map(graph.dataSources.map(d => [d.id, d]));
  const dataComponentById = new Map(graph.dataComponents.map(d => [d.id, d]));

  // Reverse indexes from mitigation/component -> techniques. Built by
  // iterating techniques once and inverting their mitigationIds and
  // dataComponentIds arrays (same pattern as groupsByTechnique above).
  const techniquesByMitigation = new Map<string, Technique[]>();
  const techniquesByDataComponent = new Map<string, Technique[]>();
  for (const t of graph.techniques) {
    for (const mid of t.mitigationIds) {
      const arr = techniquesByMitigation.get(mid) ?? [];
      arr.push(t);
      techniquesByMitigation.set(mid, arr);
    }
    for (const cid of t.dataComponentIds) {
      const arr = techniquesByDataComponent.get(cid) ?? [];
      arr.push(t);
      techniquesByDataComponent.set(cid, arr);
    }
  }
```

Inside the returned object, add the new accessor implementations after `getAllSoftware`:

```ts
    // New mitigation / data-component accessors.
    getMitigation: (id) => mitigationById.get(id) ?? null,
    getDataSource: (id) => dataSourceById.get(id) ?? null,
    getDataComponent: (id) => dataComponentById.get(id) ?? null,

    // Forward lookups resolve each ID listed on the technique to an entity
    // object, filtering out any unknown IDs (defensive).
    getMitigationsForTechnique: (techniqueId) => {
      const t = techniqueById.get(techniqueId);
      if (!t) return [];
      return t.mitigationIds
        .map(mid => mitigationById.get(mid))
        .filter((m): m is Mitigation => !!m);
    },
    getDataComponentsForTechnique: (techniqueId) => {
      const t = techniqueById.get(techniqueId);
      if (!t) return [];
      return t.dataComponentIds
        .map(cid => dataComponentById.get(cid))
        .filter((c): c is DataComponent => !!c);
    },

    // Reverse lookups read directly from the pre-built indexes.
    getTechniquesForMitigation: (mitigationId) =>
      techniquesByMitigation.get(mitigationId) ?? [],
    getTechniquesForDataComponent: (componentId) =>
      techniquesByDataComponent.get(componentId) ?? [],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- data.test`
Expected: PASS — all existing tests still green plus 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attack/data.ts src/lib/attack/__tests__/data.test.ts
git commit -m "feat(data): add mitigation and data-component accessors to DataLayer

Six new O(1) accessors covering forward and reverse lookups for
mitigations and data components. Reverse indexes are built once at
provider construction by iterating techniques' mitigationIds and
dataComponentIds arrays."
```

---

## Task 12: Add `useDescription` hook and context state (TDD)

**Files:**
- Modify: `src/lib/attack/context.tsx`
- Create: `src/lib/attack/__tests__/descriptions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/attack/__tests__/descriptions.test.ts`:

```ts
// Tests for the useDescription context hook. Verifies it returns null
// when descriptions haven't loaded yet (or are absent for an entity)
// and the loaded string when present.

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttackProvider, useDescription } from '@/lib/attack/context';
import type { GraphData, SearchIndex, DescriptionMap } from '@/lib/attack/types';
import fixture from '@/lib/attack/__tests__/fixtures/mini-graph.json';

const graph = fixture as GraphData;
const searchIndex: SearchIndex = { entries: [] };

// Test harness: a single component that renders the result of useDescription
// in a stable text node we can query.
function Probe({ id }: { id: string }) {
  const text = useDescription(id);
  return <div data-testid="probe">{text === null ? 'NULL' : text}</div>;
}

function renderWithDescriptions(id: string, descriptions: DescriptionMap | null) {
  return render(
    <AttackProvider graph={graph} searchIndex={searchIndex} descriptions={descriptions}>
      <Probe id={id} />
    </AttackProvider>,
  );
}

describe('lib/attack/context: useDescription', () => {
  test('returns null when descriptions prop is null (still loading)', () => {
    renderWithDescriptions('T1059', null);
    expect(screen.getByTestId('probe')).toHaveTextContent('NULL');
  });

  test('returns the description string when present in the map', () => {
    renderWithDescriptions('T1059', { 'T1059': 'A description.' });
    expect(screen.getByTestId('probe')).toHaveTextContent('A description.');
  });

  test('returns null for an unknown entity even when the map is loaded', () => {
    renderWithDescriptions('T9999', { 'T1059': 'A description.' });
    expect(screen.getByTestId('probe')).toHaveTextContent('NULL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- descriptions.test`
Expected: FAIL — `useDescription` is not exported and `AttackProvider` does not accept a `descriptions` prop.

- [ ] **Step 3: Extend `src/lib/attack/context.tsx`**

Update the type imports:

```ts
import {
  EMPTY_FILTERS,
  EMPTY_COVERAGE,
  type GraphData,
  type SearchIndex,
  type FilterState,
  type Vec3,
  type CoverageState,
  type DescriptionMap,
} from './types';
```

Extend `AttackContextValue` with the new slot:

```ts
interface AttackContextValue {
  // ...existing fields unchanged...
  // Map from entity ID to its description text. null until the second
  // fetch resolves; the panel renders a placeholder line either way.
  descriptions: DescriptionMap | null;
}
```

Extend `ProviderProps`:

```ts
interface ProviderProps {
  // ...existing props unchanged...
  // Optional description map. Defaults to null so existing call sites
  // (tests that mount AttackProvider without descriptions) keep working.
  descriptions?: DescriptionMap | null;
  children: ReactNode;
}
```

Extend the `AttackProvider` function signature and value construction:

```ts
export function AttackProvider({
  graph,
  searchIndex,
  initialFilters = EMPTY_FILTERS,
  initialFocusId = null,
  onStateChange,
  // NEW: defaults to null so old call sites are unaffected.
  descriptions = null,
  children,
}: ProviderProps) {
  // ...existing body unchanged through coverage setup...

  const value: AttackContextValue = {
    data,
    searchIndex,
    positions,
    filters,
    setFilters,
    focusId,
    setFocusId,
    hoveredId,
    setHoveredId,
    coverage,
    setCoverage,
    // NEW: pass the descriptions slot through.
    descriptions,
  };

  return <AttackContext.Provider value={value}>{children}</AttackContext.Provider>;
}
```

Add the new hook at the bottom of the file, after `useCoverage`:

```ts
/**
 * Returns the description text for the given entity ID, or null if either
 * (a) the descriptions map has not finished loading, or (b) MITRE has no
 * description for that entity. The caller cannot distinguish the two cases
 * and renders the same "No description available." placeholder either way
 * — that's a deliberate simplification.
 */
export function useDescription(id: string): string | null {
  const ctx = useCtx();
  if (!ctx.descriptions) return null;
  return ctx.descriptions[id] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- descriptions.test`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/attack/context.tsx src/lib/attack/__tests__/descriptions.test.ts
git commit -m "feat(context): add descriptions slot and useDescription hook

DescriptionMap lives in a parallel context slot rather than on the
entity types, so DataLayer stays a pure function of GraphData and
existing call sites that don't pass descriptions keep working.
useDescription returns null for both 'still loading' and 'no
description in MITRE' — the panel renders the same placeholder for
both cases."
```

---

## Task 13: Update `App.tsx` with parallel descriptions fetch

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Extend the `LoadedState` interface and add a descriptions state slot**

Open `src/App.tsx`. Update the type imports:

```ts
import type { GraphData, SearchIndex, FilterState, DescriptionMap } from '@/lib/attack/types';
```

Just below the existing `LoadedState` interface, leave it unchanged. Inside the `App()` function, just below the existing `useState` for `loaded` and `error`, add the descriptions slot:

```ts
  // descriptions is fetched in parallel and lands when it lands; it does NOT
  // gate the splash dismissal. Defaults to null until the fetch resolves
  // (or fails — soft-fail to empty map on any error).
  const [descriptions, setDescriptions] = useState<DescriptionMap | null>(null);
```

- [ ] **Step 2: Add the parallel descriptions fetch inside the existing `useEffect`**

Find the existing `useEffect` block:

```ts
  useEffect(() => {
    Promise.all([
      fetch('/data/attack-graph.json').then(r => r.json()),
      fetch('/data/attack-index.json').then(r => r.json()),
    ])
      .then(([graph, searchIndex]) => setLoaded({ graph, searchIndex }))
      .catch(err => setError(String(err)));
  }, []);
```

Replace with:

```ts
  useEffect(() => {
    // First fetch: graph + search index gate the splash dismissal.
    Promise.all([
      fetch('/data/attack-graph.json').then(r => r.json()),
      fetch('/data/attack-index.json').then(r => r.json()),
    ])
      .then(([graph, searchIndex]) => setLoaded({ graph, searchIndex }))
      .catch(err => setError(String(err)));

    // Second fetch: descriptions are additive. Soft-fail to an empty map on
    // any error (404, network drop, malformed JSON) so the app stays usable
    // — the detail panel just renders "No description available." everywhere.
    fetch('/data/attack-descriptions.json')
      .then(r => r.json())
      .then((map: DescriptionMap) => setDescriptions(map))
      .catch(() => setDescriptions({}));
  }, []);
```

- [ ] **Step 3: Pass `descriptions` into `AttackProvider`**

Find the `<AttackProvider>` JSX at the bottom of `App()`:

```tsx
    <AttackProvider
      graph={loaded.graph}
      searchIndex={loaded.searchIndex}
      initialFilters={initial.filters}
      initialFocusId={initial.focusId ?? null}
      onStateChange={handleStateChange}
    >
```

Add the `descriptions` prop:

```tsx
    <AttackProvider
      graph={loaded.graph}
      searchIndex={loaded.searchIndex}
      initialFilters={initial.filters}
      initialFocusId={initial.focusId ?? null}
      onStateChange={handleStateChange}
      descriptions={descriptions}
    >
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 5: Run the full test suite to confirm no regression**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): parallel fire-and-forget fetch of descriptions

Descriptions land in their own state slot and pass through to
AttackProvider. The fetch is intentionally not awaited before the
splash dismisses — first paint is unchanged. On any error the
descriptions slot falls back to an empty map so the panel just
renders without descriptions; no error UI."
```

---

## Task 14: Add `Description` sub-component to `DetailPanel`

**Files:**
- Modify: `src/components/attack/DetailPanel.tsx`
- Modify: `src/components/attack/__tests__/DetailPanel.test.tsx`

- [ ] **Step 1: Append a failing test to `DetailPanel.test.tsx`**

Add a new test inside the existing `describe('DetailPanel', ...)` block:

```ts
  // When descriptions are loaded and the focused entity has one, it should
  // render as a section above the existing technique info fields.
  test('renders the description when present in the descriptions map', () => {
    render(
      <AttackProvider
        graph={graph}
        searchIndex={searchIndex}
        initialFocusId="T1098"
        descriptions={{ 'T1098': 'Adversaries manipulate accounts to maintain access.' }}
      >
        <DetailPanel />
      </AttackProvider>,
    );
    expect(screen.getByText(/manipulate accounts to maintain access/)).toBeInTheDocument();
  });

  // "Show more" toggle appears for descriptions over 400 chars.
  test('shows the Show more toggle for long descriptions and toggles on click', () => {
    const longText = 'a'.repeat(500);
    render(
      <AttackProvider
        graph={graph}
        searchIndex={searchIndex}
        initialFocusId="T1098"
        descriptions={{ 'T1098': longText }}
      >
        <DetailPanel />
      </AttackProvider>,
    );
    const toggle = screen.getByRole('button', { name: /show more/i });
    expect(toggle).toBeInTheDocument();
    // The visible text is truncated initially — full length is greater than rendered length.
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });

  // Returns the placeholder line when the descriptions map is null (still loading)
  // OR the entity has no description.
  test('renders the placeholder when no description is loaded', () => {
    render(
      <AttackProvider
        graph={graph}
        searchIndex={searchIndex}
        initialFocusId="T1098"
        descriptions={null}
      >
        <DetailPanel />
      </AttackProvider>,
    );
    expect(screen.getByText(/no description available/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- DetailPanel.test`
Expected: FAIL — no description rendering yet.

- [ ] **Step 3: Add the `Description` sub-component and import**

Open `src/components/attack/DetailPanel.tsx`. Update the imports:

```ts
import { useState } from 'react';
import { useGraph, useSelection, useCoverage, useDescription } from '@/lib/attack/context';
```

Add the new sub-component at the bottom of the file, after `CoverageLayerInfo`:

```tsx
/**
 * Description block for the focused entity. Calls useDescription(id);
 * renders a muted "No description available." line when null (either
 * loading or absent), or the prose with a "Show more" toggle when
 * the description exceeds LONG characters.
 *
 * The truncation happens at the LONG boundary regardless of word boundary
 * for simplicity — visual truncation, not search truncation. The fetcher's
 * truncateForSearch is what produces the search-index-ready truncations.
 */
function Description({ id }: { id: string }) {
  const text = useDescription(id);
  const [expanded, setExpanded] = useState(false);

  if (text === null) {
    return (
      <div className="text-xs text-lightteal/40 italic mb-3">
        No description available.
      </div>
    );
  }

  const LONG = 400;
  const isLong = text.length > LONG;
  // Trim trailing whitespace from the cut so the ellipsis doesn't look like "foo ...".
  const visible = !expanded && isLong ? text.slice(0, LONG).trimEnd() + '...' : text;

  return (
    <div className="mb-4 text-sm text-lightteal/85 whitespace-pre-line leading-relaxed">
      {visible}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="ml-1 text-medteal hover:text-lightteal text-xs"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mount `Description` in each existing entity branch**

In the Technique branch, add `<Description id={technique.id} />` just after the `<Header ... />` line and before `<Field label="Platforms" ... />`:

```tsx
    return (
      <div className="p-4 text-sm">
        <Header id={technique.id} name={technique.name} kind="Technique" onClose={close} />
        <Description id={technique.id} />
        <Field label="Platforms" value={technique.platforms.join(', ') || '—'} />
        {/* ... rest unchanged */}
      </div>
    );
```

In the Group branch:

```tsx
    return (
      <div className="p-4 text-sm">
        <Header id={group.id} name={group.name} kind="Group" onClose={close} />
        <Description id={group.id} />
        {group.aliases.length > 1 && <Field label="Aliases" value={group.aliases.join(', ')} />}
        {/* ... rest unchanged */}
      </div>
    );
```

In the Software branch:

```tsx
    return (
      <div className="p-4 text-sm">
        <Header
          id={software.id}
          name={software.name}
          kind={software.type === 'malware' ? 'Malware' : 'Tool'}
          onClose={close}
        />
        <Description id={software.id} />
        {/* ... rest unchanged */}
      </div>
    );
```

In the Tactic branch:

```tsx
    return (
      <div className="p-4 text-sm">
        <Header id={tactic.id} name={tactic.name} kind="Tactic" onClose={close} />
        <Description id={tactic.id} />
        <MitreLink href={`${MITRE_BASE}/tactics/${tactic.id}`} />
      </div>
    );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- DetailPanel.test`
Expected: PASS — the three new tests plus all existing tests green.

- [ ] **Step 6: Commit**

```bash
git add src/components/attack/DetailPanel.tsx src/components/attack/__tests__/DetailPanel.test.tsx
git commit -m "feat(panel): render description on every entity detail view

New Description sub-component reads via useDescription and renders
either the prose or a muted placeholder. Long text gets a Show
more / Show less toggle. Mounted in the technique, group, software,
and tactic branches."
```

---

## Task 15: Add `MitigationSection` and `DetectionSection` to the technique view (TDD)

**Files:**
- Modify: `src/components/attack/DetailPanel.tsx`
- Modify: `src/components/attack/__tests__/DetailPanel.test.tsx`

- [ ] **Step 1: Append failing tests**

Add inside `describe('DetailPanel', ...)`:

```ts
  test('renders the Mitigations section with name and count', () => {
    render(
      <AttackProvider graph={graph} searchIndex={searchIndex} initialFocusId="T1059">
        <DetailPanel />
      </AttackProvider>,
    );
    expect(screen.getByText(/Mitigations \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Disable or Remove Feature or Program/)).toBeInTheDocument();
  });

  test('renders the Detections section in "Data Source: Component" format', () => {
    render(
      <AttackProvider graph={graph} searchIndex={searchIndex} initialFocusId="T1059">
        <DetailPanel />
      </AttackProvider>,
    );
    expect(screen.getByText(/Detections \(2\)/)).toBeInTheDocument();
    // T1059 in the fixture has process-creation (under DS0009 Process) and
    // command-execution (under DS0017 Command).
    expect(screen.getByText(/Process: Process Creation/)).toBeInTheDocument();
    expect(screen.getByText(/Command: Command Execution/)).toBeInTheDocument();
  });

  test('clicking a mitigation selects it as the new focus', () => {
    render(
      <AttackProvider graph={graph} searchIndex={searchIndex} initialFocusId="T1059">
        <DetailPanel />
      </AttackProvider>,
    );
    // Click the M1042 mitigation button. It should swap the panel to the
    // mitigation view, which will be implemented in Task 16. For now we
    // assert the click target exists and is enabled.
    const btn = screen.getByRole('button', { name: /Disable or Remove Feature or Program/ });
    expect(btn).toBeEnabled();
  });

  test('omits Mitigations / Detections sections when counts are zero', () => {
    // T1566 in the fixture has zero detections (dataComponentIds: []).
    render(
      <AttackProvider graph={graph} searchIndex={searchIndex} initialFocusId="T1566">
        <DetailPanel />
      </AttackProvider>,
    );
    expect(screen.queryByText(/Detections \(/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- DetailPanel.test`
Expected: FAIL — no Mitigations or Detections sections yet.

- [ ] **Step 3: Add `MitigationSection` and `DetectionSection` sub-components**

At the bottom of `src/components/attack/DetailPanel.tsx` (after `Description`), add:

```tsx
/**
 * Lists mitigations linked to the focused technique. Each row is a button
 * that swaps focus to the mitigation's own detail view. Renders nothing
 * when the list is empty — the parent decides whether to mount it.
 */
function MitigationSection({
  mitigations,
  onPick,
}: {
  mitigations: { id: string; name: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wider text-lightteal/50 mb-1">
        Mitigations ({mitigations.length})
      </div>
      <ul className="space-y-1">
        {mitigations.map(m => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onPick(m.id)}
              className="text-medteal hover:text-lightteal text-left"
            >
              {m.name} <span className="text-lightteal/40">{m.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Lists detection data components linked to the focused technique. Each
 * row reads "Data Source Name: Component Name" so the analyst sees both
 * the category and the specific signal. Clicking a row focuses the
 * data component's own detail view.
 */
function DetectionSection({
  components,
  getDataSource,
  onPick,
}: {
  components: { id: string; name: string; dataSourceId: string }[];
  getDataSource: (id: string) => { id: string; name: string } | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wider text-lightteal/50 mb-1">
        Detections ({components.length})
      </div>
      <ul className="space-y-1">
        {components.map(c => {
          const ds = getDataSource(c.dataSourceId);
          // Display "Data Source: Component" when the parent data source is
          // known; gracefully fall back to component name alone otherwise.
          const label = ds ? `${ds.name}: ${c.name}` : c.name;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.id)}
                className="text-medteal hover:text-lightteal text-left"
              >
                {label} <span className="text-lightteal/40">{c.id}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Mount the new sections inside the Technique branch**

In the Technique branch of `DetailPanel`, after the existing `{sw.length > 0 && <RelatedLinkSection ... />}` and before `<CoverageLayerInfo ... />`, add:

```tsx
        {(() => {
          const mitigations = data.getMitigationsForTechnique(technique.id);
          return mitigations.length > 0 ? (
            <MitigationSection mitigations={mitigations} onPick={setSelection} />
          ) : null;
        })()}
        {(() => {
          const components = data.getDataComponentsForTechnique(technique.id);
          return components.length > 0 ? (
            <DetectionSection
              components={components}
              getDataSource={data.getDataSource}
              onPick={setSelection}
            />
          ) : null;
        })()}
```

NOTE: the IIFE pattern is used rather than a hoisted `const` because the surrounding JSX already inlines counts (e.g. `subs.length > 0` checks). The IIFE keeps the variable scope local without restructuring the Technique branch. The implementer may refactor to hoisted `const`s in a follow-up cleanup if preferred — functionally identical.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- DetailPanel.test`
Expected: PASS — 4 new tests green plus all existing tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/components/attack/DetailPanel.tsx src/components/attack/__tests__/DetailPanel.test.tsx
git commit -m "feat(panel): add Mitigations and Detections sections on technique view

Each row is a focus button. Detections render as 'Data Source:
Component' so the parent category and the specific signal are both
visible. Sections omit themselves entirely when the count is zero,
matching the existing convention for groups / software sections."
```

---

## Task 16: Add Mitigation and DataComponent detail branches (TDD)

**Files:**
- Modify: `src/components/attack/DetailPanel.tsx`
- Modify: `src/components/attack/__tests__/DetailPanel.test.tsx`

- [ ] **Step 1: Append failing tests**

Add inside `describe('DetailPanel', ...)`:

```ts
  test('renders the mitigation detail branch with reverse-listed techniques', () => {
    render(
      <AttackProvider graph={graph} searchIndex={searchIndex} initialFocusId="M1041">
        <DetailPanel />
      </AttackProvider>,
    );
    expect(screen.getByText(/Encrypt Sensitive Information/)).toBeInTheDocument();
    expect(screen.getByText('M1041')).toBeInTheDocument();
    expect(screen.getByText(/Mitigates techniques/)).toBeInTheDocument();
    // M1041 is wired to T1566 and T1566.001 in the fixture.
    expect(screen.getByText(/Phishing/)).toBeInTheDocument();
    expect(screen.getByText(/Spearphishing Attachment/)).toBeInTheDocument();
  });

  test('mitigation panel links to MITRE mitigations URL', () => {
    render(
      <AttackProvider graph={graph} searchIndex={searchIndex} initialFocusId="M1041">
        <DetailPanel />
      </AttackProvider>,
    );
    const link = screen.getByRole('link', { name: /attack\.mitre\.org/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/mitigations/M1041'));
  });

  test('renders the data component detail branch with reverse-listed techniques', () => {
    render(
      <AttackProvider
        graph={graph}
        searchIndex={searchIndex}
        initialFocusId="DS0009-process-creation"
      >
        <DetailPanel />
      </AttackProvider>,
    );
    expect(screen.getByText(/Process Creation/)).toBeInTheDocument();
    expect(screen.getByText('DS0009-process-creation')).toBeInTheDocument();
    expect(screen.getByText(/Detects techniques/)).toBeInTheDocument();
    // process-creation is wired to T1059 and T1059.001 in the fixture.
    expect(screen.getByText(/Command and Scripting Interpreter/)).toBeInTheDocument();
    expect(screen.getByText(/PowerShell/)).toBeInTheDocument();
  });

  test('data component panel links to MITRE datasources URL of the parent source', () => {
    render(
      <AttackProvider
        graph={graph}
        searchIndex={searchIndex}
        initialFocusId="DS0009-process-creation"
      >
        <DetailPanel />
      </AttackProvider>,
    );
    const link = screen.getByRole('link', { name: /attack\.mitre\.org/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/datasources/DS0009'));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- DetailPanel.test`
Expected: FAIL — no mitigation or data-component branches yet.

- [ ] **Step 3: Add the two new branches**

In `src/components/attack/DetailPanel.tsx`, inside the `DetailPanel` function, add lookups near the existing ones:

```ts
  const mitigation = data.getMitigation(focusId);
  const dataComponent = data.getDataComponent(focusId);
```

Then add the two new branches above the existing Tactic branch (so the order is: technique, group, software, mitigation, dataComponent, tactic, null). Each branch is wholly new:

```tsx
  // --- Mitigation panel ---
  if (mitigation) {
    const techniques = data.getTechniquesForMitigation(mitigation.id);
    return (
      <div className="p-4 text-sm">
        <Header id={mitigation.id} name={mitigation.name} kind="Mitigation" onClose={close} />
        <Description id={mitigation.id} />
        {techniques.length > 0 && (
          <RelatedLinkSection
            title={`Mitigates techniques (${techniques.length})`}
            items={techniques}
            onPick={setSelection}
          />
        )}
        <MitreLink href={`${MITRE_BASE}/mitigations/${mitigation.id}`} />
      </div>
    );
  }

  // --- Data component panel ---
  if (dataComponent) {
    const techniques = data.getTechniquesForDataComponent(dataComponent.id);
    return (
      <div className="p-4 text-sm">
        <Header
          id={dataComponent.id}
          name={dataComponent.name}
          kind="Data Component"
          onClose={close}
        />
        <Description id={dataComponent.id} />
        {techniques.length > 0 && (
          <RelatedLinkSection
            title={`Detects techniques (${techniques.length})`}
            items={techniques}
            onPick={setSelection}
          />
        )}
        {/* Data components share their parent data source's MITRE page —
            there is no per-component URL on attack.mitre.org. */}
        <MitreLink href={`${MITRE_BASE}/datasources/${dataComponent.dataSourceId}`} />
      </div>
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- DetailPanel.test`
Expected: PASS — 4 new tests green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/attack/DetailPanel.tsx src/components/attack/__tests__/DetailPanel.test.tsx
git commit -m "feat(panel): add Mitigation and DataComponent detail branches

Clicking a mitigation or data component in a technique's panel now
opens its own focused view with reverse-listed techniques. Data
components share their parent data source's MITRE URL because the
MITRE site has no per-component page."
```

---

## Task 16b: MobileDetailSheet sanity test for new sections

**Files:**
- Modify: `src/components/attack/__tests__/MobileDetailSheet.test.tsx`

The spec calls for "one sanity assertion per new section" in `MobileDetailSheet.test.tsx`, trusting the parent `DetailPanel` tests for full coverage. This is a thin task — a single test that mounts `DetailPanel` inside the open sheet and confirms the new sections are reachable through the mobile wrapper.

- [ ] **Step 1: Extend the existing imports at the top of the file**

Replace the existing import block at the top of `src/components/attack/__tests__/MobileDetailSheet.test.tsx` with:

```ts
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobileDetailSheet from '../MobileDetailSheet';
import { AttackProvider } from '@/lib/attack/context';
import DetailPanel from '../DetailPanel';
import type { GraphData } from '@/lib/attack/types';
import fixture from '@/lib/attack/__tests__/fixtures/mini-graph.json';

const graph = fixture as GraphData;
```

- [ ] **Step 2: Append the sanity test**

Just inside the closing `});` of the existing `describe('MobileDetailSheet', ...)` block, add:

```ts
  // Sanity-only: with DetailPanel rendered inside the open sheet for a
  // focused technique, the new Mitigations and Detections sections must
  // be reachable. Full content coverage lives in DetailPanel.test.tsx.
  test('renders Mitigations and Detections sections when DetailPanel is mounted as children', () => {
    render(
      <MobileDetailSheet open={true} onClose={() => {}}>
        <AttackProvider graph={graph} searchIndex={{ entries: [] }} initialFocusId="T1059">
          <DetailPanel />
        </AttackProvider>
      </MobileDetailSheet>,
    );
    expect(screen.getByText(/Mitigations \(/)).toBeInTheDocument();
    expect(screen.getByText(/Detections \(/)).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the test**

Run: `npm test -- MobileDetailSheet.test`
Expected: all tests pass including the new sanity assertion.

- [ ] **Step 4: Commit**

```bash
git add src/components/attack/__tests__/MobileDetailSheet.test.tsx
git commit -m "test(mobile-sheet): sanity assertion that new panel sections render"
```

---

## Task 17: Add minimum-query-length guard to description matching (TDD)

**Files:**
- Modify: `src/lib/attack/search.ts`
- Modify: `src/lib/attack/__tests__/search.test.ts`

The existing `search.ts` already implements two-tier scoring (description matches score 20, well below name/alias tiers of 40-90). The only behaviour change needed is to prevent very short queries (1-2 characters) from matching descriptions, which would flood results with hits for common short words.

- [ ] **Step 1: Append failing tests to `search.test.ts`**

Add inside `describe('lib/attack/search', ...)`:

```ts
  test('short queries (<3 chars) do not match against descriptions', () => {
    const onlyDescriptionMatch: SearchIndex = {
      entries: [
        {
          id: 'T9000',
          type: 'technique',
          name: 'Unrelated',
          aliases: [],
          // "of" appears in many descriptions; the query "of" should NOT
          // surface this technique through the description tier.
          description: 'A description that mentions of and the and an.',
        },
      ],
    };
    expect(search('of', onlyDescriptionMatch)).toEqual([]);
  });

  test('three-character queries still match descriptions', () => {
    const idx: SearchIndex = {
      entries: [
        {
          id: 'T9001',
          type: 'technique',
          name: 'Unrelated',
          aliases: [],
          description: 'A description mentioning powershell explicitly.',
        },
      ],
    };
    const results = search('pow', idx);
    expect(results.map(r => r.id)).toContain('T9001');
  });
```

- [ ] **Step 2: Run tests to verify the first fails**

Run: `npm test -- search.test`
Expected: FAIL on the first new test — the current code returns a description match for "of".

- [ ] **Step 3: Add the minimum-length guard in `src/lib/attack/search.ts`**

Find the existing description-tier line:

```ts
    } else if (description.includes(q)) {
      // Lowest priority: query appears in the description text.
      score = Math.max(score, SCORE_SUBSTRING_DESCRIPTION);
    }
```

Replace with:

```ts
    } else if (q.length >= 3 && description.includes(q)) {
      // Lowest priority: query appears in the description text.
      // Require >=3 chars to prevent common short words like "of", "the",
      // "in" from flooding the result list with low-value description hits.
      score = Math.max(score, SCORE_SUBSTRING_DESCRIPTION);
    }
```

- [ ] **Step 4: Run tests to verify both pass**

Run: `npm test -- search.test`
Expected: PASS — both new tests green plus all existing tests still green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/attack/search.ts src/lib/attack/__tests__/search.test.ts
git commit -m "feat(search): require 3+ chars before description matches

Prevents single- and double-letter queries from flooding results
through the description tier. Existing two-tier scoring already
prevents the more common 'many name matches' flood; this guard
addresses the inverse case of 'short common word, many description
matches'."
```

---

## Task 18: Type-check and full test pass

**Files:** none

A consolidation step before the manual verification phase. No code change; if either step fails, the issue must be fixed before continuing.

- [ ] **Step 1: Run type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: every suite passes.

- [ ] **Step 3: Run the production build to catch any Vite-specific issues**

Run: `npm run build`
Expected: builds successfully. The `dist/` directory contains the production bundle.

If any of the three above fails, stop and fix before continuing to manual verification.

---

## Task 19: Run the fetcher locally to refresh `public/data/`

**Files (output):**
- `public/data/attack-graph.json`
- `public/data/attack-index.json`
- `public/data/attack-descriptions.json`

This is a HUMAN-IN-THE-LOOP step: the fetcher hits the live MITRE GitHub repo. A future agent without network access cannot execute it; in that case, defer to the user.

- [ ] **Step 1: Run the fetcher**

Run: `npm run fetch-attack-data`
Expected: console output ending with something like:
```
Wrote .../public/data/attack-graph.json
  tactics: 14
  techniques: 600+ (300+ sub-techniques)
  groups: 100+
  software: 600+
Wrote .../public/data/attack-index.json (1300+ entries)
Wrote .../public/data/attack-descriptions.json (1300+ entries)
  mitigations: ~40
  data sources: ~40
  data components: ~100
```

- [ ] **Step 2: Sanity-check the descriptions file**

Run:
```bash
node -e "const d = require('./public/data/attack-descriptions.json'); console.log('keys:', Object.keys(d).length); console.log('T1059.001 head:', (d['T1059.001'] || '').slice(0, 120));"
```
Expected: `keys: 1300+`, and the T1059.001 head should contain "PowerShell" prose (the description should match what `attack.mitre.org/techniques/T1059/001` shows, minus citations).

- [ ] **Step 3: Sanity-check the graph file**

Run:
```bash
node -e "const g = require('./public/data/attack-graph.json'); const t = g.techniques.find(x => x.id === 'T1059.001'); console.log(t);"
```
Expected: T1059.001 has non-empty `mitigationIds` and `dataComponentIds` arrays.

- [ ] **Step 4: Commit the refreshed data**

```bash
git add public/data/attack-graph.json public/data/attack-index.json public/data/attack-descriptions.json
git commit -m "data: refresh ATT&CK data with mitigations, data components, and descriptions

First output of the extended fetcher. attack-descriptions.json is a
new file. attack-graph.json now carries the new top-level entity
arrays and per-technique mitigation/data-component IDs. The search
index entries now have truncated descriptions populated."
```

---

## Task 20: Manual verification in the browser

**Files:** none

Run the app and click through the new flows. Stop and fix any failure before declaring done. No commits expected.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serves on `http://localhost:5173` (or the port Vite reports).

- [ ] **Step 2: Verify first-paint timing is preserved**

Open the app in a fresh browser tab with DevTools Network panel open. Confirm:
- The "Loading ATT&CK data..." splash dismisses on the resolution of `attack-graph.json` + `attack-index.json`. The descriptions fetch can land before, after, or roughly simultaneously — that's fine.
- The Scene chunk loads as a separate request.
- `attack-descriptions.json` is requested in parallel and either resolves cleanly or fails silently (no error UI).

- [ ] **Step 3: Click T1059.001 (PowerShell) on the canvas**

Confirm in the right-side panel:
- Description prose visible above Platforms.
- "Show more" toggle visible (descriptions for top techniques are usually >400 chars).
- Mitigations section appears with at least one mitigation listed by name + ID.
- Detections section appears with entries in `Data Source: Component` format (e.g. "Process: Process Creation").
- Description text matches `https://attack.mitre.org/techniques/T1059/001` modulo whitespace and citation stripping.

- [ ] **Step 4: Click a mitigation in the Mitigations section**

Confirm:
- Panel switches to the mitigation detail view.
- "Mitigates techniques (N)" section lists techniques.
- "Open on attack.mitre.org" link goes to `/mitigations/<id>`.

- [ ] **Step 5: Click a data component in the Detections section**

Confirm:
- Panel switches to the data component detail view.
- "Detects techniques (N)" section lists techniques.
- Link goes to `/datasources/<parentDataSourceId>` (NOT a per-component URL).

- [ ] **Step 6: Mobile-viewport flow**

Resize the browser to phone width (or use DevTools device emulation). Confirm:
- Bottom sheet renders the same content as the desktop panel.
- Sheet scrolls when content is taller than 60vh.
- "Show more" works inside the sheet.

- [ ] **Step 7: Simulate descriptions 404**

Stop the dev server. Rename `public/data/attack-descriptions.json` to `attack-descriptions.json.disabled` and restart `npm run dev`. Confirm:
- App loads normally with no error banner.
- Every entity's panel shows "No description available." in place of prose.
- Mitigations and Detections sections still render (they don't depend on descriptions).

After verifying, rename the file back: `mv public/data/attack-descriptions.json.disabled public/data/attack-descriptions.json`.

- [ ] **Step 8: Stop the dev server. Implementation complete.**

If any step in Task 20 fails, return to the relevant earlier task to fix and re-run Tasks 18, 19 (if data needs regen), and 20.

---

## Spec coverage check

Cross-reference each spec section against the tasks:

| Spec section | Tasks |
|---|---|
| §Problem | All — context for the whole effort |
| §Goals | All |
| §Non-Goals — no 3D viz, no filter dims, no markdown, no badge, no E2E | Honoured throughout |
| §Architecture — Data pipeline (new entity collections, relationship passes, citation strip, output files) | Tasks 4-10, 19 |
| §Architecture — Types (Mitigation, DataSource, DataComponent, DescriptionMap, Technique extensions, GraphData extensions) | Task 1 |
| §Architecture — DataLayer (six new accessors) | Task 11 |
| §Architecture — Context (descriptions slot, useDescription) | Task 12 |
| §Architecture — Delivery (parallel fetch, soft-fail) | Task 13 |
| §Architecture — Detail panel (Description sub-component, Mitigations section, Detections section, new branches, mobile sheet inheritance) | Tasks 14-16 |
| §Architecture — InfoPanel legend (deferred) | Honoured — no legend changes |
| §Architecture — Search ranking (two-tier already exists; add min-length guard) | Task 17 |
| §Architecture — Search index (truncated descriptions populated) | Task 10 step 11 |
| §Testing — Extended unit tests (data, search, fixture) | Tasks 2, 11, 17 |
| §Testing — Extended component tests (DetailPanel, MobileDetailSheet) | Tasks 14-16 (DetailPanel) and Task 16b (MobileDetailSheet single sanity assertion). |
| §Testing — New fetcher.test.ts | Tasks 5-9 |
| §Testing — New descriptions.test.ts | Task 12 |
| §Testing — Out of scope (R3F, mocked App fetch, E2E) | Honoured |
| §Testing — Manual verification before declaring done | Tasks 19-20 |
| §Phase 2 (deferred) | Honoured — not implemented |
