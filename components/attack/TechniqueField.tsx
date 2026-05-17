// TechniqueField.tsx
// Renders all techniques and sub-techniques in the ATT&CK 3D Explorer as instanced meshes.
//
// Two InstancedMesh objects are used — one for parent techniques and one for sub-techniques —
// so the GPU only needs one draw call per type rather than one draw call per individual node.
// This is critical for performance because ATT&CK v17 has ~700+ techniques and 400+ sub-techniques.
//
// Filter-aware rendering: when filters are active, non-matching nodes are dimmed to ~8% brightness
// (near-black) rather than made transparent. Three.js InstancedMesh does not support per-instance
// opacity, so we encode the "dim" state by scaling the base color toward black via multiplyScalar.
// Matching nodes are also scaled up slightly (MATCH_SCALE) to visually pop against the dim field.
//
// The useEffect runs on mount AND on every filter/position change — this replaces the old
// onUpdate-only approach and ensures the scene updates reactively when filters change.

import { useMemo, useRef, useEffect } from 'react';
import { InstancedMesh, Object3D, Color } from 'three';
import { useGraph, usePositions, useFilters } from '@/lib/attack/context';
import { isAnyFilterActive, techniqueMatches } from '@/lib/attack/filter';

// Teal/cyan palette — parent techniques are brighter, sub-techniques are darker.
const TECHNIQUE_COLOR = '#9bfffd';
const SUBTECHNIQUE_COLOR = '#15d6d2';

// Sphere radii: parent techniques are larger so they visually dominate the field.
const TECHNIQUE_RADIUS = 1.5;
const SUBTECHNIQUE_RADIUS = 0.8;

// Scale factors: matching nodes scale up slightly when filters are active to draw the eye.
const MATCH_SCALE = 1.2;
const NONMATCH_SCALE = 1.0;

/**
 * Renders all techniques (parents only) as one InstancedMesh and all sub-techniques as a
 * second InstancedMesh. One draw call per type instead of one per node.
 *
 * Uses useGraph() to access the DataLayer and usePositions() to get the 3D world positions
 * computed by computeLayout() in lib/attack/layout.ts. Uses useFilters() to reactively
 * update node colors and scales whenever the filter state changes.
 */
export default function TechniqueField() {
  // DataLayer accessor — provides getAllTechniques() and lookup methods for filter evaluation.
  const data = useGraph();
  // Map from node ID (string) to Vec3 { x, y, z } world position.
  const positions = usePositions();
  // [filters, setFilters] — we only read filters here; setFilters is unused.
  const [filters] = useFilters();

  // Fetch the full technique list once. getAllTechniques() returns a stable reference
  // from the DataLayer which is itself memoized on graph identity in the provider.
  const allTechniques = data.getAllTechniques();

  // Split into parents and sub-techniques so each group can be rendered separately.
  // Memoized on allTechniques reference — only rebuilds when the graph changes.
  const parents = useMemo(() => allTechniques.filter(t => !t.isSubtechnique), [allTechniques]);
  const subs = useMemo(() => allTechniques.filter(t => t.isSubtechnique), [allTechniques]);

  // Refs to the InstancedMesh objects so we can call setMatrixAt / setColorAt
  // imperatively in the effect, without triggering React re-renders.
  const parentMeshRef = useRef<InstancedMesh>(null!);
  const subMeshRef = useRef<InstancedMesh>(null!);

  // Mount-time + filter-change combined update. Three.js InstancedMesh doesn't directly
  // support per-instance opacity, so we encode the "dim" state as a color scaled toward
  // black. Layout stays stable; only color and scale change when filters update.
  useEffect(() => {
    /**
     * Updates all instances in a given mesh to reflect the current filter state.
     * Matching nodes get full base color + MATCH_SCALE; non-matching get dim color + NONMATCH_SCALE.
     *
     * @param mesh         - The InstancedMesh to update (may be null before mount).
     * @param items        - The subset of Technique objects assigned to this mesh.
     * @param baseColorHex - Full-brightness hex color for matching instances.
     */
    const update = (mesh: InstancedMesh | null, items: typeof parents, baseColorHex: string) => {
      if (!mesh) return;
      const dummy = new Object3D();
      const base = new Color(baseColorHex);
      // ~8% intensity keeps non-matching nodes barely visible — perceptually near black.
      const dim = new Color(baseColorHex).multiplyScalar(0.08);
      const anyActive = isAnyFilterActive(filters);

      for (let i = 0; i < items.length; i++) {
        // Look up the 3D position assigned by the layout algorithm for this technique id.
        const pos = positions.get(items[i].id);
        // Skip instances whose positions have not been computed (defensive guard).
        if (!pos) continue;

        // Determine whether this technique passes all active filter dimensions.
        const matches = !anyActive || techniqueMatches(items[i], filters, data);

        // Apply position and scale to the dummy, then compute its matrix.
        dummy.position.set(pos.x, pos.y, pos.z);
        dummy.scale.setScalar(matches ? MATCH_SCALE : NONMATCH_SCALE);
        dummy.updateMatrix();

        // Write the per-instance transform into the instanced mesh's internal buffer.
        mesh.setMatrixAt(i, dummy.matrix);
        // Apply full or dimmed color based on match status.
        mesh.setColorAt?.(i, matches ? base : dim);
      }

      // Signal Three.js that the internal buffers are dirty and need GPU upload.
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    update(parentMeshRef.current, parents, TECHNIQUE_COLOR);
    update(subMeshRef.current, subs, SUBTECHNIQUE_COLOR);
  }, [filters, positions, parents, subs, data]);

  return (
    <group>
      {/*
        Parent technique instances.
        args = [geometry, material, count] — passing undefined for geometry and material
        because they are defined via child JSX (<sphereGeometry> and <meshStandardMaterial>).
      */}
      <instancedMesh ref={parentMeshRef} args={[undefined, undefined, parents.length]}>
        {/* Higher segment counts (12x12) keep parent spheres smooth at their larger radius. */}
        <sphereGeometry args={[TECHNIQUE_RADIUS, 12, 12]} />
        <meshStandardMaterial color={TECHNIQUE_COLOR} />
      </instancedMesh>

      {/*
        Sub-technique instances.
        Smaller radius and slightly lower segment count (10x10) — still smooth at this size,
        and slightly cheaper to rasterise given the larger quantity of sub-technique nodes.
      */}
      <instancedMesh ref={subMeshRef} args={[undefined, undefined, subs.length]}>
        <sphereGeometry args={[SUBTECHNIQUE_RADIUS, 10, 10]} />
        <meshStandardMaterial color={SUBTECHNIQUE_COLOR} />
      </instancedMesh>
    </group>
  );
}
