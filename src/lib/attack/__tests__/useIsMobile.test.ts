// useIsMobile.test.ts
// Verifies the viewport hook returns true when window.innerWidth is below the
// breakpoint and updates on resize events. Mocks innerWidth via Object.defineProperty
// since jsdom doesn't expose a setter on window.innerWidth by default.

import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../useIsMobile';

// Helper: set window.innerWidth and fire the resize event so the hook's listener
// observes a width change. Wrapping in act() flushes the React state update.
function setViewportWidth(px: number) {
  // Use Object.defineProperty with configurable so we can reassign across tests.
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

describe('useIsMobile', () => {
  // Reset to a known desktop width before each test so leaks between tests are impossible.
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
  });

  test('returns false on a desktop width (1280px)', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test('returns true on a phone width (375px)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test('updates from false to true when the viewport shrinks past 768px', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    setViewportWidth(500);
    expect(result.current).toBe(true);
  });

  test('updates from true to false when the viewport grows past 768px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    setViewportWidth(1024);
    expect(result.current).toBe(false);
  });

  test('respects a custom breakpoint argument', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 900 });
    const { result } = renderHook(() => useIsMobile(1024));
    expect(result.current).toBe(true);
  });

  test('removes its resize listener on unmount', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    // Confirm the listener was removed. Spy is loose because other code may also
    // remove listeners on unmount; we only assert ours was among them.
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeSpy.mockRestore();
  });
});
