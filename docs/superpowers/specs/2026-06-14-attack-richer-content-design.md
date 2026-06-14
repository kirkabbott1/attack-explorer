# Richer ATT&CK Content in the Detail Panel — Design Spec

Date: 2026-06-14
Status: Approved, awaiting implementation plan

## Problem

When a user clicks a node in the ATT&CK 3D Explorer the right-side `DetailPanel`
(`src/components/attack/DetailPanel.tsx`) currently shows: name, ID, platforms,
parent/sub-technique links, groups-using, software-using, an optional coverage
layer entry, and an outbound MITRE link. There is **no description text**, **no
mitigations**, and **no detections / data sources**.

This leaves a meaningful content gap for the analyst use case. Two specific
shortfalls:

1. **Descriptions exist on every STIX object** but the fetch script at
   `scripts/fetch-attack-data.ts` does not carry the `description` field
   through onto `Technique`, `Group`, or `Software`. The search index entry
   type (`src/lib/attack/types.ts:46`) even declares a required
   `description: string` field — and every entry ships with `description: ''`.
   The type is a quiet false promise; ranking gets zero signal from it.
2. **Mitigations and data sources are not fetched at all.** The current
   fetcher filters STIX into four entity types (`x-mitre-tactic`,
   `attack-pattern`, `intrusion-set`, `malware`/`tool`) and keeps only
   relationships of type `uses`. The `course-of-action` (mitigations),
   `x-mitre-data-source`, and `x-mitre-data-component` objects are dropped,
   along with their `mitigates` and `detects` relationships.

The panel therefore answers "what is this technique" only at the structural
level ("who uses it, what software implements it") and never the analyst's
actual questions: *what does this do, what stops it, how do I detect it.*

## Goals

- Detail panel renders descriptions for techniques, groups, software, tactics,
  mitigations, and data components.
- Detail panel renders **Mitigations** and **Detections** sections on the
  technique view, each item clickable as a focus target.
- Mitigations and data components are first-class focus targets: clicking one
  opens its own detail view with the reverse-listed techniques.
- Search ranking uses descriptions, without flooding common-word queries.
- Desktop UX is pixel-identical to today on every screen except the panel.
- Mobile UX inherits all of the above through the existing
  `MobileDetailSheet` wrapper with no separate code path.
- First-paint latency is unchanged. The descriptions payload is allowed to
  arrive after the splash dismisses.

## Non-Goals

- 3D scene representation of mitigations or data components (deferred to a
  Phase 2 spec).
- New filter dimensions for mitigations or data sources (deferred to a
  Phase 2 spec).
- Markdown rendering inside descriptions (bold/italic/links). Phase 1 ships
  `whitespace-pre-line` plain text with citation markers stripped.
- "Matched in description" indicators on search results. The two-tier ordering
  carries the meaning.
- Match highlighting / snippet extraction in search results. Separate spec.
- Network-level fetch tests in jsdom. The fetch wiring is small enough that
  manual verification is more honest than mock-asserts-on-mock.
- End-to-end / Playwright tests. None exist today; out of scope.

## Architecture

### Data pipeline (`scripts/fetch-attack-data.ts`)

Extend the existing single-pass STIX transform with two new entity collections
and two new relationship passes. Existing logic for tactics, attack-patterns,
intrusion-sets, malware/tool, and `uses` relationships is unchanged.

**New entity collections:**

| STIX type | Output entity | Approximate count |
|---|---|---|
| `course-of-action` | `Mitigation { id, name }` | ~40 |
| `x-mitre-data-source` | `DataSource { id, name }` | ~40 |
| `x-mitre-data-component` | `DataComponent { id, name, dataSourceId }` | ~100 |

Data component IDs require care because they become URL-shareable focus
targets and must remain stable across monthly data refreshes. The fetcher
prefers a real `external_id` from the STIX object's `external_references`
(present on newer ATT&CK releases). Falls back to a deterministic synthetic
ID formed from the parent data source ID plus the data component's name
sluggified: `DS0009-process-creation`. Name-derived (rather than
index-derived) so that adding a new data component to MITRE's data does not
shift the IDs of every other component and break shared URLs.

**New relationship passes:**

The current relationship loop filters for `relationship_type === 'uses'`. We
extend it to also collect:

