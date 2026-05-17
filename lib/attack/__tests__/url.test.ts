// Tests for lib/attack/url.ts — encode/decode of app state to/from URL query params.
// Run with: npm test -- lib/attack/__tests__/url.test.ts
import { encodeStateToQuery, decodeStateFromQuery } from '../url';
import { EMPTY_FILTERS } from '../types';

describe('lib/attack/url', () => {
  // Empty state should produce an empty object — no noise in the URL.
  test('empty state encodes to empty object', () => {
    const result = encodeStateToQuery({ filters: EMPTY_FILTERS, focusId: null });
    expect(result).toEqual({});
  });

  // Non-empty arrays should be joined with commas; empty arrays are omitted.
  test('filters encode to comma-separated lists', () => {
    const result = encodeStateToQuery({
      filters: {
        platforms: ['Linux', 'macOS'],
        tactics: ['TA0001'],
        groups: ['G0016', 'G0032'],
        software: [],
      },
      focusId: null,
    });
    expect(result).toEqual({
      platform: 'Linux,macOS',
      tactic: 'TA0001',
      group: 'G0016,G0032',
    });
  });

  // focusId should appear as the "focus" key when set, omitted when null.
  test('focusId encodes when present', () => {
    const result = encodeStateToQuery({ filters: EMPTY_FILTERS, focusId: 'T1059.001' });
    expect(result).toEqual({ focus: 'T1059.001' });
  });

  // Round-trip: encode then decode should reproduce the original state.
  test('decode is the inverse of encode (filters)', () => {
    const original = {
      filters: {
        platforms: ['Linux', 'Windows'],
        tactics: ['TA0001', 'TA0002'],
        groups: ['G0016'],
        software: ['S0001'],
      },
      focusId: 'T1059',
    };
    const encoded = encodeStateToQuery(original);
    const decoded = decodeStateFromQuery(encoded);
    expect(decoded).toEqual(original);
  });

  // Missing query params should yield EMPTY_FILTERS and null focusId.
  test('decode handles missing params gracefully', () => {
    expect(decodeStateFromQuery({})).toEqual({ filters: EMPTY_FILTERS, focusId: null });
  });

  // Next.js router can provide string instead of string[] for single values;
  // decode must handle both shapes uniformly.
  test('decode handles single string values (Next.js router sometimes returns string | string[])', () => {
    const decoded = decodeStateFromQuery({ platform: 'Linux', tactic: 'TA0001' });
    expect(decoded.filters.platforms).toEqual(['Linux']);
    expect(decoded.filters.tactics).toEqual(['TA0001']);
  });
});
