// Unit tests for the pure helpers in src/lib/attack/fetcher.ts.
// These run under Jest (jsdom) without any network access.

import { stripCitations } from '../fetcher';

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
