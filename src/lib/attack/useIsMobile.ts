// useIsMobile.ts
// React hook that returns true when window.innerWidth is below a given breakpoint.
// Drives the mobile-layout branch in AppShell.tsx. Centralising the breakpoint
// here means the value lives in one place -- change it once, both the layout
// branching and any future call sites stay in sync.
//
// SSR safety: initial state derives from typeof window so server renders never
// throw. The first client effect resyncs to the actual viewport width.

import { useEffect, useState } from 'react';

// Default breakpoint matches Tailwind's `md` so CSS-driven hidden/visible
// utilities and JS-driven layout branching agree on the same threshold.
const DEFAULT_BREAKPOINT_PX = 768;

/**
 * Returns true when the viewport width is strictly less than `breakpointPx`.
 * Subscribes to the window `resize` event and updates the returned value on
 * every viewport change. Cleans up the listener on unmount.
 *
 * @param breakpointPx - Width threshold in CSS pixels. Defaults to 768.
 */
export function useIsMobile(breakpointPx: number = DEFAULT_BREAKPOINT_PX): boolean {
  // Initialise from window if available, false on the server. The first effect
  // run resyncs to the live value, so SSR hydration mismatch is impossible
  // because the client re-renders immediately on mount.
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.innerWidth < breakpointPx
  );

  useEffect(() => {
    // Recompute the boolean from the live viewport width. Defined here (not
    // outside the effect) so the closure captures the current breakpointPx.
    const check = () => setIsMobile(window.innerWidth < breakpointPx);
    // Sync once on mount in case the initial useState value was stale (SSR).
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpointPx]);

  return isMobile;
}