- `mitigates`: source = `course-of-action`, target = `attack-pattern`
  - Builds `mitigationIdsByTechnique: Map<techniqueId, mitigationId[]>`
- `detects`: source = `x-mitre-data-component`, target = `attack-pattern`
  - Builds `dataComponentIdsByTechnique: Map<techniqueId, dataComponentId[]>`

Both new passes use the same `stixIdToAttackId` map already built for the
`uses` pass.

**Citation stripping** happens at build time, once, applied uniformly to every
description field on every entity. The regex `/\(Citation:[^)]*\)/g` plus a
whitespace collapse, run in the fetcher. Runtime code never sees citation
markers and never runs regex on descriptions.

**Output files:**

| File | Today | After |
|---|---|---|
| `public/data/attack-graph.json` | tactics, techniques, groups, software | adds `mitigations`, `dataSources`, `dataComponents` arrays plus `mitigationIds` and `dataComponentIds` on each technique. No descriptions. Expected size ~150 KB raw / ~35 KB gzipped. |
| `public/data/attack-index.json` | flat entries with `description: ''` | descriptions actually populated, truncated to ~200 chars at the last word boundary, citations stripped. Expected size ~250 KB raw / ~70 KB gzipped. |
| `public/data/attack-descriptions.json` | does not exist | new file: `Record<string, string>` mapping entity ID to full description (citation-stripped, no truncation). Expected size ~1.5 MB raw / ~400 KB gzipped. |

### Types (`src/lib/attack/types.ts`)

Three new entity interfaces, two new ID fields on `Technique`, one new
top-level structure, one new top-level alias:

```ts
export interface Mitigation {
  id: string;
  name: string;
}

export interface DataSource {
  id: string;
  name: string;
}

export interface DataComponent {
  id: string;
  name: string;
  dataSourceId: string;
}

export interface Technique {
  // ...existing fields unchanged...
  mitigationIds: string[];
  dataComponentIds: string[];
}

export interface GraphData {
  // ...existing fields unchanged...
  mitigations: Mitigation[];
  dataSources: DataSource[];
  dataComponents: DataComponent[];
}

export type DescriptionMap = Record<string, string>;
```

Descriptions are intentionally NOT on the entity types. They live in a
parallel `DescriptionMap` exposed via context. This keeps every entity
"whole" even when the descriptions file is loading or has failed to load,
and keeps `DataLayer` a pure function of `GraphData`.

### DataLayer (`src/lib/attack/data.ts`)

Six new O(1) accessors built on Maps constructed once at provider
construction:

```ts
getMitigation(id: string): Mitigation | undefined
getDataSource(id: string): DataSource | undefined
getDataComponent(id: string): DataComponent | undefined
getMitigationsForTechnique(id: string): Mitigation[]
getDataComponentsForTechnique(id: string): DataComponent[]
getTechniquesForMitigation(id: string): Technique[]
getTechniquesForDataComponent(id: string): Technique[]
```

The forward maps come straight from the new fetcher passes. The reverse maps
(`getTechniquesForMitigation`, `getTechniquesForDataComponent`) are built
once at construction time by iterating techniques' `mitigationIds` /
`dataComponentIds` arrays. No code today touches the indexed-Map pattern in
`data.ts`; the new accessors follow it.

### Context (`src/lib/attack/context.tsx`)

One new context state slot and one new hook:

```ts
// New context state slot
descriptions: DescriptionMap | null  // null until the second fetch resolves

// New hook
useDescription(id: string): string | null
// Returns the description if loaded, null in two cases:
//   (a) descriptions map hasn't arrived yet
//   (b) the entity has no description in MITRE's data
// The panel renders the same "No description available." line for both cases.
```

The decision to NOT distinguish "loading" from "absent" is deliberate: the
visible difference is at most a few hundred ms of fade-in, and threading a
separate `descriptionsLoaded` boolean through the panel would add real
complexity for a negligible UX win.

`AttackProvider` accepts a new optional prop `descriptions: DescriptionMap | null`
(default `null`). Provider exposes it via `useDescription`.

### Delivery (`src/App.tsx`)

The current `useEffect` runs one `Promise.all([graph, index])` and calls
`setLoaded` when both resolve. We add a parallel, independent fetch for
descriptions that does NOT block `setLoaded`:

