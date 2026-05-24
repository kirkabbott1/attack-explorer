import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { usePositions, useSelection } from '@/lib/attack/context';
import { readCameraFitVersion } from '@/lib/attack/cameraCoordinator';
import type * as THREE from 'three';

// How long the camera tween animation takes in milliseconds.
const TWEEN_DURATION_MS = 400;

// Fixed offset from the target node so the camera ends up in front and above it.
const CAMERA_OFFSET = new Vector3(0, 10, 40);

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

  // When focusId changes, capture the current controls target and set the new destination,
  // then kick off the tween by recording the start timestamp.
  useEffect(() => {
    if (!focusId || !controls) return;
    const p = positions.get(focusId);
    if (!p) return;
    // Capture current camera target as the start of the tween.
    fromTarget.current.copy(controls.target);
    // Set destination to the selected node's position.
    toTarget.current.set(p.x, p.y, p.z);
    // Capture the camera-fit version at tween start so we can detect later
    // whether a fit happened mid-tween and abort.
    fitVersionAtTweenStart.current = readCameraFitVersion();
    // Record the tween start time.
    tweenStart.current = performance.now();
  }, [focusId, positions, controls]);

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
    const desiredCamPos = toTarget.current.clone().add(CAMERA_OFFSET);
    const fromCam = fromTarget.current.clone().add(CAMERA_OFFSET);
    camera.position.lerpVectors(fromCam, desiredCamPos, eased);

    // Sync the OrbitControls internal state after we mutate target/position.
    controls.update();

    // Once the tween is done, stop updating every frame.
    if (t >= 1) tweenStart.current = null;
  });

  // This component has no visual output -- it only drives the camera via side effects.
  return null;
}
