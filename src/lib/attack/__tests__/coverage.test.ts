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
});