```ts
useEffect(() => {
  Promise.all([
    fetch('/data/attack-graph.json').then(r => r.json()),
    fetch('/data/attack-index.json').then(r => r.json()),
  ])
    .then(([graph, searchIndex]) => setLoaded({ graph, searchIndex }))
    .catch(err => setError(String(err)));

  // Fire-and-forget. Soft-fail to empty map on any error.
  fetch('/data/attack-descriptions.json')
    .then(r => r.json())
    .then((map: DescriptionMap) => setDescriptions(map))
    .catch(() => setDescriptions({}));
}, []);
```

**Soft-fail posture is deliberate.** Descriptions are additive; if the file
404s, is malformed, or the network drops it, the app keeps every capability
it has today. No error banner. The detail panel renders "No description
available." everywhere — the same state as the first ~300ms of any load.

This preserves the existing first-paint contract: the splash dismisses on
graph + index, exactly as today. The Scene lazy-load chunk and the
descriptions fetch race; whichever wins, the user sees a usable scene first.

### Detail panel rendering (`src/components/attack/DetailPanel.tsx`)

#### Technique view — three new sections in this order

```
Header                              [existing]
Description                         [NEW]
Platforms                           [existing]
Parent technique                    [existing]
Sub-techniques                      [existing]
Used by groups                      [existing]
Implemented in software             [existing]
Mitigations (N)                     [NEW]
Detections (N)                      [NEW]
Coverage layer                      [existing]
Open on attack.mitre.org            [existing]
```

#### Other entity views

- **Group, Software, Tactic:** add Description section immediately after the
  Header. No mitigation/detection sections (those relate to techniques only).
- **Mitigation (new branch):** Header, Description, "Mitigates techniques
  (N)" reverse-link section, MITRE link to `/mitigations/<id>`.
