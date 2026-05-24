// MobileHint.tsx
// A one-shot pill near the top of the mobile canvas that prompts first-time
// users: "Tap a node to see connections". Because edges only render when a
// node is selected (Edges.tsx), the explorer reads as a static dot cloud on
// first load -- without this hint, the graph-relationship value of the
// project is invisible to mobile users until they happen to tap a node.
//
// Dismissal channels:
//   - First selection (focusId becomes non-null) -- auto-dismiss
//   - Tap the pill itself -- manual dismiss
//
// Both dismissal channels persist a flag in localStorage so the hint never
// reappears for that visitor on this device. Server-side rendering is a
// non-concern (this app is fully client-side via Vite), so we read
// localStorage directly without guarding for window.

import { useEffect, useState } from 'react';
import { useSelection } from '@/lib/attack/context';

// localStorage key. Bumped if the hint copy/behavior changes meaningfully
// enough that we'd want to re-show it to returning visitors.
const STORAGE_KEY = 'attack-explorer.mobileHint.dismissed.v1';

/**
 * Renders a small dismissable hint pill on mobile. Auto-dismisses on first
 * node selection and persists its dismissed state in localStorage. Renders
 * nothing if the hint has already been dismissed.
 *
 * Mounted only inside the mobile layout branch in AppShell -- no isMobile
 * check needed here.
 */
export default function MobileHint() {
  // Initial state reads localStorage lazily so we don't flash the hint on
  // returning visitors. typeof window check is purely defensive against any
  // future SSR migration; today this app is fully client-side under Vite.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // localStorage can throw in private-mode iOS Safari or when storage is
      // disabled. Treat "can't read" as "not dismissed" so the hint still
      // shows once per session even if the dismissal can't persist.
      return false;
    }
  });

  // focusId becomes non-null the moment the user selects a node -- that's our
  // signal that the user understands the interaction. Auto-dismiss and persist.
  const [focusId] = useSelection();
  useEffect(() => {
    if (dismissed) return;
    if (focusId === null) return;
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Best-effort persist. If localStorage is unavailable the hint will
      // reappear on next visit -- minor degradation, not a bug.
    }
  }, [focusId, dismissed]);

  if (dismissed) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setDismissed(true);
        try {
          window.localStorage.setItem(STORAGE_KEY, '1');
        } catch {
          // see above
        }
      }}
      aria-label="Dismiss tip: tap a node to see connections"
      // Positioned just below the hamburger button so it does not collide.
      // Hamburger is at top-3 (12px); this sits at top-16 (64px) leaving room
      // for the hamburger's ~36px height plus breathing room.
      className="absolute top-16 left-3 z-10 flex items-center gap-1.5 px-3 py-2 text-xs bg-darkblue/95 text-lightteal border border-darkteal/40 rounded shadow"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      <span aria-hidden="true">i</span>
      <span>Tap a node to see connections</span>
    </button>
  );
}
