// FitCameraToViewport.tsx
// Render-null R3F child that repositions the perspective camera so the full
// ATT&CK scene fits horizontally regardless of viewport aspect ratio.
//
// Why: the Canvas in Scene.tsx ships a fixed camera at z=130 tuned for 16:9
// desktops. On portrait phone viewports the horizontal FOV collapses to ~26%
// of desktop, clipping the tactics row, group constellation, and software
// constellation off-screen — only the central technique dot cluster survives.
// This component reads the live viewport size from R3F and adjusts camera.z
// when the aspect ratio changes. Desktop landscape viewports are unaffected
// because cameraZForAspect clamps to the legacy distance of 130 for wide aspects.
//
// IMPORTANT: setting camera.position alone is not enough. OrbitControls keeps
// the camera's lookAt direction in sync with its internal spherical coordinates
// relative to controls.target. Without calling controls.update(), the camera
// keeps its OLD lookAt orientation (computed at the original z=130) and at the
// new larger Z it no longer points at the scene origin — projecting the graph
// off-center to the side. See CameraFocus.tsx:76 for the same pattern.

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { cameraZForAspect, DEFAULT_FOV } from '@/lib/attack/cameraFit';

/**
 * Adjusts the camera Z based on viewport aspect so the scene fits on narrow
 * viewports. Runs on mount and on resize/rotation. Mid-session orbit moves
 * are preserved because the effect only fires on real aspect changes.
 */
export default function FitCameraToViewport() {
  // Destructure camera, size, and controls from R3F's reactive store. controls
  // is populated by the <OrbitControls makeDefault /> sibling rendered earlier
  // in Scene.tsx. We need controls so we can update its internal state after
  // mutating camera.position.
  const { camera, size, controls } = useThree() as {
    camera: THREE.Camera & { fov?: number; lookAt: (x: number, y: number, z: number) => void; updateProjectionMatrix: () => void };
    size: { width: number; height: number };
    controls: { target: THREE.Vector3; update: () => void } | null;
  };

  // Track the last aspect ratio we applied so we don't re-write camera.position
  // on every render — only on real viewport changes.
  const lastAspectRef = useRef<number | null>(null);

  useEffect(() => {
    // Guard against the initial 0x0 size that R3F briefly emits during mount.
    if (!size || size.width === 0 || size.height === 0) return;

    const aspect = size.width / size.height;
    if (lastAspectRef.current !== null && Math.abs(aspect - lastAspectRef.current) < 0.01) {
      return;
    }
    lastAspectRef.current = aspect;

    const fov = typeof camera.fov === 'number' ? camera.fov : DEFAULT_FOV;
    const z = cameraZForAspect(aspect, fov);

    // 1. Move the camera back along Z to fit the scene horizontally.
    //    x=0, y=30 matches the legacy framing from Scene.tsx Canvas camera prop.
    camera.position.set(0, 30, z);
    // 2. Force the camera to face the origin (where controls.target lives by
    //    default). Without this, the camera retains the lookAt orientation
    //    it had at the previous Z, projecting the scene off-center.
    camera.lookAt(0, 0, 0);
    // 3. Update the projection matrix after position changes.
    camera.updateProjectionMatrix();
    // 4. Sync OrbitControls' internal spherical coords with the new camera
    //    position+orientation so future pinch-zoom / orbit moves start from
    //    the correct baseline instead of the stale pre-fit state.
    if (controls) controls.update();
  }, [camera, size.width, size.height, controls]);

  return null;
}
