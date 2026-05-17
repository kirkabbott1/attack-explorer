// Tests for lib/attack/search.ts
// Covers: empty query, name match, ID match, alias match, description match,
// ranking order (exact ID > exact name > prefix > substring > description),
// and the default 20-result limit.

import { search } from '../search';
import type { SearchIndex } from '../types';

// Small fixture index used across most tests
const index: SearchIndex = {
  entries: [
    { id: 'T1059', type: 'technique', name: 'Command and Scripting Interpreter', aliases: [], description: 'Adversaries may abuse command and script interpreters to execute commands.' },
    { id: 'T1059.001', type: 'technique', name: 'PowerShell', aliases: [], description: 'PowerShell is a powerful interactive command-line and scripting environment.' },
    { id: 'T1566', type: 'technique', name: 'Phishing', aliases: [], description: 'Adversaries may send phishing messages to gain access to victim systems.' },
    { id: 'G0016', type: 'group', name: 'APT29', aliases: ['Cozy Bear', 'Midnight Blizzard'], description: 'APT29 is a threat group attributed to Russia.' },
    { id: 'G0032', type: 'group', name: 'Lazarus Group', aliases: ['Hidden Cobra'], description: 'Lazarus Group is a threat group attributed to North Korea.' },
    { id: 'S0001', type: 'software', name: 'Mimikatz', aliases: [], description: 'Mimikatz is a credential dumping tool.' },
  ],
};

describe('lib/attack/search', () => {
  test('returns empty array for empty query', () => {
    expect(search('', index)).toEqual([]);
    expect(search('   ', index)).toEqual([]);
  });

  test('matches by name (case insensitive)', () => {
    const results = search('phishing', index);
    expect(results.map(r => r.id)).toContain('T1566');
  });

  test('matches by ID', () => {
    const results = search('T1059', index);
    expect(results.map(r => r.id)).toEqual(expect.arrayContaining(['T1059', 'T1059.001']));
  });

  test('matches by alias', () => {
    const results = search('cozy bear', index);
    expect(results.map(r => r.id)).toContain('G0016');
  });

  test('matches by description (lower-ranked than name)', () => {
    const results = search('credential', index);
    expect(results.map(r => r.id)).toContain('S0001');
  });

  test('exact name match ranks above partial/description match', () => {
    const results = search('PowerShell', index);
    expect(results[0].id).toBe('T1059.001');
  });

  test('exact ID match ranks first', () => {
    const results = search('T1059', index);
    expect(results[0].id).toBe('T1059');
  });

  test('returns at most 20 results by default', () => {
    // Build an index with 30 entries all matching "phishing"
    const bigIndex: SearchIndex = {
      entries: Array.from({ length: 30 }, (_, i) => ({
        id: `T${i}`,
        type: 'technique' as const,
        name: `Phishing Variant ${i}`,
        aliases: [],
        description: '',
      })),
    };
    expect(search('phishing', bigIndex)).toHaveLength(20);
  });
});
