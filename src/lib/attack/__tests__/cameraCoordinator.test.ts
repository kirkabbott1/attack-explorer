// cameraCoordinator.test.ts
// Verifies the tiny module-scope coordinator that lets FitCameraToViewport
// signal "I snapped the camera" so CameraFocus can cancel an in-flight tween
// rather than overwriting the snap. The coordinator is intentionally simple:
// a counter that markCameraFit() increments and readCameraFitVersion() reads.

import { markCameraFit, readCameraFitVersion } from '../cameraCoordinator';

describe('cameraCoordinator', () => {
  test('readCameraFitVersion returns a number', () => {
    // Initial read just needs to return a finite number; we do not assert a
    // specific value because earlier tests in the file may have incremented it.
    const v = readCameraFitVersion();
    expect(typeof v).toBe('number');
    expect(Number.isFinite(v)).toBe(true);
  });

  test('markCameraFit increases the version monotonically', () => {
    const before = readCameraFitVersion();
    markCameraFit();
    const afterOne = readCameraFitVersion();
    markCameraFit();
    const afterTwo = readCameraFitVersion();

    expect(afterOne).toBeGreaterThan(before);
    expect(afterTwo).toBeGreaterThan(afterOne);
  });

  test('readCameraFitVersion is idempotent — multiple reads do not change the version', () => {
    const v1 = readCameraFitVersion();
    const v2 = readCameraFitVersion();
    const v3 = readCameraFitVersion();
    expect(v2).toBe(v1);
    expect(v3).toBe(v1);
  });
});
