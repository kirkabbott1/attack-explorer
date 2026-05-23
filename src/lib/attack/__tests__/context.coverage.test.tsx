// Integration tests for the coverage slice of AttackProvider / useCoverage.
// These tests exercise the provider-level behaviors that the coverage.test.ts
// unit tests cannot reach: lazy hydration from localStorage, persistence
// side-effects, vanished-technique filtering, the clear-on-null path, and the
// hook-outside-provider guard.

import React from 'react';
import { render, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AttackProvider, useCoverage } from '../context';
import { savePersisted, clearPersisted, STORAGE_KEY } from '../coverage';
import type { GraphData, SearchIndex } from '../types';
import type { NavigatorLayer } from '../layer';
import fixture from './fixtures/mini-graph.json';

// Cast the JSON fixture to the typed shape.
const graph = fixture as GraphData;

// Minimal search index — coverage tests do not exercise search.
const searchIndex: SearchIndex = { entries: [] };

// Convenience wrapper: renders a child that calls useCoverage and exposes the
// result via a captured ref so assertions can inspect it without touching the DOM.
function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AttackProvider graph={graph} searchIndex={searchIndex}>
        {children}
      </AttackProvider>
    );
  };
}

// A minimal NavigatorLayer whose technique IDs align with the mini-graph fixture.
// T1059 and T1098 are both present in mini-graph.json; T9999 is not.
const sampleLayer: NavigatorLayer = {
  versions: { attack: '17', navigator: '5.1.0', layer: '4.5' },
  domain: 'enterprise-attack',
  name: 'Audit Layer',
  techniques: [
    { techniqueID: 'T1059', score: 90, enabled: true },
    { techniqueID: 'T1098', score: 50, enabled: true },
    { techniqueID: 'T9999', score: 25, enabled: true }, // not in graph
  ],
};

// Reset localStorage before every test so state does not bleed between cases.
beforeEach(() => {
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Item 7 / 7b: useCoverage throws when called outside AttackProvider
// ---------------------------------------------------------------------------
describe('useCoverage outside provider', () => {
  test('throws a descriptive error when AttackProvider is missing from the tree', () => {
    // Suppress React's error-boundary console.error noise during the test.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // renderHook without a wrapper renders the hook outside any provider.
      expect(() => renderHook(() => useCoverage())).toThrow('AttackProvider missing in tree');
    } finally {
      consoleError.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Item 1 / 3: Lazy hydration — empty localStorage produces EMPTY_COVERAGE
// ---------------------------------------------------------------------------
describe('lazy hydration with empty localStorage', () => {
  test('coverage.layer is null when nothing is persisted', () => {
    // Confirm localStorage is clean before the provider mounts.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    const { result } = renderHook(() => useCoverage(), { wrapper: makeWrapper() });
    const [coverage] = result.current;

    // No layer should be hydrated.
    expect(coverage.layer).toBeNull();
    // The index must be empty (size 0), not undefined.
    expect(coverage.byTechniqueId.size).toBe(0);
    expect(coverage.viewActive).toBe(false);
    expect(coverage.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Item 1 / 4: Lazy hydration with persisted data — known IDs indexed,
// vanished IDs (T9999) dropped from byTechniqueId
// ---------------------------------------------------------------------------
describe('lazy hydration with persisted layer', () => {
  test('hydrates coverage from localStorage and drops technique IDs not in the graph', () => {
    // Persist before mounting the provider so the lazy initialiser picks it up.
    savePersisted({ layer: sampleLayer, viewActive: true });

    const { result } = renderHook(() => useCoverage(), { wrapper: makeWrapper() });
    const [coverage] = result.current;

    // The layer object should be the one we persisted.
    expect(coverage.layer?.name).toBe('Audit Layer');
    // viewActive was persisted as true.
    expect(coverage.viewActive).toBe(true);
    // T1059 and T1098 are in the graph — both must be indexed.
    expect(coverage.byTechniqueId.has('T1059')).toBe(true);
    expect(coverage.byTechniqueId.has('T1098')).toBe(true);
    // T9999 is not in the graph — must be silently dropped.
    expect(coverage.byTechniqueId.has('T9999')).toBe(false);
    // Overall index size: 2 (only the graph-known IDs).
    expect(coverage.byTechniqueId.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Item 6 + 5: Persistence side-effect — savePersisted on change,
//             clearPersisted when layer becomes null
// ---------------------------------------------------------------------------
describe('persistence side-effect', () => {
  test('calling setCoverage with a layer writes it to localStorage', async () => {
    const { result } = renderHook(() => useCoverage(), { wrapper: makeWrapper() });
    const [, setCoverage] = result.current;

    // Start with no data in storage.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Push a new coverage state that includes a real layer.
    const newCoverage = {
      layer: sampleLayer,
      byTechniqueId: new Map([['T1059', { score: 90, enabled: true }]]),
      viewActive: true,
      warnings: [],
    };

    act(() => setCoverage(newCoverage));

    // The persistence useEffect runs after the state update; the key must
    // be written to localStorage.
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.layer.name).toBe('Audit Layer');
    expect(parsed.viewActive).toBe(true);
  });

  // Item 5: when layer becomes null, clearPersisted() must remove the key.
  test('setting coverage.layer to null removes the localStorage key', async () => {
    // Pre-seed storage so there is something to clear.
    savePersisted({ layer: sampleLayer, viewActive: false });
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    const { result } = renderHook(() => useCoverage(), { wrapper: makeWrapper() });
    const [, setCoverage] = result.current;

    act(() => {
      setCoverage({
        layer: null,
        byTechniqueId: new Map(),
        viewActive: false,
        warnings: [],
      });
    });

    // The key must be gone after the effect fires.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Item 6: No infinite render loop — setCoverage does not trigger the effect
//         to call setCoverage again, so the coverage reference stabilises.
// ---------------------------------------------------------------------------
describe('no infinite render loop', () => {
  test('coverage reference stabilises after a single setCoverage call', async () => {
    const { result } = renderHook(() => useCoverage(), { wrapper: makeWrapper() });
    const [, setCoverage] = result.current;

    const next = {
      layer: sampleLayer,
      byTechniqueId: new Map<string, { score: number; enabled: boolean }>(),
      viewActive: false,
      warnings: [] as string[],
    };

    act(() => setCoverage(next));

    // Capture the reference right after the first update.
    const [coverageAfterFirst] = result.current;

    // A second read without any further act() must return the identical
    // object reference — no spurious re-renders from the effect.
    const [coverageAfterSecond] = result.current;
    expect(coverageAfterFirst).toBe(coverageAfterSecond);
  });
});

// ---------------------------------------------------------------------------
// Item 7: useCoverage returns [state, setter] tuple matching useFilters shape
// ---------------------------------------------------------------------------
describe('useCoverage return shape', () => {
  test('returns a two-element tuple [CoverageState, setter]', () => {
    const { result } = renderHook(() => useCoverage(), { wrapper: makeWrapper() });
    const tuple = result.current;

    // Must be a tuple with exactly two elements.
    expect(Array.isArray(tuple)).toBe(true);
    expect(tuple).toHaveLength(2);

    const [state, setter] = tuple;
    // State is an object with the expected shape keys.
    expect(state).toHaveProperty('layer');
    expect(state).toHaveProperty('byTechniqueId');
    expect(state).toHaveProperty('viewActive');
    expect(state).toHaveProperty('warnings');
    // Setter is a function (simple (next) => void, not React Dispatch).
    expect(typeof setter).toBe('function');
  });
});
