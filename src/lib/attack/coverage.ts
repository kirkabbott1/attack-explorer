// Coverage state index + localStorage persistence.
// Pure module — no React. The AttackContext provider wires this into state.

import type { CoverageEntry } from './types';
import type { NavigatorLayer } from './layer';

/**
 * localStorage key for the persisted coverage layer. The `.v1` suffix lets a
 * future schema change discard old data cleanly by bumping to `.v2`.
 */
export const STORAGE_KEY = 'attack-explorer.coverage.v1';

/** Shape persisted to localStorage. */
export interface PersistedCoverage {
  layer: NavigatorLayer;
  viewActive: boolean;
}

/**
 * Build the per-technique-id index used by TechniqueField for O(1) lookup.
 * Filters out IDs not present in the current graph — those should not appear
 * on the scene.
 */
export function buildCoverageIndex(
  layer: NavigatorLayer,
  graphTechniqueIds: Set<string>,
): Map<string, CoverageEntry> {
  const map = new Map<string, CoverageEntry>();
  for (const t of layer.techniques) {
    if (!graphTechniqueIds.has(t.techniqueID)) continue;
    map.set(t.techniqueID, {
      score: t.score,
      color: t.color,
      comment: t.comment,
      enabled: t.enabled,
    });
  }
  return map;
}

/**
 * Read the persisted layer from localStorage. Returns null when:
 * - nothing is stored,
 * - the JSON is corrupt (the corrupt key is also cleared so it does not
 *   resurface on next load).
 */
export function loadPersisted(): PersistedCoverage | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage may be unavailable (private browsing in some browsers).
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'layer' in parsed &&
      'viewActive' in parsed
    ) {
      return parsed as PersistedCoverage;
    }
    // Shape mismatch — treat as corrupt.
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    // Corrupt JSON — discard the key.
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/**
 * Persist the given layer + viewActive flag. Quota and access errors are
 * swallowed — the in-memory state is the source of truth for the session.
 */
export function savePersisted(state: PersistedCoverage): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / access error — session state remains intact */
  }
}

/** Remove the persisted layer entirely. */
export function clearPersisted(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
