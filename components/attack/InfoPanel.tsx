import { useState } from 'react';
import { useGraph } from '@/lib/attack/context';

/**
 * InfoPanel: bottom-left overlay on the 3D canvas.
 * Always shows a compact legend mapping each node type to its shape and color.
 * Expands on demand to show keyboard shortcuts and navigation hints.
 * Hidden on mobile (md:block) to avoid cluttering the small screen.
 */

// Describes one row in the legend — a node type, its brand color, and the
// shape used to represent it in the 3D scene.
interface LegendItem {
  label: string;
  color: string;
  shape: 'hex' | 'sphere' | 'small-sphere' | 'octahedron' | 'cube' | 'tetrahedron';
}

// Each entry corresponds to a node kind rendered in Scene.tsx.
// Colors match the palette defined in tailwind.config.js plus inline literals
// for types that don't map to named theme colors.
const ITEMS: LegendItem[] = [
  { label: 'Tactic', color: '#3ffefb', shape: 'hex' },
  { label: 'Technique', color: '#9bfffd', shape: 'sphere' },
  { label: 'Sub-technique', color: '#15d6d2', shape: 'small-sphere' },
  { label: 'Group', color: '#c084fc', shape: 'octahedron' },
  { label: 'Malware', color: '#fb923c', shape: 'cube' },
  { label: 'Tool', color: '#facc15', shape: 'tetrahedron' },
];

/**
 * ShapeIcon: renders a small 16x16 SVG that approximates the 3D geometry used
 * in the scene, so the legend matches what users see on screen.
 */
function ShapeIcon({ shape, color }: { shape: LegendItem['shape']; color: string }) {
  switch (shape) {
    case 'hex':
      // Regular hexagon — represents tactic nodes (CylinderGeometry with 6 sides)
      return (
        <svg width="16" height="16" viewBox="0 0 16 16">
          <polygon points="8,2 14,5.5 14,10.5 8,14 2,10.5 2,5.5" fill={color} />
        </svg>
      );
    case 'sphere':
      // Full circle — represents technique nodes (SphereGeometry)
      return (
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" fill={color} />
        </svg>
      );
    case 'small-sphere':
      // Smaller circle — represents sub-technique nodes (smaller SphereGeometry)
      return (
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="4" fill={color} />
        </svg>
      );
    case 'octahedron':
      // Diamond outline — represents group nodes (OctahedronGeometry)
      return (
        <svg width="16" height="16" viewBox="0 0 16 16">
          <polygon points="8,2 14,8 8,14 2,8" fill={color} />
        </svg>
      );
    case 'cube':
      // Filled square — represents malware nodes (BoxGeometry)
      return (
        <svg width="16" height="16" viewBox="0 0 16 16">
          <rect x="3" y="3" width="10" height="10" fill={color} />
        </svg>
      );
    case 'tetrahedron':
      // Triangle — represents tool nodes (TetrahedronGeometry)
      return (
        <svg width="16" height="16" viewBox="0 0 16 16">
          <polygon points="8,2 14,14 2,14" fill={color} />
        </svg>
      );
  }
}

/**
 * InfoPanel renders as an absolutely-positioned card at bottom-right of the canvas area.
 * Positioning is absolute (not fixed) so it is scoped to the <main> canvas column in
 * AppShell. This keeps it from overlapping the detail panel (a separate aside column)
 * when that panel slides open on the right, and from overlapping the sidebar on the left.
 * It always shows the legend and offers a toggle to reveal navigation controls.
 */
export default function InfoPanel() {
  // Controls whether the "Controls & shortcuts" section is visible below the legend.
  const [expanded, setExpanded] = useState(false);
  // Read the ATT&CK data version (sourced from MITRE's x_mitre_version) so viewers
  // can confirm what corpus they're looking at. Updated by the monthly GitHub Action.
  const data = useGraph();

  return (
    <div
      className="hidden md:block absolute bottom-3 right-3 z-10 bg-darkblue/95 border border-darkteal/30 rounded px-4 py-3 text-sm"
      style={{ maxWidth: 300, backdropFilter: 'blur(4px)' }}
    >
      {/* Section label */}
      <div className="text-lightteal/60 uppercase tracking-wider text-[11px] mb-2">Legend</div>

      {/* One row per node type */}
      <ul className="space-y-1">
        {ITEMS.map(item => (
          <li key={item.label} className="flex items-center gap-2 text-lightteal/90">
            <ShapeIcon shape={item.shape} color={item.color} />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      {/* ATT&CK version stamp — always visible so viewers know the data is current */}
      <div className="mt-3 pt-2 border-t border-darkteal/30 text-[11px] text-lightteal/50">
        ATT&amp;CK Enterprise v{data.version}
      </div>

      {/* Toggle button — collapses or expands the controls section below */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="mt-2 text-medteal hover:text-lightteal text-xs block"
      >
        {/* Use HTML entities for arrows to avoid Windows charmap encoding issues */}
        {expanded ? 'Hide controls ↑' : 'Controls & shortcuts ↓'}
      </button>

      {/* Expandable controls/shortcuts reference — only mounted when open */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-darkteal/30 text-[12px] text-lightteal/80 space-y-2 leading-snug">
          <div>
            <span className="text-medteal">Navigate:</span> drag to orbit; scroll to zoom; right-click or <code className="px-1 bg-darkteal/30 rounded">Shift</code> + drag to pan
          </div>
          <div>
            <span className="text-medteal">Search:</span> press{' '}
            <code className="px-1 bg-darkteal/30 rounded">/</code> or{' '}
            <code className="px-1 bg-darkteal/30 rounded">Cmd+K</code>
          </div>
          <div>
            <span className="text-medteal">Inspect:</span> click any node to see details on the right
          </div>
          <div>
            <span className="text-medteal">Close panel:</span>{' '}
            <code className="px-1 bg-darkteal/30 rounded">Esc</code>
          </div>
          <div>
            <span className="text-medteal">Debug:</span> add{' '}
            <code className="px-1 bg-darkteal/30 rounded">?debug=1</code> for FPS overlay
          </div>
        </div>
      )}
    </div>
  );
}
