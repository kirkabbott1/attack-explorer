import { forwardRef, useState, useMemo } from 'react';
import { useSearchIndex, useSelection } from '@/lib/attack/context';
import { search } from '@/lib/attack/search';

/**
 * Pinned at the top of the FilterSidebar. Searches the loaded index as the user types
 * (no debounce in v1 -- the index is small and search is fast). Clicking a result sets
 * the selection (which opens the detail panel and centers the camera).
 *
 * Wrapped in forwardRef so a parent can pass a ref that lands on the inner <input>.
 * The app page uses this ref to programmatically focus the input via keyboard shortcuts
 * (/ and Cmd+K).
 *
 * State:
 *   query  - raw text in the input field; drives the useMemo search call.
 *
 * When the user picks an entry the query is cleared so the listbox disappears and the
 * input is ready for the next search.
 */
const SearchBox = forwardRef<HTMLInputElement>(function SearchBox(_, ref) {
  // Retrieve the search index from the nearest AttackProvider.
  const index = useSearchIndex();
  // setSelection maps to setFocusId in the context -- opening the detail panel.
  const [, setSelection] = useSelection();
  // Local query string: controls the input value and drives search results.
  const [query, setQuery] = useState('');

  // Derive ranked results from the current query. search() returns [] for empty/whitespace
  // queries, so the listbox is never rendered until the user types something.
  const results = useMemo(() => search(query, index), [query, index]);

  /**
   * Handle a result being picked: set the selection to the chosen id (which opens the
   * detail panel), then clear the query so the dropdown closes.
   */
  const handlePick = (id: string) => {
    setSelection(id);
    setQuery('');
  };

  return (
    <div className="px-4 py-3 border-b border-darkteal/30">
      {/* Text input: ref is forwarded from the parent so keyboard shortcuts can focus it.
          Placeholder includes the / shortcut hint so users discover the shortcut. */}
      <input
        ref={ref}
        type="text"
        placeholder="Search techniques, groups, software... ( / )"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded bg-darkblue/60 text-lightteal placeholder-lightteal/40 border border-darkteal/40 focus:outline-none focus:border-medteal"
      />
      {/* Results list -- only rendered when there is at least one match */}
      {results.length > 0 && (
        <ul role="listbox" className="mt-2 max-h-64 overflow-y-auto rounded border border-darkteal/30 bg-darkblue/95">
          {results.map(r => (
            <li
              key={r.id}
              role="option"
              aria-selected={false}
              onClick={() => handlePick(r.id)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-medteal/10 text-lightteal"
            >
              {/* Single-letter type badge: T = technique, G = group, S = software */}
              <span className="text-xs text-lightteal/50 mr-2">
                {r.type === 'technique' ? 'T' : r.type === 'group' ? 'G' : 'S'}
              </span>
              {r.name}
              <span className="ml-2 text-xs text-lightteal/40">{r.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default SearchBox;
