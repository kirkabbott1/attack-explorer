// CoverageSection — sidebar panel for Navigator-layer import / view-toggle /
// clear / export. Mounted in FilterSidebar below the four filter sections.
//
// Visual style mirrors FilterSection: same border-b spacing, same uppercase
// heading, same chip-style toggle button when a layer is loaded.

import { useRef, useState } from 'react';
import { useCoverage, useFilters, useGraph } from '@/lib/attack/context';
import { parseNavigatorLayer, type NavigatorLayer } from '@/lib/attack/layer';
import { buildCoverageIndex } from '@/lib/attack/coverage';
import { EMPTY_COVERAGE, type FilterState } from '@/lib/attack/types';
import { isAnyFilterActive, techniqueMatches } from '@/lib/attack/filter';
import type { DataLayer } from '@/lib/attack/data';

export default function CoverageSection() {
  const data = useGraph();
  const [filters] = useFilters();
  const [coverage, setCoverage] = useCoverage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Transient parse-error message; clears on next import attempt.
  const [parseError, setParseError] = useState<string | null>(null);

  // --- Import -------------------------------------------------------------
  const onChooseFile = () => fileInputRef.current?.click();

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    setParseError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Use FileReader instead of file.text() for broader runtime compatibility
    // (file.text() is not available in jsdom used by Jest).
    let text: string;
    try {
      text = await readFileAsText(file);
    } catch (err) {
      setParseError(`Could not read file: ${String(err)}`);
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      setParseError('File is not valid JSON.');
      return;
    }

    const graphIds = new Set(data.getAllTechniques().map(t => t.id));
    const result = parseNavigatorLayer(json, graphIds);
    if (!result.layer) {
      setParseError(result.errors[0] ?? 'Failed to parse layer.');
      return;
    }

    const index = buildCoverageIndex(result.layer, graphIds);
    setCoverage({
      layer: result.layer,
      byTechniqueId: index,
      viewActive: true,
      warnings: result.warnings,
    });

    // Reset the input so re-selecting the same file fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Toggle / clear -----------------------------------------------------
  const onToggleView = () =>
    setCoverage({ ...coverage, viewActive: !coverage.viewActive });

  const onClear = () => setCoverage(EMPTY_COVERAGE);

  // --- Export -------------------------------------------------------------
  const onExport = () => {
    const matchingIds = data
      .getAllTechniques()
      .filter(t => !isAnyFilterActive(filters) || techniqueMatches(t, filters, data))
      .map(t => t.id);

    const summary = buildFilterSummary(filters, data);
    const exportLayer: NavigatorLayer = {
      versions: { attack: data.version, navigator: '5.1.0', layer: '4.5' },
      domain: 'enterprise-attack',
      name: `ATT&CK Explorer — ${summary}`,
      description: `Exported from the ATT&CK Explorer with filters: ${summary}`,
      gradient: { colors: ['#ffffff', '#ff6666'], minValue: 0, maxValue: 100 },
      techniques: matchingIds.map(id => ({
        techniqueID: id,
        score: 100,
        enabled: true,
      })),
    };

    const blob = new Blob([JSON.stringify(exportLayer, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attack-explorer-${formatDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Render -------------------------------------------------------------
  const loaded = coverage.layer !== null;

  return (
    <div className="border-b border-darkteal/20 py-3 px-4">
      <div className="flex w-full items-center justify-between text-sm font-semibold text-medteal">
        {/* Visible heading — uppercase chip-style label matching FilterSection style. */}
        <span className="uppercase tracking-wider">Coverage Layer</span>
      </div>

      {/* Hidden file input — triggered via the visible Import button. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        data-testid="coverage-file-input"
        className="hidden"
        onChange={onFileChange}
      />

      {!loaded && (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={onChooseFile}
            className="w-full px-2 py-1 text-xs rounded border bg-darkblue/40 text-lightteal/80 border-darkteal/40 hover:border-medteal/60"
          >
            Import layer
          </button>
          <p className="text-xs text-lightteal/50">
            Visualize an ATT&amp;CK Navigator layer as a 3D score overlay.
          </p>
          {parseError && (
            <p role="alert" className="text-xs text-red-400">
              {parseError}
            </p>
          )}
        </div>
      )}

      {loaded && coverage.layer && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-lightteal/90">{coverage.layer.name ?? 'Unnamed layer'}</div>
          <div className="text-xs text-lightteal/50">
            {coverage.byTechniqueId.size} techniques shown
          </div>
          {coverage.warnings.length > 0 && (
            <div className="text-xs text-yellow-300/80">{coverage.warnings[0]}</div>
          )}
          <button
            type="button"
            aria-pressed={coverage.viewActive}
            onClick={onToggleView}
            className={`w-full px-2 py-1 text-xs rounded border transition-colors ${
              coverage.viewActive
                ? 'bg-medteal/30 text-medteal border-medteal'
                : 'bg-darkblue/40 text-lightteal/70 border-darkteal/40 hover:border-medteal/60'
            }`}
          >
            Coverage view
          </button>
          <button
            type="button"
            onClick={onExport}
            className="w-full px-2 py-1 text-xs rounded border bg-darkblue/40 text-lightteal/80 border-darkteal/40 hover:border-medteal/60"
          >
            Export current view &rarr;
          </button>
          <button
            type="button"
            onClick={onClear}
            className="w-full px-2 py-1 text-xs text-lightteal/50 hover:text-lightteal underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// --- Helpers ---------------------------------------------------------------

/**
 * Read a File as a UTF-8 string using FileReader.
 * FileReader is universally supported in browsers and jsdom (Jest), unlike
 * the newer File.prototype.text() which is absent in jsdom.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Build a short human summary of active filters, e.g. "Group: APT29 (G0016); Platform: Linux". */
function buildFilterSummary(filters: FilterState, data: DataLayer): string {
  const parts: string[] = [];
  if (filters.platforms.length) parts.push(`Platform: ${filters.platforms.join(', ')}`);
  if (filters.tactics.length) {
    const names = filters.tactics
      .map(id => data.getTactic(id)?.name ?? id)
      .join(', ');
    parts.push(`Tactic: ${names}`);
  }
  if (filters.groups.length) {
    const names = filters.groups
      .map(id => {
        const g = data.getGroup(id);
        return g ? `${g.name} (${g.id})` : id;
      })
      .join(', ');
    parts.push(`Group: ${names}`);
  }
  if (filters.software.length) {
    const names = filters.software
      .map(id => {
        const s = data.getSoftware(id);
        return s ? `${s.name} (${s.id})` : id;
      })
      .join(', ');
    parts.push(`Software: ${names}`);
  }
  return parts.length ? parts.join('; ') : 'empty selection';
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
