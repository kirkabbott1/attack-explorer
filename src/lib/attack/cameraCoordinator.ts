// cameraCoordinator.ts
// Tiny module-scope signal that lets one R3F child component tell another
// "I just snapped the camera" so the other can cancel an in-flight animation
// rather than overwriting the snap on its next frame.
//
// Why module scope rather than React context: both producer (FitCameraToViewport)
// and consumer (CameraFocus) are render-null children inside a single Canvas tree.
// They need a write-then-read signal, not a reactive subscription that would
// cause re-renders. A bare module-scoped counter is the simplest correct shape.
//
// Why a monotonically-increasing counter rather than a boolean: the consumer
// records the version at tween start and checks each frame whether the version
// has changed. Booleans would need explicit reset semantics; counters do not.

// Internal counter. Increments every time markCameraFit is called. The exact
// numeric value carries no meaning — only the difference between two reads
// matters to consumers.
let fitVersion = 0;

/**
 * Increments the camera-fit version. Called by FitCameraToViewport every time
 * it snaps the camera to a new viewport-fitting position. Consumers comparing
 * a stored version to readCameraFitVersion() will see the difference and can
 * react (typically by cancelling an in-flight animation).
 */
export function markCameraFit(): void {
  fitVersion += 1;
}

/**
 * Returns the current camera-fit version. Read at the start of an animation
 * and again on every frame; if the value has increased between calls, a fit
 * has been applied externally and the animation should usually cancel.
 */
export function readCameraFitVersion(): number {
  return fitVersion;
}
