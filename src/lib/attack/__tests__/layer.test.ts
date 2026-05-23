import {
  parseNavigatorLayer,
  colorForScore,
  DEFAULT_GRADIENT,
  NEUTRAL_NOT_IN_LAYER,
} from '../layer';
import coverageFixture from './fixtures/navigator-layer-coverage.json';
import wrongDomainFixture from './fixtures/navigator-layer-wrong-domain.json';

// A small set of "valid" technique IDs used by the parser tests. Matches the
// IDs in coverageFixture except T9999 which is intentionally absent.
const KNOWN_IDS = new Set(['T1059', 'T1059.001', 'T1003', 'T1078']);

// Helper that builds a minimal valid layer payload so individual field variants
// can be tested without copying the full fixture each time.
function makeMinimalLayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    domain: 'enterprise-attack',
    versions: { attack: '17', navigator: '5', layer: '4.5' },
    techniques: [],
    ...overrides,
  };
}

describe('parseNavigatorLayer', () => {
  test('parses a valid layer and indexes by technique id', () => {
    const result = parseNavigatorLayer(coverageFixture, KNOWN_IDS);
    expect(result.errors).toEqual([]);
    expect(result.layer).not.toBeNull();
    expect(result.layer!.name).toBe('Test Coverage Layer');
    expect(result.layer!.techniques).toHaveLength(5);
  });

  test('hard-errors when domain is not enterprise-attack', () => {
    const result = parseNavigatorLayer(wrongDomainFixture, KNOWN_IDS);
    expect(result.layer).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/enterprise-attack/);
  });

  test('hard-errors on non-object input', () => {
    expect(parseNavigatorLayer('not an object', KNOWN_IDS).layer).toBeNull();
    expect(parseNavigatorLayer(null, KNOWN_IDS).layer).toBeNull();
    expect(parseNavigatorLayer([], KNOWN_IDS).layer).toBeNull();
  });

  test('hard-errors when techniques is missing or not an array', () => {
    const result = parseNavigatorLayer(
      { domain: 'enterprise-attack', versions: { attack: '17', navigator: '5', layer: '4.5' } },
      KNOWN_IDS,
    );
    expect(result.layer).toBeNull();
    expect(result.errors[0]).toMatch(/techniques/);
  });

  test('warns when attack version differs', () => {
    const fixture = { ...coverageFixture, versions: { ...coverageFixture.versions, attack: '14' } };
    const result = parseNavigatorLayer(fixture, KNOWN_IDS);
    expect(result.layer).not.toBeNull();
    expect(result.warnings.join(' ')).toMatch(/version/i);
  });

  test('counts unknown technique IDs as a single warning', () => {
    // T9999 is in the fixture but not in KNOWN_IDS.
    const result = parseNavigatorLayer(coverageFixture, KNOWN_IDS);
    expect(result.warnings.join(' ')).toMatch(/1 .* not present/i);
  });

  test('defaults enabled to true when omitted', () => {
    const result = parseNavigatorLayer(coverageFixture, KNOWN_IDS);
    const t1059 = result.layer!.techniques.find(t => t.techniqueID === 'T1059')!;
    expect(t1059.enabled).toBe(true);
  });

  test('preserves enabled: false when present', () => {
    const result = parseNavigatorLayer(coverageFixture, KNOWN_IDS);
    const t1078 = result.layer!.techniques.find(t => t.techniqueID === 'T1078')!;
    expect(t1078.enabled).toBe(false);
  });

  // Checklist item 1: empty techniques array must be valid and produce no errors.
  test('accepts an empty techniques array without errors', () => {
    const result = parseNavigatorLayer(makeMinimalLayer(), new Set());
    expect(result.errors).toEqual([]);
    expect(result.layer).not.toBeNull();
    expect(result.layer!.techniques).toEqual([]);
  });

  // Checklist item 2: entries with a non-string or missing techniqueID are
  // silently skipped; the parser must not crash.
  test('silently skips entries with a numeric techniqueID', () => {
    const raw = makeMinimalLayer({
      techniques: [{ techniqueID: 123, score: 50 }],
    });
    const result = parseNavigatorLayer(raw, new Set());
    expect(result.errors).toEqual([]);
    expect(result.layer!.techniques).toHaveLength(0);
  });

  test('silently skips entries with techniqueID entirely missing', () => {
    const raw = makeMinimalLayer({
      techniques: [{ score: 80 }, { tactic: 'execution', color: '#ff0000' }],
    });
    const result = parseNavigatorLayer(raw, new Set());
    expect(result.errors).toEqual([]);
    expect(result.layer!.techniques).toHaveLength(0);
  });

  // Checklist item 3: when both score and color are present, both are preserved
  // in the parsed output so downstream rendering can decide which takes precedence.
  test('preserves both score and explicit color when both are present', () => {
    const raw = makeMinimalLayer({
      techniques: [{ techniqueID: 'T1059', score: 75, color: '#abcdef' }],
    });
    const result = parseNavigatorLayer(raw, new Set(['T1059']));
    expect(result.errors).toEqual([]);
    const t = result.layer!.techniques[0];
    expect(t.score).toBe(75);
    expect(t.color).toBe('#abcdef');
  });

  // Checklist item 4: parseGradient (tested via parseNavigatorLayer) must not
  // crash when the colors array contains non-string values.
  test('handles gradient with mixed-type color stops — filters non-strings, keeps valid ones', () => {
    const raw = makeMinimalLayer({
      gradient: { colors: [null, 'foo', 42], minValue: 0, maxValue: 100 },
    });
    const result = parseNavigatorLayer(raw, new Set());
    expect(result.errors).toEqual([]);
    // 'foo' is the only string survivor; gradient must be non-null with that color.
    expect(result.layer!.gradient).not.toBeUndefined();
    expect(result.layer!.gradient!.colors).toEqual(['foo']);
  });

  // Checklist item 5: parseGradient returns undefined when colors is empty
  // (so downstream code uses DEFAULT_GRADIENT).
  test('treats an empty gradient colors array as no gradient', () => {
    const raw = makeMinimalLayer({
      gradient: { colors: [], minValue: 0, maxValue: 100 },
    });
    const result = parseNavigatorLayer(raw, new Set());
    expect(result.errors).toEqual([]);
    expect(result.layer!.gradient).toBeUndefined();
  });

  // Checklist item 5 (extended): all non-string values → gradient is also undefined.
  test('treats gradient with only non-string colors as no gradient', () => {
    const raw = makeMinimalLayer({
      gradient: { colors: [null, 42, true], minValue: 0, maxValue: 100 },
    });
    const result = parseNavigatorLayer(raw, new Set());
    expect(result.errors).toEqual([]);
    expect(result.layer!.gradient).toBeUndefined();
  });
});

