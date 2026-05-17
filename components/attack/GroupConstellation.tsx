// GroupConstellation.tsx
// Renders all MITRE ATT&CK threat groups as a single InstancedMesh of octahedrons.
// Using octahedrons (not spheres) makes groups visually distinct from technique nodes.
// Groups are positioned at high +Z (back-plane) by the computeLayout function so they
// cluster behind the technique field. One draw call for all groups = GPU-efficient.
//
// Filter-aware rendering: when a group filter is active, only the explicitly-selected
// groups are shown at full color; all others are dimmed to ~8% brightness. When no
// group filter is active, all groups render at full brightness.
//
// The useEffect runs on mount AND on every filter/position change — replaces the old
// onUpdate-only setup so the scene updates reactively when the user changes filters.

import { useRef, useEffect } from 'react';
import { InstancedMesh, Object3D, Color } from 'three';
// ThreeEvent is the R3F wrapper around native pointer/mouse events with scene-graph context.
import { type ThreeEvent } from '@react-three/fiber';
import { useGraph, usePositions, useFilters, useHover, useSelection } from '@/lib/attack/context';
import { isAnyFilterActive, groupMatches } from '@/lib/attack/filter';

// Light purple differentiates groups from teal techniques and orange/yellow software.
const GROUP_COLOR = '#c084fc';
// Octahedron radius — slightly larger than technique spheres for visual hierarchy.
const GROUP_RADIUS = 1.2;

// Scale factors: matching nodes scale up slightly when filters are active to draw the eye.
const MATCH_SCALE = 1.2;
const NONMATCH_SCALE = 1.0;

/**
 * Renders all threat groups as one InstancedMesh of octahedrons (visually distinct from
 * spherical techniques). Positioned in the back-plane (high +Z) per the layout function.
 *
 * Uses useFilters() to reactively update node colors and scales whenever filter state
 * changes. Nodes that don't match the active filters are dimmed to near-black rather
 * than removed, so the overall constellation shape remains visible as context.
 */
export default function GroupConstellation() {
  // DataLayer exposes getAllGroups() — returns the full groups array from the graph.
  const data = useGraph();
  // Map<nodeId, Vec3> produced by computeLayout — positions every node in world space.
  const positions = usePositions();
  // [filters, setFilters] — we only read filters here.
  const [filters] = useFilters();
  // [hoveredId, setHover] — we only write setHover here.
  const [, setHover] = useHover();
  // [focusId, setSelection] — we only write setSelection here.
  const [, setSelection] = useSelection();

  const groups = data.getAllGroups();

  // meshRef is used for direct imperative access in the useEffect update loop.
  const meshRef = useRef<InstancedMesh>(null!);

  // Runs on mount and whenever filters or positions change. Updates every instance's
  // matrix (position + scale) and color to reflect the current filter state.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Reusable dummy Object3D — avoids allocating per-group objects inside the loop.
    const dummy = new Object3D();
    const base = new Color(GROUP_COLOR);
    // ~8% intensity keeps non-matching nodes barely visible — perceptually near black.
    const dim = new Color(GROUP_COLOR).multiplyScalar(0.08);
    const anyActive = isAnyFilterActive(filters);

    for (let i = 0; i < groups.length; i++) {
      const pos = positions.get(groups[i].id);
      // Skip any group that the layout function did not assign a position to.
      if (!pos) continue;

      // groupMatches returns true for all groups when no group filter is active.
      const matches = !anyActive || groupMatches(groups[i], filters);

      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.scale.setScalar(matches ? MATCH_SCALE : NONMATCH_SCALE);
      dummy.updateMatrix();

      // Write the 4x4 transformation matrix for this instance slot.
      mesh.setMatrixAt(i, dummy.matrix);
      // Apply full or dimmed color based on match status.
      mesh.setColorAt?.(i, matches ? base : dim);
    }

    // Signal Three.js that the instance buffers have been written and need GPU upload.
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [filters, positions, groups]);

  // --- Pointer event handlers for group instances ---
  // e.instanceId is the integer slot index in the InstancedMesh buffer — maps directly
  // to the index in the `groups` array since they share the same ordering.

  /** Set hover to the group node under the pointer. stopPropagation prevents bubbling. */
  const onGroupOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = groups[e.instanceId!]?.id;
    if (id) setHover(id);
  };

  /** Clear hover when the pointer leaves any group instance. */
  const onGroupOut = () => setHover(null);

  /** Set the selected (focused) node to the clicked group. */
  const onGroupClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = groups[e.instanceId!]?.id;
    if (id) setSelection(id);
  };

  return (
    // instancedMesh args: [geometry, material, count].
    // Passing undefined for geometry/material because they are supplied as child JSX.
    // Pointer handlers enable hover tooltip and click-to-select.
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, groups.length]}
      onPointerOver={onGroupOver}
      onPointerOut={onGroupOut}
      onClick={onGroupClick}
    >
      {/* Octahedron detail=0 gives the classic 8-face diamond shape, cheap to render */}
      <octahedronGeometry args={[GROUP_RADIUS, 0]} />
      {/* meshStandardMaterial responds to scene lighting for depth cues */}
      <meshStandardMaterial color={GROUP_COLOR} />
    </instancedMesh>
  );
}
