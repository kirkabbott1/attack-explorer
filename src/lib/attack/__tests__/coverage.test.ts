import {
  buildCoverageIndex,
  loadPersisted,
  savePersisted,
  clearPersisted,
  STORAGE_KEY,
} from '../coverage';
import type { NavigatorLayer } from '../layer';

const sampleLayer: NavigatorLayer = {
  versions: { attack: '17', navigator: '5.1.0', layer: '4.5' },
  domain: 'enterprise-attack',
  name: 'Sample',
  gradient: { colors: ['#ff6666', '#ffffff'], minValue: 0, maxValue: 100 },
  techniques: [
    { techniqueID: 'T1059', score: 100, enabled: true },
    { techniqueID: 'T1003', color: '#ff00ff', enabled: true, comment: 'hi' },
    { techniqueID: 'T9999', score: 25, enabled: true },
  ],
};

describe('buildCoverageIndex', () => {
  test('indexes known technique IDs only', () => {
    const index = buildCoverageIndex(sampleLayer, new Set(['T1059', 'T1003']));
    expect(index.size).toBe(2);
    expect(index.get('T1059')?.score).toBe(100);
    expect(index.get('T1003')?.color).toBe('#ff00ff');
    expect(index.has('T9999')).toBe(false);
  });

  test('preserves comments and enabled flags', () => {
    const index = buildCoverageIndex(sampleLayer, new Set(['T1003']));
    const entry = index.get('T1003')!;
    expect(entry.comment).toBe('hi');
    expect(entry.enabled).toBe(true);
  });

  test('returns an empty map when no IDs are known', () => {
    const index = buildCoverageIndex(sampleLayer, new Set());
    expect(index.size).toBe(0);
  });

  // 1. Idempotency — calling buildCoverageIndex twice on identical inputs must
  //    produce equal maps so callers can safely re-derive the index on re-render.
  test('is idempotent — two calls on the same inputs produce equal maps', () => {
    const ids = new Set(['T1059', 'T1003']);
    const first = buildCoverageIndex(sampleLayer, ids);
    const second = buildCoverageIndex(sampleLayer, ids);
    expect(second.size).toBe(first.size);
    for (const [key, val] of first) {
      expect(second.get(key)).toEqual(val);
    }
  });

  // 5. score === 0 must be preserved — 0 is the red/low end of the coverage
  //    scale and must NOT be silently dropped or coerced to undefined.
  test('preserves score === 0 (the low end of the coverage scale)', () => {
    const layerWithZeroScore: NavigatorLayer = {
      ...sampleLayer,
      techniques: [{ techniqueID: 'T1078', score: 0, enabled: true }],
    };
    const index = buildCoverageIndex(layerWithZeroScore, new Set(['T1078']));
    expect(index.has('T1078')).toBe(true);
    // score must be exactly 0, not undefined or null.
    expect(index.get('T1078')!.score).toBe(0);
  });

  // 6. A technique with enabled: false and no other fields must still be indexed
  //    when its ID is in the graph — the render uses the flag to dim/hide nodes.
  test('preserves a technique whose only field is enabled: false', () => {
    const layerDisabledOnly: NavigatorLayer = {
      ...sampleLayer,
      techniques: [{ techniqueID: 'T1110', enabled: false }],
    };
    const index = buildCoverageIndex(layerDisabledOnly, new Set(['T1110']));
    expect(index.has('T1110')).toBe(true);
    expect(index.get('T1110')!.enabled).toBe(false);
  });
});

describe('localStorage persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('savePersisted then loadPersisted round-trips', () => {
    savePersisted({ layer: sampleLayer, viewActive: true });
    const loaded = loadPersisted();
    expect(loaded?.layer.name).toBe('Sample');
    expect(loaded?.viewActive).toBe(true);
  });

  test('loadPersisted returns null when nothing is stored', () => {
    expect(loadPersisted()).toBeNull();
  });

  test('loadPersisted clears the key and returns null on corrupt JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ not json');
    expect(loadPersisted()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('clearPersisted removes the key', () => {
    savePersisted({ layer: sampleLayer, viewActive: false });
    clearPersisted();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('savePersisted swallows quota errors without throwing', () => {
    // Force setItem to throw a quota-like error.
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    expect(() =>
      savePersisted({ layer: sampleLayer, viewActive: true }),
    ).not.toThrow();
    window.localStorage.setItem = original;
  });

  // 2. Shape-mismatched record — valid JSON but the wrong shape should be
  //    treated as corrupt: return null AND clear the key so it does not
  //    resurface on the next load. The existing corrupt-JSON test only covers
  //    unparseable JSON; this covers the shape-guard branch.
  test('loadPersisted returns null and clears key on shape-mismatched JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ wrong: 'shape' }));
    expect(loadPersisted()).toBeNull();
    // The key must be removed so it does not resurface on next load.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // 3. savePersisted then clearPersisted round-trip — saving then clearing
  //    must leave no trace of the key in localStorage.
  test('savePersisted then clearPersisted leaves no key in localStorage', () => {
    savePersisted({ layer: sampleLayer, viewActive: true });
    clearPersisted();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // 4. Repeated savePersisted calls — the last write wins. The first value
  //    must not survive once a second save has overwritten it.
  test('repeated savePersisted calls — latest value wins', () => {
    const layerA: NavigatorLayer = { ...sampleLayer, name: 'Layer A' };
    const layerB: NavigatorLayer = { ...sampleLayer, name: 'Layer B' };
    savePersisted({ layer: layerA, viewActive: false });
    savePersisted({ layer: layerB, viewActive: true });
    const loaded = loadPersisted();
    expect(loaded?.layer.name).toBe('Layer B');
    expect(loaded?.viewActive).toBe(true);
  });

  // 7. loadPersisted when getItem itself throws — simulate a browser where
  //    localStorage access throws (e.g. private-browsing with strict settings).
  //    Must return null without re-throwing.
  test('loadPersisted returns null without throwing when getItem throws', () => {
    const original = window.localStorage.getItem;
    // Override to simulate a storage-access error.
    window.localStorage.getItem = () => {
      throw new DOMException('Storage access denied', 'SecurityError');
    };
    try {
      expect(() => loadPersisted()).not.toThrow();
      expect(loadPersisted()).toBeNull();
    } finally {
      // Always restore so other tests are not affected.
      window.localStorage.getItem = original;
    }
  });

  // 8. clearPersisted when removeItem throws — must swallow the error
  //    silently, since the in-memory state is the source of truth.
  test('clearPersisted does not throw when removeItem throws', () => {
    const original = window.localStorage.removeItem;
    window.localStorage.removeItem = () => {
      throw new DOMException('Storage access denied', 'SecurityError');
    };
    try {
      expect(() => clearPersisted()).not.toThrow();
    } finally {
      window.localStorage.removeItem = original;
    }
  });
});
