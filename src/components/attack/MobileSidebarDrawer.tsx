// MobileSidebarDrawer.tsx
// Slide-in left drawer used on mobile to host the filter sidebar. Renders both
// a backdrop and a panel inside a fixed-position container at the viewport
// edge. The panel is always mounted so its open/close transform can animate;
// it is hidden from assistive tech via aria-hidden when closed.
//
// Dismissal channels (all call onClose):
//   - Backdrop click (data-testid="drawer-backdrop")
//   - Escape key while open
//   - Explicit "Close filters" button inside the panel header
//
// Touch drag-to-dismiss is intentionally out of scope for v1 — see the
// design spec, "Non-Goals". Future work can wire a touch handler if needed.

import { useEffect, type ReactNode } from 'react';

interface Props {
  /** When true, the panel is visible (translateX(0)) and interactive. */
  open: boolean;
  /** Invoked by backdrop click, Escape keydown, or the in-panel close button. */
  onClose: () => void;
  /** Sidebar contents — typically <FilterSidebar /> when used in AppShell. */
  children: ReactNode;
}

/**
 * Mobile slide-in drawer for the filter sidebar.
 *
 * Tailwind classes drive the slide animation: closed = -translate-x-full,
 * open = translate-x-0, with transition-transform on both states.
 * The width is min(85vw, 320px) so a strip of canvas stays visible behind
 * the drawer on portrait phones, preserving spatial context.
 */
export default function MobileSidebarDrawer({ open, onClose, children }: Props) {
  // Wire the Escape key listener at the window level so it fires regardless of
  // which element has focus inside the drawer. The effect re-subscribes whenever
  // open or onClose changes; the cleanup removes the listener on unmount or
  // before the next subscribe.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — semi-transparent dark overlay that captures clicks outside the panel.
          Visible only when open; pointer-events disabled when closed so the canvas
          underneath stays interactive while the drawer is dismissed. */}
      <div
        data-testid="drawer-backdrop"
        onClick={onClose}
        className={`fixed inset-0 z-20 bg-darkblue/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />
      {/* Drawer panel — slides in from the left. Always mounted so the slide-out
          transform animates cleanly on close. aria-hidden flips based on open
          so screen readers skip the content when closed. */}
      <aside
        aria-label="Filters and search"
        aria-hidden={!open}
        className={`fixed top-0 left-0 h-full w-[min(85vw,320px)] z-30 bg-darkblue/95 border-r border-darkteal/30 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header: small bar with the explicit close button. The button is
            keyboard-accessible and labelled so the close affordance is obvious
            even on devices without a backdrop tap. */}
        <div className="flex items-center justify-end px-3 py-2 border-b border-darkteal/30 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="px-2 py-1 text-sm text-medteal hover:text-lightteal"
          >
            Close
          </button>
        </div>
        {/* Scrollable region for the embedded sidebar contents. flex-1 fills the
            remaining height after the fixed-size header, min-h-0 lets the flex
            child shrink below its intrinsic content height so overflow-y-auto
            actually scrolls instead of overflowing the parent. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </aside>
    </>
  );
}
