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
// ThreeEvent is the R3F wrapper around native pointer/mouse events.
// It adds scene-graph context (instanceId, object, intersections, etc.) to the raw DOM event.
import { type ThreeEvent } from '@react-three/fiber';
import { useGraph, usePositions, useFilters, useHover, useSelection, useCoverage } from '@/lib/attack/context';
import { isAnyFilterActive, techniqueMatches } from '@/lib/attack/filter';
import { colorForScore, DEFAULT_GRADIENT, NEUTRAL_NOT_IN_LAYER, type NavigatorGradient } from '@/lib/attack/layer';

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
  // [hoveredId, setHover] — we only write setHover here.
  const [, setHover] = useHover();
  // [focusId, setSelection] — we only write setSelection here.
  const [, setSelection] = useSelection();
  // [coverage, setCoverage] — we only read coverage here to drive per-instance overlay coloring.
  const [coverage] = useCoverage();

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
      // Color applied to techniques that exist in the graph but are absent from the loaded layer.
      const notInLayer = new Color(NEUTRAL_NOT_IN_LAYER);
      const anyActive = isAnyFilterActive(filters);
      // overlay is true when a layer is loaded and the coverage view toggle is enabled.
      const overlay = coverage.viewActive && coverage.layer !== null;
      // Use the layer's custom gradient if present, otherwise fall back to the ATT&CK default.
      const gradient: NavigatorGradient = coverage.layer?.gradient ?? DEFAULT_GRADIENT;

      for (let i = 0; i < items.length; i++) {
        // Look up the 3D position assigned by the layout algorithm for this technique id.
        const pos = positions.get(items[i].id);
        // Skip instances whose positions have not been computed (defensive guard).
        if (!pos) continue;

        // Determine whether this technique passes all active filter dimensions.
        const matches = !anyActive || techniqueMatches(items[i], filters, data);

        // Resolve the per-instance color based on filter status and coverage overlay state.
        let instanceColor: Color;
        if (!matches) {
          // Filtered-out nodes stay dim regardless of coverage mode.
          instanceColor = dim;
        } else if (overlay) {
          // Coverage overlay is active: color by the layer entry for this technique.
          const entry = coverage.byTechniqueId.get(items[i].id);
          if (entry?.color) {
            // Layer provided an explicit hex color — use it directly.
            instanceColor = new Color(entry.color);
          } else if (entry?.score !== undefined) {
            // Layer provided a numeric score — map through the gradient to get a hex.
            instanceColor = new Color(colorForScore(entry.score, gradient));
          } else {
            // Technique is not referenced in the layer — render as neutral grey.
            instanceColor = notInLayer;
          }
        } else {
          // No overlay: render with the default teal base color.
          instanceColor = base;
        }

        // Apply position and scale to the dummy, then compute its matrix.
        dummy.position.set(pos.x, pos.y, pos.z);
        dummy.scale.setScalar(matches ? MATCH_SCALE : NONMATCH_SCALE);
        dummy.updateMatrix();

        // Write the per-instance transform into the instanced mesh's internal buffer.
        mesh.setMatrixAt(i, dummy.matrix);
        // Apply the resolved color for this instance.
        mesh.setColorAt?.(i, instanceColor);
      }

      // Signal Three.js that the internal buffers are dirty and need GPU upload.
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    update(parentMeshRef.current, parents, TECHNIQUE_COLOR);
    update(subMeshRef.current, subs, SUBTECHNIQUE_COLOR);
  }, [filters, positions, parents, subs, data, coverage]);

  // --- Pointer event handlers for parent technique instances ---
  // e.instanceId is the integer slot index in the InstancedMesh buffer — maps directly
  // to the index in the `parents` array since they share the same ordering.

  /** Set hover to the parent technique under the pointer. stopPropagation prevents
   *  the event from bubbling to the sub-technique mesh or the canvas background. */
  const onParentOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = parents[e.instanceId!]?.id;
    if (id) setHover(id);
  };

  /** Clear hover when the pointer leaves any parent technique instance. */
  const onParentOut = () => setHover(null);

  /** Set the selected (focused) node to the clicked parent technique. */
  const onParentClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = parents[e.instanceId!]?.id;
    if (id) setSelection(id);
  };

  // --- Pointer event handlers for sub-technique instances ---
  // Same logic, but indexing into the `subs` array instead.

  /** Set hover to the sub-technique under the pointer. */
  const onSubOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = subs[e.instanceId!]?.id;
    if (id) setHover(id);
  };

  /** Clear hover when the pointer leaves any sub-technique instance. */
  const onSubOut = () => setHover(null);

  /** Set the selected (focused) node to the clicked sub-technique. */
  const onSubClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = subs[e.instanceId!]?.id;
    if (id) setSelection(id);
  };

  return (
    <group>
      {/*
        Parent technique instances.
        args = [geometry, material, count] — passing undefined for geometry and material
        because they are defined via child JSX (<sphereGeometry> and <meshBasicMaterial>).
        meshBasicMaterial renders colors flatly (no lighting interaction), which ensures
        the rendered teal matches exactly the hex values shown in the InfoPanel legend.
        Pointer handlers enable hover tooltip and click-to-select.
      */}
      <instancedMesh
        ref={parentMeshRef}
        args={[undefined, undefined, parents.length]}
        onPointerOver={onParentOver}
        onPointerOut={onParentOut}
        onClick={onParentClick}
      >
        {/* Higher segment counts (12x12) keep parent spheres smooth at their larger radius. */}
        <sphereGeometry args={[TECHNIQUE_RADIUS, 12, 12]} />
        <meshBasicMaterial color={TECHNIQUE_COLOR} />
      </instancedMesh>

      {/*
        Sub-technique instances.
        Smaller radius and slightly lower segment count (10x10) — still smooth at this size,
        and slightly cheaper to rasterise given the larger quantity of sub-technique nodes.
        meshBasicMaterial used here for the same reason as parent techniques — flat color
        rendering so legend colors match exactly what appears in the 3D scene.
        Pointer handlers enable hover tooltip and click-to-select.
      */}
      <instancedMesh
        ref={subMeshRef}
        args={[undefined, undefined, subs.length]}
        onPointerOver={onSubOver}
        onPointerOut={onSubOut}
        onClick={onSubClick}
      >
        <sphereGeometry args={[SUBTECHNIQUE_RADIUS, 10, 10]} />
        <meshBasicMaterial color={SUBTECHNIQUE_COLOR} />
      </instancedMesh>
    </group>
  );
}
