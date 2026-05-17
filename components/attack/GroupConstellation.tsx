// GroupConstellation.tsx
// Renders all MITRE ATT&CK threat groups as a single InstancedMesh of octahedrons.
// Using octahedrons (not spheres) makes groups visually distinct from technique nodes.
// Groups are positioned at high +Z (back-plane) by the computeLayout function so they
// cluster behind the technique field. One draw call for all groups = GPU-efficient.

import { useRef } from 'react';
import { InstancedMesh, Object3D, Color } from 'three';
import { useGraph, usePositions } from '@/lib/attack/context';

// Light purple differentiates groups from teal techniques and white/gold tactics.
const GROUP_COLOR = '#c084fc';
// Octahedron radius — slightly larger than technique spheres for visual hierarchy.
const GROUP_RADIUS = 1.2;

/**
 * Renders all threat groups as one InstancedMesh of octahedrons (visually distinct from
 * spherical techniques). Positioned in the back-plane (high +Z) per the layout function.
 *
 * Uses R3F's onUpdate callback to set per-instance matrices and colors once on mount.
 * If a group has no computed position (layout gap), it is silently skipped.
 */
export default function GroupConstellation() {
  // DataLayer exposes getAllGroups() — returns the full groups array from the graph.
  const data = useGraph();
  // Map<nodeId, Vec3> produced by computeLayout — positions every node in world space.
  const positions = usePositions();
  const groups = data.getAllGroups();
  // meshRef is used for direct imperative access if needed by future interaction code.
  const meshRef = useRef<InstancedMesh>(null!);

  /**
   * setup() is called by R3F's onUpdate once the InstancedMesh is created.
   * It iterates over all groups and writes:
   *   - a world-space transformation matrix (position only, no rotation/scale) per instance
   *   - a uniform purple color for every instance via setColorAt
   */
  const setup = (mesh: InstancedMesh) => {
    // Reusable dummy Object3D — avoids allocating per-group objects inside the loop.
    const dummy = new Object3D();
    const col = new Color(GROUP_COLOR);
    for (let i = 0; i < groups.length; i++) {
      const pos = positions.get(groups[i].id);
      // Skip any group that the layout function did not assign a position to.
      if (!pos) continue;
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.updateMatrix();
      // Write the 4x4 transformation matrix for this instance slot.
      mesh.setMatrixAt(i, dummy.matrix);
      // setColorAt is optional on older Three.js builds — guard with optional call.
      mesh.setColorAt?.(i, col);
    }
    // Signal Three.js that the instance buffer has been written and needs upload to GPU.
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  return (
    // instancedMesh args: [geometry, material, count].
    // Passing undefined for geometry/material because they are supplied as child JSX.
    // onUpdate fires after the mesh is added to the scene, which is the correct time
    // to write instance matrices (the underlying buffers are allocated by then).
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, groups.length]}
      onUpdate={(m) => setup(m as InstancedMesh)}
    >
      {/* Octahedron detail=0 gives the classic 8-face diamond shape, cheap to render */}
      <octahedronGeometry args={[GROUP_RADIUS, 0]} />
      {/* meshStandardMaterial responds to scene lighting for depth cues */}
      <meshStandardMaterial color={GROUP_COLOR} />
    </instancedMesh>
  );
}
