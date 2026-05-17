// Edges.tsx
// Renders line segments in the 3D scene connecting the currently-focused node to its
// direct relationships. Only draws edges when a node is selected — the scene stays
// clean by default and shows relationships only in context.
//
// Uses Three.js BufferGeometry + lineSegments (R3F JSX) rather than a higher-level
// abstraction so we have full control over the vertex data and can rebuild the
// geometry cheaply when focusId changes.

import { useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { useGraph, usePositions, useSelection } from '@/lib/attack/context';

// Cyan teal color matching the site's lightteal design token.
const EDGE_COLOR = '#3ffefb';

/**
 * Renders line segments for edges involving the currently-selected node:
 *   - selected technique -> its parent tactic
 *   - selected technique -> its parent technique (if it's a sub-technique)
 *   - selected technique -> its sub-techniques (if it's a parent)
 *   - selected group -> all techniques it uses
 *   - selected software -> all techniques it uses
 *
 * No edges render if nothing is selected. This keeps the scene clean by default and
 * only shows relationships in context.
 *
 * Geometry is rebuilt inside useMemo whenever focusId, data, or positions change.
 * Each pair of points encodes one line segment: [x0,y0,z0, x1,y1,z1, ...].
 */
export default function Edges() {
  // data: DataLayer accessor for O(1) graph lookups
  // positions: Map<nodeId, Vec3> of world positions computed by layout
  // focusId: currently selected node id, or null when nothing is selected
  const data = useGraph();
  const positions = usePositions();
  const [focusId] = useSelection();

  // Build a BufferGeometry containing one line segment per relationship edge.
  // Returns null when nothing is selected or when the focused node has no
  // resolvable target positions — avoids rendering an empty lineSegments object.
  const geometry = useMemo(() => {
    // Nothing selected: bail early, no edges to draw.
    if (!focusId) return null;

    // Focused node must have a known world position to be an edge source.
    const focusPos = positions.get(focusId);
    if (!focusPos) return null;

    // Determine which entity type the focused node represents and collect
    // the IDs of all nodes it should be connected to.
    const tech = data.getTechnique(focusId);
    const group = data.getGroup(focusId);
    const software = data.getSoftware(focusId);

    const targets: string[] = [];

    if (tech) {
      // Connect technique to each of its parent tactics (usually one, sometimes more).
      targets.push(...tech.tacticIds);

      // If this is a sub-technique, also connect to its parent technique.
      if (tech.parentId) targets.push(tech.parentId);

      // If this is a parent technique, fan out to all of its sub-techniques.
      if (!tech.isSubtechnique) {
        for (const sub of data.getSubtechniquesOf(tech.id)) {
          targets.push(sub.id);
        }
      }
    } else if (group) {
      // Group -> all techniques it uses.
      targets.push(...group.techniqueIds);
    } else if (software) {
      // Software -> all techniques it uses.
      targets.push(...software.techniqueIds);
    }

    // Build the flat vertex array: each segment is two consecutive Vec3 values.
    // Skip any target whose position is not in the layout map (defensive — the
    // layout should cover every node but guards against schema mismatches).
    const points: number[] = [];
    for (const tid of targets) {
      const p = positions.get(tid);
      if (!p) continue;
      // Push source vertex then target vertex for this segment.
      points.push(focusPos.x, focusPos.y, focusPos.z, p.x, p.y, p.z);
    }

    // If every target resolved to a missing position, there's nothing to draw.
    if (points.length === 0) return null;

    // Construct a BufferGeometry with a single interleaved position attribute.
    // itemSize=3 means each vertex consumes 3 floats (x, y, z).
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(points, 3));
    return g;
  }, [focusId, data, positions]);

  // No geometry means no selection or no resolvable edges — render nothing.
  if (!geometry) return null;

  // lineSegments interprets the position buffer as sequential pairs of vertices,
  // each pair forming one line segment — exactly what we built above.
  return (
    <lineSegments geometry={geometry}>
      {/* lineBasicMaterial: flat, unlit line color. transparent + opacity gives
          a subtle glow effect without a post-processing pass. */}
      <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.6} />
    </lineSegments>
  );
}
