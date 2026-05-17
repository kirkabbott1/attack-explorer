import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * ShiftPanModifier: a render-null component that lives inside the R3F Canvas.
 *
 * Adds Shift+drag as an alternate "pan the scene" binding to OrbitControls.
 *
 * How it works:
 *   OrbitControls reads `mouseButtons.LEFT` at mousedown time to decide whether
 *   a left-drag should orbit or pan. We listen for keydown/keyup on the window
 *   and swap that property between THREE.MOUSE.PAN (shift held) and
 *   THREE.MOUSE.ROTATE (default). The change takes effect on the next mousedown,
 *   so there is no need to interrupt an in-progress drag.
 *
 *   The blur handler restores the default in case the user tabs away while
 *   Shift is held, so the control does not get stuck in pan mode.
 *
 * Prerequisites:
 *   - <OrbitControls makeDefault /> must be rendered before this component so
 *     that useThree().controls is populated by the time the effect runs.
 *   - Right-click+drag pan (the default OrbitControls binding) is unaffected.
 */
export default function ShiftPanModifier() {
  // drei <OrbitControls makeDefault /> registers itself in the useThree controls slot.
  // We cast to a minimal shape rather than importing OrbitControls type to avoid
  // pulling in @types/three internals beyond what is already in scope.
  const controls = useThree((state) => state.controls) as
    | { mouseButtons: { LEFT: THREE.MOUSE | null; MIDDLE: THREE.MOUSE | null; RIGHT: THREE.MOUSE | null } }
    | null;

  useEffect(() => {
    // Controls may not be ready on first render if this component mounts before
    // OrbitControls completes its own useEffect. Return early and let React
    // re-run this effect when controls becomes non-null.
    if (!controls) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Switch left-drag to PAN mode while Shift is held.
      if (e.key === 'Shift') {
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // Restore default orbit mode when Shift is released.
      if (e.key === 'Shift') {
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      }
    };

    // If the user tabs away while Shift is held the keyup never fires in this
    // window, so we reset on window blur to avoid a stuck pan mode.
    const onBlur = () => {
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [controls]);

  // No visual output — this component only manages side effects.
  return null;
}
