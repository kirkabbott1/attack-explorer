// Unit tests for the pure helpers in src/lib/attack/fetcher.ts.
// These run under Jest (jsdom) without any network access.

import { stripCitations, truncateForSearch } from '../fetcher';

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
