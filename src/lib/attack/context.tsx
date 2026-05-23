// React context provider for the MITRE ATT&CK 3D Explorer.
// Centralises graph data, layout positions, filter state, focus/hover state,
// and exposes granular hooks so components only subscribe to what they need.

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { createDataLayer, type DataLayer } from './data';
import { computeLayout } from './layout';
import {
  EMPTY_FILTERS,
  EMPTY_COVERAGE,
  type GraphData,
  type SearchIndex,
  type FilterState,
  type Vec3,
  type CoverageState,
} from './types';
import {
  buildCoverageIndex,
  loadPersisted,
  savePersisted,
  clearPersisted,
} from './coverage';

// --- Context shape ---
// All fields the context exposes to consumers. Null default forces the context
// to be consumed inside a provider (enforced by the useCtx helper below).
interface AttackContextValue {
  data: DataLayer;
  searchIndex: SearchIndex;
  // Map from node ID (tactic/technique/group/software) to its 3D world position.
  positions: Map<string, Vec3>;
  filters: FilterState;
  setFilters: (next: FilterState) => void;
  // ID of the node whose detail panel is open, or null when nothing is focused.
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  // ID of the node currently under the pointer, or null.
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  // Navigator-layer coverage state — layer, per-technique index, and view toggle.
  coverage: CoverageState;
  setCoverage: (next: CoverageState) => void;
}

// Use null as the default so useCtx can detect "provider missing" at runtime.
const AttackContext = createContext<AttackContextValue | null>(null);

// --- Provider ---
interface ProviderProps {
  // Parsed ATT&CK graph (loaded server-side via getStaticProps or equivalent).
  graph: GraphData;
  // Full-text search index (loaded alongside the graph).
  searchIndex: SearchIndex;
  // Optional initial state — allows URL params to hydrate the context on first render.
  initialFilters?: FilterState;
  initialFocusId?: string | null;
  // Callback invoked whenever filters or focusId change — used by the page to
  // sync state back to the URL query string without coupling context to routing.
  onStateChange?: (filters: FilterState, focusId: string | null) => void;
  children: ReactNode;
}

export function AttackProvider({
  graph,
  searchIndex,
  initialFilters = EMPTY_FILTERS,
  initialFocusId = null,
  onStateChange,
  children,
}: ProviderProps) {
  // Data layer and layout positions are expensive to build but stable for the
  // lifetime of a single graph version — memoize on graph object identity so
  // they only rebuild when the caller passes a new graph reference.
  const data = useMemo(() => createDataLayer(graph), [graph]);
  const positions = useMemo(() => computeLayout(graph), [graph]);

  // Mutable UI state: filters, focused node id, and hovered node id.
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [focusId, setFocusId] = useState<string | null>(initialFocusId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Hydrate coverage from localStorage on mount; the index is rebuilt from the
  // current graph so technique IDs that vanished between sessions are dropped.
  const [coverage, setCoverage] = useState<CoverageState>(() => {
    const persisted = loadPersisted();
    if (!persisted) return EMPTY_COVERAGE;
    const graphTechniqueIds = new Set(graph.techniques.map(t => t.id));
    const byTechniqueId = buildCoverageIndex(persisted.layer, graphTechniqueIds);
    return {
      layer: persisted.layer,
      byTechniqueId,
      viewActive: persisted.viewActive,
      warnings: [],
    };
  });

  // Persist on every change. Clearing (layer === null) removes the storage key.
  useEffect(() => {
    if (coverage.layer === null) {
      clearPersisted();
      return;
    }
    savePersisted({ layer: coverage.layer, viewActive: coverage.viewActive });
  }, [coverage]);

  // Notify the parent page whenever filters or focusId change so it can push
  // updates to the URL without the context needing to know about the router.
  useEffect(() => {
    onStateChange?.(filters, focusId);
  }, [filters, focusId, onStateChange]);

  // Build the stable context value object. We intentionally do not memoize this
  // because it contains state setters (stable references) and the state values
  // themselves, so React's own bailout logic handles unnecessary re-renders.
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
  };

  return <AttackContext.Provider value={value}>{children}</AttackContext.Provider>;
}

// --- Internal helper ---
// Throws a descriptive error when a hook is used outside the provider tree.
function useCtx(): AttackContextValue {
  const ctx = useContext(AttackContext);
  if (!ctx) throw new Error('AttackProvider missing in tree');
  return ctx;
}

// --- Public hooks ---
// Each hook exposes only the slice of context the caller needs.
// Naming mirrors the domain concept, not the raw state field.

/** Returns the DataLayer accessor (O(1) lookups for tactics, techniques, groups, software). */
export function useGraph(): DataLayer {
  return useCtx().data;
}

/** Returns the Map from node ID to Vec3 world position computed by computeLayout. */
export function usePositions(): Map<string, Vec3> {
  return useCtx().positions;
}

/** Returns the full-text SearchIndex for command-palette / search functionality. */
export function useSearchIndex(): SearchIndex {
  return useCtx().searchIndex;
}

/** Returns current filter state and a setter. Destructure as [filters, setFilters]. */
export function useFilters(): [FilterState, (next: FilterState) => void] {
  const ctx = useCtx();
  return [ctx.filters, ctx.setFilters];
}

/**
 * Returns [focusId, setFocusId].
 * focusId is the node ID whose detail panel is open, or null when nothing is selected.
 */
export function useSelection(): [string | null, (id: string | null) => void] {
  const ctx = useCtx();
  return [ctx.focusId, ctx.setFocusId];
}

/**
 * Returns [hoveredId, setHoveredId].
 * hoveredId is the node ID currently under the pointer, or null.
 */
export function useHover(): [string | null, (id: string | null) => void] {
  const ctx = useCtx();
  return [ctx.hoveredId, ctx.setHoveredId];
}

/** Returns [coverage, setCoverage]. Mirrors useFilters / useSelection shape. */
export function useCoverage(): [CoverageState, (next: CoverageState) => void] {
  const ctx = useCtx();
  return [ctx.coverage, ctx.setCoverage];
}
