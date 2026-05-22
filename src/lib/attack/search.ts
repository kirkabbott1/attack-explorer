// Full-text search over a SearchIndex. Returns results ranked by relevance:
//   exact ID > exact name > prefix name > prefix alias > substring name/ID >
//   substring alias > substring description.
// Ties are broken by name length ascending (shorter = more specific match).

import type { SearchIndex, SearchIndexEntry } from './types';

// Match scoring tiers (higher score = better match).
// We rank by tier first, then by name length (shorter = more specific match).
const SCORE_EXACT_ID = 100;
const SCORE_EXACT_NAME = 90;
const SCORE_PREFIX_NAME = 70;
const SCORE_PREFIX_ALIAS = 60;
const SCORE_SUBSTRING_NAME = 50;
const SCORE_SUBSTRING_ALIAS = 40;
const SCORE_SUBSTRING_DESCRIPTION = 20;

// Internal pairing of an entry with its computed relevance score.
interface ScoredEntry {
  entry: SearchIndexEntry;
  score: number;
}

/**
 * Search the index for entries matching the query. Returns up to `limit` results
 * ranked by relevance: exact ID > exact name > prefix > substring > description.
 *
 * Empty / whitespace-only queries return an empty array.
 */
export function search(query: string, index: SearchIndex, limit = 20): SearchIndexEntry[] {
  // Normalize the query: trim whitespace and lower-case for case-insensitive comparison.
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const scored: ScoredEntry[] = [];

  for (const entry of index.entries) {
    // Normalize all fields for comparison.
    const name = entry.name.toLowerCase();
    const id = entry.id.toLowerCase();
    const aliases = entry.aliases.map(a => a.toLowerCase());
    const description = entry.description.toLowerCase();

    // Evaluate each scoring tier in descending priority.
    // We use a cascade of else-if so only the highest applicable tier fires.
    let score = 0;

    if (id === q) {
      // Best match: the user typed an exact ATT&CK ID (e.g., "T1059").
      score = Math.max(score, SCORE_EXACT_ID);
    } else if (name === q) {
      // Second best: the user typed the exact technique/group/software name.
      score = Math.max(score, SCORE_EXACT_NAME);
    } else if (name.startsWith(q)) {
      // Name starts with the query (e.g., "power" matches "PowerShell").
      score = Math.max(score, SCORE_PREFIX_NAME);
    } else if (aliases.some(a => a.startsWith(q))) {
      // An alias starts with the query.
      score = Math.max(score, SCORE_PREFIX_ALIAS);
    } else if (name.includes(q) || id.includes(q)) {
      // Query appears somewhere in the name or ID (e.g., "T1059" matches "T1059.001").
      score = Math.max(score, SCORE_SUBSTRING_NAME);
    } else if (aliases.some(a => a.includes(q))) {
      // Query appears somewhere in one of the aliases.
      score = Math.max(score, SCORE_SUBSTRING_ALIAS);
    } else if (description.includes(q)) {
      // Lowest priority: query appears in the description text.
      score = Math.max(score, SCORE_SUBSTRING_DESCRIPTION);
    }

    // Only include entries that matched at least one tier.
    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  // Primary sort: score descending (higher score = better match).
  // Secondary sort: name length ascending (shorter name = more specific result).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.name.length - b.entry.name.length;
  });

  // Return only the SearchIndexEntry objects, capped at `limit`.
  return scored.slice(0, limit).map(s => s.entry);
}
