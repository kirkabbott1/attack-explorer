// SoftwareConstellation.tsx
// Renders all MITRE ATT&CK software entries (malware + tools) as two InstancedMesh objects.
// Malware nodes are cubes (boxGeometry) in orange; tools are tetrahedrons in yellow.
// Both types are positioned in the deepest back-plane by the computeLayout function.
// Using two separate InstancedMeshes (one per shape) keeps each shape type as a single
// GPU draw call while allowing distinct geometry per software category.
//
// Filter-aware rendering: when a software filter is active, only explicitly-selected
// software entries render at full brightness; others are dimmed to ~8% brightness.
// When no software filter is active, all entries render at full brightness.
//
// The useEffect runs on mount AND on every filter/position change — replaces the old
// onUpdate-only setup so the scene updates reactively when the user changes filters.

import { useRef, useEffect } from 'react';
import { InstancedMesh, Object3D, Color } from 'three';
// ThreeEvent is the R3F wrapper around native pointer/mouse events with scene-graph context.
import { type ThreeEvent } from '@react-three/fiber';
import { useGraph, usePositions, useFilters, useHover, useSelection } from '@/lib/attack/context';
import { isAnyFilterActive, softwareMatches } from '@/lib/attack/filter';

// Orange distinguishes malware from purple groups and teal techniques.
const MALWARE_COLOR = '#fb923c';
// Yellow distinguishes tools from all other node types.
const TOOL_COLOR = '#facc15';
// Base size for both shapes — slightly smaller than groups to indicate relative hierarchy.
const SOFTWARE_SIZE = 1.0;

// Scale factors: matching nodes scale up slightly when filters are active to draw the eye.
const MATCH_SCALE = 1.2;
const NONMATCH_SCALE = 1.0;

/**
 * Renders all software (malware + tools) as two InstancedMeshes.
 * - Malware: box (cube) geometry in orange — common convention for destructive payloads.
 * - Tools: tetrahedron geometry in yellow — distinct angular silhouette for utility software.
 *
 * Uses useFilters() to reactively update node colors and scales whenever the filter state
 * changes. Non-matching nodes are dimmed to near-black instead of removed so the overall
 * constellation shape remains visible as spatial context.
 */
