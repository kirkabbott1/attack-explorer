import { useMemo } from 'react';
import { useFilters, useGraph } from '@/lib/attack/context';
import { EMPTY_FILTERS } from '@/lib/attack/types';
import FilterSection from './FilterSection';
import SearchBox from './SearchBox';

/**
 * Left-hand sidebar containing four filter sections (Platform, Tactic, Group, Software)
 * and a "Clear all" link. Reads graph data from AttackProvider to derive options lists,
 * and reads/writes filter state via the useFilters hook.
 *
 * The search box (Task 27) will be inserted at the top of this component later.
 */
export default function FilterSidebar() {
  // DataLayer accessor — provides getAllTechniques, getAllTactics, etc.
  const data = useGraph();
  // Current filter selections and the setter from context.
  const [filters, setFilters] = useFilters();

  // Build the platform options by collecting every unique platform string across
  // all techniques. Sorted alphabetically so the chip list is stable.
  const platformOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of data.getAllTechniques()) {
      for (const p of t.platforms) set.add(p);
    }
    return Array.from(set).sort().map(p => ({ value: p, label: p }));
  }, [data]);

  // Tactic options derived from all tactics in the graph, preserving kill-chain order.
  const tacticOptions = useMemo(
    () => data.getAllTactics().map(t => ({ value: t.id, label: t.name })),
    [data]
  );

  // Group options sorted by name — typically 100+ entries in real data.
  const groupOptions = useMemo(
    () => data.getAllGroups().map(g => ({ value: g.id, label: g.name })),
    [data]
  );

  // Software options sorted by name — malware and tools combined.
  const softwareOptions = useMemo(
    () => data.getAllSoftware().map(s => ({ value: s.id, label: s.name })),
    [data]
  );

  /**
   * Toggle a single value inside one of the four filter arrays.
   * If the value is already present it is removed (deselect); otherwise it is added.
   * key must be a key of FilterState (platforms | tactics | groups | software).
   */
  const toggle = (key: keyof typeof filters, value: string) => {
    const cur = filters[key];
    const next = cur.includes(value)
      ? cur.filter(v => v !== value)
      : [...cur, value];
    setFilters({ ...filters, [key]: next });
  };

  // Reset all four filter arrays to empty, collapsing every chip selection.
  const clearAll = () => setFilters(EMPTY_FILTERS);

  return (
    <div className="flex flex-col h-full">
      {/* Sidebar brand header */}
      <div className="px-4 py-4 border-b border-darkteal/30">
        <h2 className="text-sm font-bold uppercase tracking-wider text-lightteal">
          ATT&amp;CK Explorer
        </h2>
      </div>

      {/* Search box pinned directly below the brand header (Task 27) */}
      <SearchBox />

      {/* Four filter sections — each renders chips for its option list */}
      <FilterSection
        title="Platform"
        options={platformOptions}
        selected={filters.platforms}
        onToggle={(v) => toggle('platforms', v)}
      />
      <FilterSection
        title="Tactic"
        options={tacticOptions}
        selected={filters.tactics}
        onToggle={(v) => toggle('tactics', v)}
      />
      <FilterSection
        title="Group"
        options={groupOptions}
        selected={filters.groups}
        onToggle={(v) => toggle('groups', v)}
      />
      <FilterSection
        title="Software"
        options={softwareOptions}
        selected={filters.software}
        onToggle={(v) => toggle('software', v)}
      />

      {/* Clear all sits at the bottom of the sidebar, pinned via mt-auto */}
      <div className="px-4 py-4 mt-auto border-t border-darkteal/30">
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-lightteal/60 hover:text-medteal"
        >
          Clear all filters
        </button>
      </div>
    </div>
  );
}