describe('colorForScore', () => {
  const G = { colors: ['#000000', '#ffffff'], minValue: 0, maxValue: 100 };

  test('returns the min color for score == minValue', () => {
    expect(colorForScore(0, G).toLowerCase()).toBe('#000000');
  });

  test('returns the max color for score == maxValue', () => {
    expect(colorForScore(100, G).toLowerCase()).toBe('#ffffff');
  });

  test('interpolates linearly between two stops', () => {
    // Halfway between black (#000000) and white (#ffffff) is #808080 ish.
    const mid = colorForScore(50, G).toLowerCase();
    expect(mid).toMatch(/^#7f7f7f|^#808080/);
  });

  test('clamps scores below minValue to the min color', () => {
    expect(colorForScore(-10, G).toLowerCase()).toBe('#000000');
  });

  test('clamps scores above maxValue to the max color', () => {
    expect(colorForScore(200, G).toLowerCase()).toBe('#ffffff');
  });

  test('handles a three-stop gradient by interpolating between adjacent stops', () => {
    const G3 = { colors: ['#ff0000', '#ffffff', '#0000ff'], minValue: 0, maxValue: 100 };
    // 25 sits between #ff0000 (at 0) and #ffffff (at 50) — should be a pinky tone.
    const c = colorForScore(25, G3);
    expect(c.toLowerCase()).not.toBe('#ff0000');
    expect(c.toLowerCase()).not.toBe('#ffffff');
  });

  test('falls back gracefully on a degenerate single-color gradient', () => {
    expect(colorForScore(50, { colors: ['#abcdef'], minValue: 0, maxValue: 100 })).toBe('#abcdef');
  });
});

// Checklist item 6: zero-width gradient (minValue === maxValue).
// The clamp guards (`score <= minValue` and `score >= maxValue`) fire before the
// division `(score - minValue) / (maxValue - minValue)` is reached, so a NaN
// result is impossible for any finite score when min === max.
describe('colorForScore — degenerate zero-width range (minValue === maxValue)', () => {
  const FLAT = { colors: ['#000000', '#ffffff'], minValue: 50, maxValue: 50 };

  test('score exactly at the degenerate value returns a valid hex string', () => {
    const c = colorForScore(50, FLAT);
    // Must be a #rrggbb hex string, not NaN-derived garbage like '#NaNNaNNaN'.
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('score below the degenerate value returns a valid hex string', () => {
    const c = colorForScore(10, FLAT);
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('score above the degenerate value returns a valid hex string', () => {
    const c = colorForScore(90, FLAT);
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

// Checklist item 7: negative minValue — interpolation must still be linear.
describe('colorForScore — negative minValue', () => {
  // Range -100 to 100: score 0 is exactly the midpoint (t = 0.5).
  // Midpoint of #000000 and #ffffff is #7f7f7f or #808080.
  const GNEG = { colors: ['#000000', '#ffffff'], minValue: -100, maxValue: 100 };

  test('score at midpoint of a negative-to-positive range interpolates correctly', () => {
    const c = colorForScore(0, GNEG).toLowerCase();
    expect(c).toMatch(/^#7f7f7f|^#808080/);
  });

  test('score at minValue returns the first color', () => {
    expect(colorForScore(-100, GNEG).toLowerCase()).toBe('#000000');
  });

  test('score at maxValue returns the last color', () => {
    expect(colorForScore(100, GNEG).toLowerCase()).toBe('#ffffff');
  });
});

describe('DEFAULT_GRADIENT and NEUTRAL_NOT_IN_LAYER', () => {
  test('DEFAULT_GRADIENT has at least two stops and a valid range', () => {
    expect(DEFAULT_GRADIENT.colors.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_GRADIENT.maxValue).toBeGreaterThan(DEFAULT_GRADIENT.minValue);
  });

  test('NEUTRAL_NOT_IN_LAYER is a 7-char hex string', () => {
    expect(NEUTRAL_NOT_IN_LAYER).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