export default function SoftwareConstellation() {
  // DataLayer exposes getAllSoftware() — returns the full software array from the graph.
  const data = useGraph();
  // Map<nodeId, Vec3> produced by computeLayout — positions every node in world space.
  const positions = usePositions();
  // [filters, setFilters] — we only read filters here.
  const [filters] = useFilters();
  // [hoveredId, setHover] — we only write setHover here.
  const [, setHover] = useHover();
  // [focusId, setSelection] — we only write setSelection here.
  const [, setSelection] = useSelection();

  // Split all software into malware and tools for separate instanced meshes.
  const all = data.getAllSoftware();
  const malware = all.filter(s => s.type === 'malware');
  const tools = all.filter(s => s.type === 'tool');

  // Refs for direct imperative access in the useEffect update loop.
  const malwareMeshRef = useRef<InstancedMesh>(null!);
  const toolMeshRef = useRef<InstancedMesh>(null!);

  // Runs on mount and whenever filters, positions, malware list, or tools list change.
  // Updates every instance's matrix (position + scale) and color to reflect filter state.
  useEffect(() => {
    /**
     * Updates all instances in a given mesh to reflect the current filter state.
     * Matching nodes get full base color + MATCH_SCALE; non-matching get dim color + NONMATCH_SCALE.
     *
     * @param mesh         - The InstancedMesh to update (may be null before mount).
     * @param items        - The subset of Software objects assigned to this mesh.
     * @param baseColorHex - Full-brightness hex color for matching instances.
     */
    const update = (mesh: InstancedMesh | null, items: typeof all, baseColorHex: string) => {
      if (!mesh) return;
      const dummy = new Object3D();
      const base = new Color(baseColorHex);
      // ~8% intensity keeps non-matching nodes barely visible — perceptually near black.
      const dim = new Color(baseColorHex).multiplyScalar(0.08);
      const anyActive = isAnyFilterActive(filters);

      for (let i = 0; i < items.length; i++) {
        const pos = positions.get(items[i].id);
        // Skip any software entry that the layout function did not assign a position to.
        if (!pos) continue;

        // softwareMatches returns true for all entries when no software filter is active.
        const matches = !anyActive || softwareMatches(items[i], filters);

        dummy.position.set(pos.x, pos.y, pos.z);
        dummy.scale.setScalar(matches ? MATCH_SCALE : NONMATCH_SCALE);
        dummy.updateMatrix();

        // Write the 4x4 transformation matrix for this instance slot (position + scale).
        mesh.setMatrixAt(i, dummy.matrix);
        // Apply full or dimmed color based on match status.
        mesh.setColorAt?.(i, matches ? base : dim);
      }

      // Signal Three.js that the instance buffers have been written and need GPU upload.
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    update(malwareMeshRef.current, malware, MALWARE_COLOR);
    update(toolMeshRef.current, tools, TOOL_COLOR);
  }, [filters, positions, malware, tools]);

  // --- Pointer event handlers for malware instances ---
  // e.instanceId is the integer slot index in the InstancedMesh buffer — maps directly
  // to the index in the `malware` array since they share the same ordering.

  /** Set hover to the malware node under the pointer. stopPropagation prevents bubbling. */
  const onMalwareOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = malware[e.instanceId!]?.id;
    if (id) setHover(id);
  };

  /** Clear hover when the pointer leaves any malware instance. */
  const onMalwareOut = () => setHover(null);

  /** Set the selected (focused) node to the clicked malware entry. */
  const onMalwareClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = malware[e.instanceId!]?.id;
    if (id) setSelection(id);
  };

  // --- Pointer event handlers for tool instances ---
  // Same pattern, but indexing into the `tools` array.

  /** Set hover to the tool node under the pointer. */
  const onToolOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = tools[e.instanceId!]?.id;
    if (id) setHover(id);
  };

  /** Clear hover when the pointer leaves any tool instance. */
  const onToolOut = () => setHover(null);

  /** Set the selected (focused) node to the clicked tool entry. */
  const onToolClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = tools[e.instanceId!]?.id;
    if (id) setSelection(id);
  };

  return (
    <group>
      {/* Malware: box (cube) geometry — one draw call for all malware instances.
          Pointer handlers enable hover tooltip and click-to-select. */}
      <instancedMesh
        ref={malwareMeshRef}
        args={[undefined, undefined, malware.length]}
        onPointerOver={onMalwareOver}
        onPointerOut={onMalwareOut}
        onClick={onMalwareClick}
      >
        {/* Box with equal sides so it reads as a cube at any viewing angle */}
        <boxGeometry args={[SOFTWARE_SIZE, SOFTWARE_SIZE, SOFTWARE_SIZE]} />
        {/* meshBasicMaterial renders color flatly without lighting interaction — ensures
            the rendered orange matches exactly the hex value shown in the InfoPanel legend. */}
        <meshBasicMaterial color={MALWARE_COLOR} />
      </instancedMesh>

      {/* Tools: tetrahedron geometry — one draw call for all tool instances.
          Pointer handlers enable hover tooltip and click-to-select. */}
      <instancedMesh
        ref={toolMeshRef}
        args={[undefined, undefined, tools.length]}
        onPointerOver={onToolOver}
        onPointerOut={onToolOut}
        onClick={onToolClick}
      >
        {/* Tetrahedron detail=0 gives the minimal 4-face pyramid, cheap and distinctive */}
        <tetrahedronGeometry args={[SOFTWARE_SIZE * 1.1, 0]} />
        {/* meshBasicMaterial renders color flatly without lighting interaction — ensures
            the rendered yellow matches exactly the hex value shown in the InfoPanel legend. */}
        <meshBasicMaterial color={TOOL_COLOR} />
      </instancedMesh>
    </group>
  );
}
