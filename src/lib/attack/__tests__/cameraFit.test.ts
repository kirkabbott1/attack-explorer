// cameraFit.test.ts
// Tests the pure cameraZForAspect helper that decides how far back the perspective
// camera must sit so the scene's horizontal extent fits inside the viewport's
// frustum at a given aspect ratio. Mobile portrait viewports must pull back further
// than desktop landscape viewports — the original bug was a fixed camera distance
// that worked on desktop but clipped most of the graph on phones, leaving only the
// central technique dot cluster visible.

import { cameraZForAspect } from '../cameraFit';

describe('cameraZForAspect', () => {
  // Default desktop aspect: keep the legacy z=130 distance to avoid changing the
  // experience for users who already see the full scene at this ratio.
  it('returns the default desktop distance (~130) for a wide landscape aspect (16:9)', () => {
    const z = cameraZForAspect(16 / 9);
    expect(z).toBeGreaterThanOrEqual(129);
    expect(z).toBeLessThanOrEqual(132);
  });

  // Ultra-wide aspects must not get closer than the legacy default — the floor
  // prevents the camera diving inside the scene on extreme aspect ratios.
  it('clamps to the default distance on ultra-wide aspects (2.5)', () => {
    const z = cameraZForAspect(2.5);
    expect(z).toBe(130);
  });

  // Mobile portrait (modern phone ~9:19.5): horizontal FOV collapses, so the
  // camera must pull back substantially to fit the full scene width.
  it('pulls the camera well back for a portrait phone aspect (~0.46)', () => {
    const z = cameraZForAspect(390 / 844);
    // Must be at least 3x the desktop default — anything smaller still clips
    // tactics/group/software constellations off-screen.
    expect(z).toBeGreaterThan(400);
  });

  // Square / tablet portrait aspects sit between desktop and phone: the camera
  // should pull back but not as dramatically as a phone.
  it('moves moderately further back at a square (1:1) aspect', () => {
    const z = cameraZForAspect(1);
    expect(z).toBeGreaterThan(200);
    expect(z).toBeLessThan(280);
  });

  // The function must accept a custom fov so a future tweak of camera.fov
  // does not silently break the fit calculation.
  it('respects a custom fov parameter', () => {
    // Wider fov should require less distance to span the same width.
    const z50 = cameraZForAspect(0.5, 50);
    const z70 = cameraZForAspect(0.5, 70);
    expect(z70).toBeLessThan(z50);
  });
});
