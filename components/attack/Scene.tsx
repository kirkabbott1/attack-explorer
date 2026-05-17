// Scene.tsx
// Top-level React Three Fiber canvas for the ATT&CK 3D Explorer.
// Sets up the R3F Canvas with camera, lighting, and orbit controls, then mounts
// the subscene components. Additional subscenes (techniques, groups, software, edges)
// will be added incrementally as Phase 3 of the plan lands.
//
// Currently renders: tactics row only.

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import TacticsRow from './TacticsRow';

/**
 * Top-level R3F canvas for the ATT&CK Explorer. Hosts camera, lights, orbit controls,
 * and the subscenes for each entity type.
 *
 * Subscenes are added incrementally as Phase 3 lands. For now: tactics only.
 */
export default function Scene() {
  return (
    // Canvas: creates the WebGL renderer and R3F scene graph.
    //   - camera starts pulled back (z=130) and elevated (y=30) to see the full tactics row
    //   - dpr [1,2] caps pixel ratio at 2x to balance sharpness vs GPU cost
    //   - background matches the site's darkblue (#020818) so there is no flash on load
    <Canvas
      camera={{ position: [0, 30, 130], fov: 50, near: 0.1, far: 1000 }}
      dpr={[1, 2]}
      style={{ background: '#020818' }}
    >
      {/* Ambient light provides a soft base illumination across all surfaces */}
      <ambientLight intensity={0.6} />
      {/* Directional light from top-right simulates a distant sun, adds depth to meshes */}
      <directionalLight position={[50, 100, 50]} intensity={0.8} />
      {/* OrbitControls: enables mouse/touch rotate, pan, zoom with smooth damping.
          makeDefault registers the controls as the default for useThree().controls. */}
      <OrbitControls enableDamping makeDefault />
      {/* TacticsRow: renders all 14 ATT&CK tactic hexagonal nodes with labels */}
      <TacticsRow />
    </Canvas>
  );
}
