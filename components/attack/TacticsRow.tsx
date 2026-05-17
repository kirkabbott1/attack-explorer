// TacticsRow.tsx
// Renders the 14 ATT&CK tactic nodes as flat hexagonal-ish cylinder meshes in a row
// at the top of the 3D scene, with always-visible HTML labels below each node.
// Reads position data from the AttackContext via usePositions and node data via useGraph.

import { Html } from '@react-three/drei';
import { useGraph, usePositions } from '@/lib/attack/context';

// medteal from the site palette — gives the tactic nodes a distinctive cyan glow
const TACTIC_COLOR = '#3ffefb';

/**
 * Renders the 14 ATT&CK tactic nodes as flat hexagonal-ish shapes in a row at the top of the
 * scene, with always-visible HTML labels below each.
 */
export default function TacticsRow() {
  // DataLayer accessor for querying all tactics from the loaded graph
  const data = useGraph();
  // Map from node ID to Vec3 world position computed by computeLayout
  const positions = usePositions();
  // Array of all tactic nodes in the graph (typically 14 for ATT&CK Enterprise)
  const tactics = data.getAllTactics();

  return (
    <group>
      {tactics.map(t => {
        // Look up the pre-computed 3D position for this tactic node
        const pos = positions.get(t.id);
        // Skip if the layout hasn't assigned a position (should not happen in practice)
        if (!pos) return null;
        return (
          // Group positions the mesh and label together in world space
          <group key={t.id} position={[pos.x, pos.y, pos.z]}>
            {/* Flat hexagonal disc: radius 4, height 1, 6 radial segments */}
            <mesh>
              <cylinderGeometry args={[4, 4, 1, 6]} />
              {/* emissive matches base color so the disc glows even with low ambient light */}
              <meshStandardMaterial color={TACTIC_COLOR} emissive={TACTIC_COLOR} emissiveIntensity={0.4} />
            </mesh>
            {/* HTML overlay: always faces the camera, scales with distance via distanceFactor */}
            <Html
              center
              distanceFactor={120}
              position={[0, -8, 0]}
              style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
            >
              <div style={{ color: '#9bfffd', fontSize: '14px', fontWeight: 600, textShadow: '0 0 4px #020818' }}>
                {t.name}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
