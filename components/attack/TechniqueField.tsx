// TechniqueField.tsx
// Renders all techniques and sub-techniques in the ATT&CK 3D Explorer as instanced meshes.
//
// Two InstancedMesh objects are used — one for parent techniques and one for sub-techniques —
// so the GPU only needs one draw call per type rather than one draw call per individual node.
// This is critical for performance because ATT&CK v17 has ~700+ techniques and 400+ sub-techniques.
//
// Positions are set once at mount via the onUpdate callback (which fires after the mesh is
// placed in the scene). The layout is deterministic (computed once by lib/attack/layout.ts)
// so per-frame position updates are not needed.

import { useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, Color } from 'three';
import { useGraph, usePositions } from '@/lib/attack/context';

// Teal/cyan palette — parent techniques are brighter, sub-techniques are darker.
const TECHNIQUE_COLOR = '#9bfffd';
const SUBTECHNIQUE_COLOR = '#15d6d2';

// Sphere radii: parent techniques are larger so they visually dominate the field.
const TECHNIQUE_RADIUS = 1.5;
const SUBTECHNIQUE_RADIUS = 0.8;

/**
 * Renders all techniques (parents only) as one InstancedMesh and all sub-techniques as a
 * second InstancedMesh. One draw call per type instead of one per node.
 *
 * Uses useGraph() to access the DataLayer and usePositions() to get the 3D world positions
 * computed by computeLayout() in lib/attack/layout.ts.
 */
export default function TechniqueField() {
  // DataLayer accessor — provides getAllTechniques() which returns the full flat list.
  const data = useGraph();
  // Map from node ID (string) to Vec3 { x, y, z } world position.
  const positions = usePositions();

  // Fetch the full technique list once. getAllTechniques() returns a stable reference
  // from the DataLayer which is itself memoized on graph identity in the provider.
  const allTechniques = data.getAllTechniques();

  // Split into parents and sub-techniques so each group can be rendered separately.
  // Memoized on allTechniques reference — only rebuilds when the graph changes.
  const parents = useMemo(() => allTechniques.filter(t => !t.isSubtechnique), [allTechniques]);
  const subs = useMemo(() => allTechniques.filter(t => t.isSubtechnique), [allTechniques]);

  // Refs to the InstancedMesh objects so we can call setMatrixAt / setColorAt
  // imperatively after they mount, without triggering React re-renders.
  const parentMeshRef = useRef<InstancedMesh>(null!);
  const subMeshRef = useRef<InstancedMesh>(null!);

  /**
   * Sets the per-instance transform matrix and color for each item in the instanced mesh.
   *
   * Called via the onUpdate prop after the mesh is added to the scene. We use a dummy
   * Object3D to build the matrix (position only — no rotation or scale changes needed).
   *
   * @param mesh - The InstancedMesh to configure (may be null before mount).
   * @param items - The subset of Technique objects assigned to this mesh.
   * @param color - Hex color string applied uniformly to every instance in this mesh.
   */
  const setupInstances = (
    mesh: InstancedMesh | null,
    items: typeof parents,
    color: string
  ) => {
    if (!mesh) return;
    // Reusable Object3D used only to compute the transformation matrix per instance.
    const dummy = new Object3D();
    // Color is the same for all instances in a given mesh, so we create it once outside the loop.
    const col = new Color(color);

    for (let i = 0; i < items.length; i++) {
      // Look up the 3D position assigned by the layout algorithm for this technique id.
      const pos = positions.get(items[i].id);
      // Skip instances whose positions have not been computed (should not happen in practice
      // with a fully initialised layout, but we guard defensively).
      if (!pos) continue;

      // Apply position to the dummy and recompute its world matrix.
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.updateMatrix();

      // Write the per-instance transform into the instanced mesh's internal buffer.
      mesh.setMatrixAt(i, dummy.matrix);
      // setColorAt is optional (mesh.instanceColor may be null before first call) — use
      // optional chaining to avoid a crash if the geometry does not support per-instance color.
      mesh.setColorAt?.(i, col);
    }

    // Signal Three.js that the internal buffers are dirty and need to be uploaded to the GPU.
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  return (
    <group>
      {/*
        Parent technique instances.
        args = [geometry, material, count] — passing undefined for geometry and material
        because they are defined via child JSX (<sphereGeometry> and <meshStandardMaterial>).
        onUpdate fires after R3F attaches this mesh to the scene, giving us a valid ref.
      */}
      <instancedMesh
        ref={parentMeshRef}
        args={[undefined, undefined, parents.length]}
        onUpdate={(m) => setupInstances(m as InstancedMesh, parents, TECHNIQUE_COLOR)}
      >
        {/* Higher segment counts (12x12) keep parent spheres smooth at their larger radius. */}
        <sphereGeometry args={[TECHNIQUE_RADIUS, 12, 12]} />
        <meshStandardMaterial color={TECHNIQUE_COLOR} />
      </instancedMesh>

      {/*
        Sub-technique instances.
        Smaller radius and slightly lower segment count (10x10) — still smooth at this size,
        and slightly cheaper to rasterise given the larger quantity of sub-technique nodes.
      */}
      <instancedMesh
        ref={subMeshRef}
        args={[undefined, undefined, subs.length]}
        onUpdate={(m) => setupInstances(m as InstancedMesh, subs, SUBTECHNIQUE_COLOR)}
      >
        <sphereGeometry args={[SUBTECHNIQUE_RADIUS, 10, 10]} />
        <meshStandardMaterial color={SUBTECHNIQUE_COLOR} />
      </instancedMesh>
    </group>
  );
}
