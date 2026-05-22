// HoverTooltip.tsx
// Renders a floating HTML tooltip next to the currently-hovered node in the 3D scene.
// Uses @react-three/drei's Html component to position a DOM element in world-space.
// Only one HoverTooltip instance is mounted in the scene — it reads the globally-shared
// hoveredId from context and repositions itself whenever that ID changes.
// When hoveredId is null (no node hovered) the component returns null and renders nothing.

import { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { useGraph, useHover, usePositions } from '@/lib/attack/context';

/**
 * A single floating tooltip that renders next to whatever node is currently hovered.
 * One instance suffices — the hovered node changes, the tooltip follows.
 *
 * Lookup order: tactic -> technique -> group -> software.
 * The tooltip is offset +4 units in Y so it floats above the node sphere/mesh.
 * pointerEvents: none prevents the tooltip div from intercepting mouse events,
 * which would interfere with onPointerOut on the underlying mesh.
 */
export default function HoverTooltip() {
  // Track whether the viewport is wide enough to show the HTML tooltip (>= 768px / Tailwind md).
  // On mobile, hovering is not meaningful and Html overlays cause clutter, so return null early.
  const [showLabels, setShowLabels] = useState(false);
  useEffect(() => {
    // Check and update visibility whenever the window is resized.
    const check = () => setShowLabels(typeof window !== 'undefined' && window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // DataLayer provides typed lookup methods for each entity category.
  const data = useGraph();
  // Map<nodeId, Vec3> — the world-space position for every node.
  const positions = usePositions();
  // [hoveredId, setHoveredId] — we only read hoveredId here.
  const [hoveredId] = useHover();

  // On mobile viewports, suppress the tooltip entirely — orbit controls still work.
  if (!showLabels) return null;

  // Nothing hovered: render nothing.
  if (!hoveredId) return null;

  // If somehow the hovered ID has no position in the layout map, bail gracefully.
  const pos = positions.get(hoveredId);
  if (!pos) return null;

  // Resolve the entity. Priority: tactic > technique > group > software.
  // Only one will be non-null for any valid node ID.
  const tactic = data.getTactic(hoveredId);
  const tech = data.getTechnique(hoveredId);
  const group = data.getGroup(hoveredId);
  const software = data.getSoftware(hoveredId);
  const node = tactic || tech || group || software;

  // Unknown ID — do not attempt to render tooltip.
  if (!node) return null;

  const label = node.name;
  const id = node.id;

  return (
    // Html wraps a DOM subtree and positions it at the given world-space coordinate.
    // center=true horizontally centres the tooltip above the node.
    // pointerEvents: none on the outer style so the tooltip doesn't steal mouse events.
    <Html position={[pos.x, pos.y + 4, pos.z]} center style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: 'rgba(2, 8, 24, 0.9)',  // dark navy matches scene background
          color: '#9bfffd',                    // cyan matches technique color palette
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 12,
          border: '1px solid #15d6d2',         // teal border ties to the palette
          whiteSpace: 'nowrap',                 // prevent wrapping for long names
        }}
      >
        {/* Main label text followed by the entity ID in a dimmed style */}
        {label} <span style={{ opacity: 0.5, marginLeft: 6 }}>{id}</span>
      </div>
    </Html>
  );
}
