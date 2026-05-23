// cameraFit.ts
// Pure helper that computes the perspective-camera Z distance needed for the
// ATT&CK 3D Explorer scene to fit horizontally inside a viewport of a given
// aspect ratio. The scene layout (see layout.ts) spreads tactics across X=[-90,90]
// and software/groups across X=[-110,110], so on portrait phone viewports the
// fixed legacy distance of 130 clips everything except the central technique
// dot cluster. This helper preserves the legacy distance for landscape aspects
// and only pulls the camera back when the horizontal frustum would otherwise
// be too narrow to show the full scene.

// Legacy camera Z used on desktop. Wider aspects clamp to this so we never
// move closer than the known-good desktop framing.
export const DEFAULT_CAMERA_Z = 130;

// Default vertical FOV (degrees) — must stay in sync with Scene.tsx Canvas camera.
export const DEFAULT_FOV = 50;

// World-space horizontal extent we want to ensure is visible. 216 is the
// horizontal range currently shown at z=130 with a 16:9 desktop aspect, so
// using it as the design target keeps the desktop experience pixel-identical
// while sizing portrait viewports relative to that same content target.
const DESIGN_VISIBLE_WIDTH = 216;

/**
 * Compute the camera distance (z position) needed so the scene's horizontal
 * extent fits within the viewport's perspective frustum.
 *
 * Derivation: at distance d with vertical FOV θ, visible height at z=0 is
 * `2 d tan(θ/2)`, so visible width is `2 d tan(θ/2) × aspect`. Solving for d
 * such that the visible width equals DESIGN_VISIBLE_WIDTH gives the formula
 * below. We then clamp to DEFAULT_CAMERA_Z so ultra-wide aspects don't move
 * the camera inside the scene.
 *
 * @param aspect  - Viewport width / height (e.g. 16/9 desktop, ~0.46 phone portrait).
 * @param fovDeg  - Vertical field of view in degrees. Defaults to DEFAULT_FOV (50).
 * @returns       - Recommended camera Z position in world units.
 */
export function cameraZForAspect(aspect: number, fovDeg: number = DEFAULT_FOV): number {
  // Half-tangent of the vertical FOV — appears in both height and width formulas.
  const halfTan = Math.tan((fovDeg * Math.PI) / 180 / 2);
  // Distance needed so horizontal frustum at z=0 spans DESIGN_VISIBLE_WIDTH.
  const distForWidth = (DESIGN_VISIBLE_WIDTH / 2) / (halfTan * aspect);
  // Clamp: never get closer than the legacy desktop distance.
  return Math.max(DEFAULT_CAMERA_Z, distForWidth);
}
