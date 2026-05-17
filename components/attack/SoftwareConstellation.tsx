// SoftwareConstellation.tsx
// Renders all MITRE ATT&CK software entries (malware + tools) as two InstancedMesh objects.
// Malware nodes are cubes (boxGeometry) in orange; tools are tetrahedrons in yellow.
// Both types are positioned in the deepest back-plane by the computeLayout function.
// Using two separate InstancedMeshes (one per shape) keeps each shape type as a single
// GPU draw call while allowing distinct geometry per software category.

import { useRef } from 'react';
import { InstancedMesh, Object3D, Color } from 'three';
import { useGraph, usePositions } from '@/lib/attack/context';
import type { Software } from '@/lib/attack/types';

// Orange distinguishes malware from purple groups and teal techniques.
const MALWARE_COLOR = '#fb923c';
// Yellow distinguishes tools from all other node types.
const TOOL_COLOR = '#facc15';
// Base size for both shapes — slightly smaller than groups to indicate relative hierarchy.
const SOFTWARE_SIZE = 1.0;

/**
 * Renders all software (malware + tools) as two InstancedMeshes.
 * - Malware: box (cube) geometry in orange — common convention for destructive payloads.
 * - Tools: tetrahedron geometry in yellow — distinct angular silhouette for utility software.
 *
 * Both mesh types use R3F's onUpdate callback to write per-instance matrices and colors
 * once on mount. Nodes without a computed position (layout gap) are silently skipped.
 */
export default function SoftwareConstellation() {
  // DataLayer exposes getAllSoftware() — returns the full software array from the graph.
  const data = useGraph();
  // Map<nodeId, Vec3> produced by computeLayout — positions every node in world space.
  const positions = usePositions();

  // Split all software into malware and tools for separate instanced meshes.
  const all = data.getAllSoftware();
  const malware = all.filter((s) => s.type === 'malware');
  const tools = all.filter((s) => s.type === 'tool');

  // Refs are kept for future imperative access (e.g. pointer-based interactions).
  const malwareMeshRef = useRef<InstancedMesh>(null!);
  const toolMeshRef = useRef<InstancedMesh>(null!);

  /**
   * setup() is called by R3F's onUpdate once an InstancedMesh is created.
   * It writes a world-space transformation matrix and uniform color for each instance.
   *
   * @param mesh   - The InstancedMesh whose buffers to populate.
   * @param items  - Subset of software items assigned to this mesh (malware or tools).
   * @param color  - Hex color string applied uniformly to every instance in this mesh.
   */
  const setup = (mesh: InstancedMesh, items: Software[], color: string) => {
    // Reusable dummy Object3D — avoids allocating one object per item in the loop.
    const dummy = new Object3D();
    const col = new Color(color);

    for (let i = 0; i < items.length; i++) {
      const pos = positions.get(items[i].id);
      // Skip any software entry that the layout function did not assign a position to.
      if (!pos) continue;

      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.updateMatrix();

      // Write the 4x4 transformation matrix for this instance slot (position only).
      mesh.setMatrixAt(i, dummy.matrix);
      // setColorAt is optional on older Three.js builds — guard with optional call.
      mesh.setColorAt?.(i, col);
    }

    // Signal Three.js that the instance buffers have been written and need GPU upload.
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  return (
    <group>
      {/* Malware: box (cube) geometry — one draw call for all malware instances */}
      <instancedMesh
        ref={malwareMeshRef}
        args={[undefined, undefined, malware.length]}
        onUpdate={(m) => setup(m as InstancedMesh, malware, MALWARE_COLOR)}
      >
        {/* Box with equal sides so it reads as a cube at any viewing angle */}
        <boxGeometry args={[SOFTWARE_SIZE, SOFTWARE_SIZE, SOFTWARE_SIZE]} />
        {/* meshStandardMaterial responds to scene lighting for consistent depth cues */}
        <meshStandardMaterial color={MALWARE_COLOR} />
      </instancedMesh>

      {/* Tools: tetrahedron geometry — one draw call for all tool instances */}
      <instancedMesh
        ref={toolMeshRef}
        args={[undefined, undefined, tools.length]}
        onUpdate={(m) => setup(m as InstancedMesh, tools, TOOL_COLOR)}
      >
        {/* Tetrahedron detail=0 gives the minimal 4-face pyramid, cheap and distinctive */}
        <tetrahedronGeometry args={[SOFTWARE_SIZE * 1.1, 0]} />
        <meshStandardMaterial color={TOOL_COLOR} />
      </instancedMesh>
    </group>
  );
}