- **DataComponent (new branch):** Header, Description, "Detects techniques
  (N)" reverse-link section, MITRE link to `/datasources/<parentDataSourceId>`
  (data components share their parent data source's URL on attack.mitre.org).

#### New sub-components (same file)

- `Description({ id })` — calls `useDescription(id)`, renders muted "No
  description available." when null, renders prose with `whitespace-pre-line`
  when loaded. Adds a "Show more" / "Show less" toggle when text exceeds 400
  characters; truncated text shows the first 400 chars trimmed to a word
  boundary plus an ellipsis.
- `MitigationSection({ mitigations, onPick })` — renders each mitigation as a
  clickable name + ID with a one-line preview (first ~80 chars of its
  description) underneath.
- `DetectionSection({ components, getDataSource, onPick })` — renders each
  data component as `<DataSourceName>: <ComponentName>` for readability,
  with the same one-line preview pattern as mitigations.

#### Mobile sheet

`MobileDetailSheet` already renders `DetailPanel` content directly and the
sheet body already scrolls. No changes required. The "Show more" expand
naturally helps on small screens.

#### InfoPanel legend

**No changes in Phase 1.** Adding legend rows for entities that have no 3D
representation would be confusing. Deferred to the Phase 2 visualisation
spec, where mitigations and data components get real shape representations.

### Search ranking (`src/lib/attack/search.ts`)

Today's ranking scores name / ID / alias matches. We add description matches
as a strictly lower tier with a hard cap to prevent common-word flood.

**Two-pass approach:**

1. **Pass 1 — name / alias / ID matches**, ranked by existing weights. Results
   are accumulated up to `MAX_RESULTS` (e.g. 20).
2. **Pass 2 — description-only matches**, appended to the result list only
   if the cap has not been reached. Sorted alphabetically by name for
   stability.

A description match is defined as the query token (case-insensitive,
substring) being present in the entity's truncated description in the search
index. The truncation lives at build time; the runtime matcher does plain
substring on the already-prepared string.

**Result:** searching "powershell" returns T1059.001 PowerShell at the top
(name hit) and also surfaces techniques whose descriptions discuss PowerShell
at the bottom, never overflowing the name-tier with low-quality matches.

**No UI change to `SearchBox`** in Phase 1. No "matched in description" badge.

### Search index (`scripts/fetch-attack-data.ts`)

The search index already has a `description` field per entry that is always
`''`. We populate it with the **truncated** description (first ~200
characters, word-boundary trimmed, citations stripped) for techniques,
groups, and software. Full text remains in `attack-descriptions.json`.

```ts
// In the fetcher:
function truncateForSearch(raw: string): string {
  const stripped = raw.replace(/\(Citation:[^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (stripped.length <= 200) return stripped;
  const cut = stripped.slice(0, 200);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 100 ? cut.slice(0, lastSpace) : cut;
}
```

## Testing

Coverage follows the existing project asymmetry: pure logic and DOM
components get tests, R3F components do not.

### Extended unit tests

- **`src/lib/attack/__tests__/data.test.ts`** — coverage for the six new
  accessors, empty cases (entity with zero mitigations), reverse-lookup
  symmetry.
- **`src/lib/attack/__tests__/search.test.ts`** — description matches feed
  ranking; common-word flood is capped at `MAX_RESULTS`; name-tier hits
  always rank above description-tier hits.
- **`src/lib/attack/__tests__/fixtures/mini-graph.json`** — add 2
  mitigations, 2 data sources, 3 data components, and populate
  `mitigationIds` / `dataComponentIds` on existing techniques in the
  fixture.

### Extended component tests

- **`src/components/attack/__tests__/DetailPanel.test.tsx`** — description
  renders when present; "Show more" toggles for long text; Mitigations and
  Detections sections appear with correct counts; Detections section renders
  the `Data Source: Component` format; clicking a mitigation calls
  `setSelection`; renders the Mitigation and DataComponent detail branches
  with reverse-listed techniques.
- **`src/components/attack/__tests__/MobileDetailSheet.test.tsx`** — one
  sanity assertion per new section. Trusts the parent component coverage.

### New test files

- **`fetcher.test.ts`** (NEW; final location to be picked by the
  implementation plan, following the project's existing `__tests__`
  convention) — unit tests for the citation-stripping regex, description
  truncation at word boundary, the `DataComponent.id` derivation (both
  `external_id` and slug fallback paths), and the new `mitigates` /
  `detects` relationship passes. Driven by a hand-rolled STIX fixture of
  5-10 objects. Does NOT hit the network. The current fetcher has zero
  tests; this is the highest-leverage new test in the spec.
- **`src/lib/attack/__tests__/descriptions.test.ts`** (NEW) — tests for
  `useDescription`: returns `null` when map is `null`, returns the string
  when present, returns `null` for unknown IDs.

### Out of scope for tests

- R3F scene tests. Nothing in this spec touches `Scene`, `TechniqueField`,
  `Edges`, or `CameraFocus`.
- Mocked fetch tests in `App.tsx`. The wiring is small; we rely on manual
  verification with a deliberate 404.
- End-to-end / Playwright tests. None in project today.

### Manual verification before declaring done

1. Run the fetcher locally against the live MITRE STIX bundle. Confirm:
   `mitigations.length > 0`, `dataSources.length > 0`, every technique has
   `mitigationIds` defined, `attack-descriptions.json` exists and has 1000+
   entries.
2. Cross-check a known technique (e.g. T1059.001 PowerShell) against
   `attack.mitre.org/techniques/T1059/001`: description text matches modulo
   whitespace and citation stripping, mitigation count matches, detection
   count matches.
3. Run the dev server. Click T1059.001. Confirm: description visible,
   Mitigations section shows entries with names, Detections section shows
   entries in the `Data Source: Component` format, clicking a mitigation
   opens its own detail view with reverse-listed techniques.
4. Mobile viewport: same flow in the bottom sheet, "Show more" works, sheet
   scrolls.
5. Deliberately rename `attack-descriptions.json` to simulate a 404: app
   loads as today, panel shows "No description available." on every entity,
   no error banner.

## Phase 2 (deferred, noted for context)

Out of scope for this spec but called out so a future plan inherits structure
cleanly:

- 3D scene representation of mitigations and data components as new
  instanced-mesh node types, with new edge types for `mitigates` and
  `detects`. Touches `Scene`, layout, draw-call budget, `cameraCoordinator`,
  and the InfoPanel legend.
- Filter dimensions for mitigations and data sources in `FilterSidebar`.
  Extends `FilterState`, the URL encoder, and `filter.ts`.
- Markdown rendering inside descriptions (bold / italic / links). Requires
  a sanitiser choice and renderer.
- Match highlighting in search results. Requires snippet extraction and
  layout work in `SearchBox`.
