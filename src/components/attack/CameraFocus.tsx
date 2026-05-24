import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { usePositions, useSelection } from '@/lib/attack/context';
import { readCameraFitVersion } from '@/lib/attack/cameraCoordinator';
import { useIsMobile } from '@/lib/attack/useIsMobile';
import type * as THREE from 'three';

// How long the camera tween animation takes in milliseconds.
const TWEEN_DURATION_MS = 400;

// Desktop offset from the orbit target to the camera. The camera sits 10
// units above and 40 units in front of whatever controls.target points at,
// so the focused node renders at the camera view-center on desktop.
const CAMERA_OFFSET_DESKTOP = new Vector3(0, 10, 40);

// On mobile, the bottom sheet covers the lower 60vh of the canvas — viewport
// center is behind it. We shift the lookAt point 12 world units below the
// focused node, then raise the camera by the same amount so the node ends up
// in the upper portion of the visible 40vh strip instead of at viewport
// center. See the design rationale in fix/mobile-focus-framing-and-hint commit.
const CAMERA_OFFSET_MOBILE = new Vector3(0, 22, 40);
const MOBILE_TARGET_Y_OFFSET = 12;

/**
 * When the selected node changes, smoothly animate the camera target to that node's
 * position. Uses lerp over TWEEN_DURATION_MS. Orbit controls remain interactive
 * after the tween settles.
 *
 * This component must live inside a R3F Canvas so it can access useThree() and useFrame().
 * It renders nothing -- it is purely a side-effect component.
 */
export default function CameraFocus() {
  // useThree gives us the camera and the registered OrbitControls instance (via makeDefault).
  const { camera, controls } = useThree() as {
    camera: THREE.Camera;
    controls: { target: Vector3; update: () => void } | null;
  };

  // Map of nodeId -> {x, y, z} so we can look up the world position for the selected node.
  const positions = usePositions();

  // focusId is the currently selected node id (or null if nothing is selected).
  const [focusId] = useSelection();

  // Picks which target-offset and camera-offset apply this render. We capture
  // these into the tween destinations at useEffect time so a mid-tween
  // orientation change does not retarget the camera (the cameraCoordinator
  // version-check already cancels tweens on real fits — see CameraFocus
  // tween/fit race fix).
  const isMobile = useIsMobile();

  // Timestamp (performance.now()) when the current tween started; null when idle.
  const tweenStart = useRef<number | null>(null);

  // The orbit-controls target position at the moment the tween starts.
  const fromTarget = useRef<Vector3>(new Vector3());

  // The destination orbit-controls target position (the selected node's world position).
  const toTarget = useRef<Vector3>(new Vector3());

  // Snapshot of the cameraCoordinator version at the moment the current tween
  // started. Compared against the live version on every frame so an external
  // snap (FitCameraToViewport on device rotation) cancels the tween instead
  // of fighting it frame-by-frame.
  const fitVersionAtTweenStart = useRef<number>(0);

  // Snapshot of which camera offset to use across the lifetime of the current
  // tween. Captured at useEffect time so a mid-tween viewport resize (which
  // would flip isMobile) doesn't change the camera trajectory mid-flight.
  const offsetForTween = useRef<Vector3>(CAMERA_OFFSET_DESKTOP);

  // When focusId changes, capture the current controls target and set the new destination,
  // then kick off the tween by recording the start timestamp.
  useEffect(() => {
    if (!focusId || !controls) return;
    const p = positions.get(focusId);
    if (!p) return;
    // Capture current camera target as the start of the tween.
    fromTarget.current.copy(controls.target);
    // On mobile, lower the orbit target by MOBILE_TARGET_Y_OFFSET so the focused
    // node renders above the bottom sheet rather than behind it. On desktop the
    // target equals the node position exactly.
    const targetYOffset = isMobile ? MOBILE_TARGET_Y_OFFSET : 0;
    toTarget.current.set(p.x, p.y - targetYOffset, p.z);
    // Pick which offset applies based on the live viewport, lock it in for
    // the lifetime of this tween.
    offsetForTween.current = isMobile ? CAMERA_OFFSET_MOBILE : CAMERA_OFFSET_DESKTOP;
    // Capture the camera-fit version at tween start so we can detect later
    // whether a fit happened mid-tween and abort.
    fitVersionAtTweenStart.current = readCameraFitVersion();
    // Record the tween start time.
    tweenStart.current = performance.now();
  }, [focusId, positions, controls, isMobile]);

  // Each frame: advance the tween. Uses a cubic ease-out for a natural deceleration feel.
  useFrame(() => {
    if (tweenStart.current === null || !controls) return;

    // Cancel the tween if a camera fit (viewport snap) happened since the
    // tween started. Without this, the per-frame lerp below would overwrite
    // the fit on every frame, producing visible camera judder during rotation.
    if (readCameraFitVersion() !== fitVersionAtTweenStart.current) {
      tweenStart.current = null;
      return;
    }

    // t ranges 0 -> 1 over TWEEN_DURATION_MS milliseconds.
    const t = Math.min(1, (performance.now() - tweenStart.current) / TWEEN_DURATION_MS);

    // Cubic ease-out: starts fast, slows at the end.
    const eased = 1 - Math.pow(1 - t, 3);

    // Lerp the orbit-controls target from old position to new node position.
    controls.target.lerpVectors(fromTarget.current, toTarget.current, eased);

    // Lerp the camera position in parallel so it tracks the target with the same offset.
    const desiredCamPos = toTarget.current.clone().add(offsetForTween.current);
    const fromCam = fromTarget.current.clone().add(offsetForTween.current);
    camera.position.lerpVectors(fromCam, desiredCamPos, eased);

    // Sync the OrbitControls internal state after we mutate target/position.
    controls.update();

    // Once the tween is done, stop updating every frame.
    if (t >= 1) tweenStart.current = null;
  });

  // This component has no visual output -- it only drives the camera via side effects.
  return null;
}
