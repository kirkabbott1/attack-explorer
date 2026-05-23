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

describe('DEFAULT_GRADIENT and NEUTRAL_NOT_IN_LAYER', () => {
  test('DEFAULT_GRADIENT has at least two stops and a valid range', () => {
    expect(DEFAULT_GRADIENT.colors.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_GRADIENT.maxValue).toBeGreaterThan(DEFAULT_GRADIENT.minValue);
  });

  test('NEUTRAL_NOT_IN_LAYER is a 7-char hex string', () => {
    expect(NEUTRAL_NOT_IN_LAYER).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
