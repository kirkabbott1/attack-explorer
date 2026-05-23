// MobileDetailSheet.tsx
// Bottom-sheet overlay used on mobile to host the node detail panel. Slides up
// from the bottom of the viewport when a node is focused. Unlike the sidebar
// drawer this has no backdrop — the canvas under the sheet stays interactive
// so the user can keep orbiting/zooming while the sheet is open, matching the
// Google Maps-style "context preserved" pattern.
//
// Dismissal channels:
//   - Escape key while open
//   - Explicit "Close details" button in the sheet header
//
// Touch drag-to-dismiss is intentionally out of scope for v1.

import { useEffect, type ReactNode } from 'react';

interface Props {
  /** When true, the sheet is visible (translateY(0)) and interactive. */
  open: boolean;
  /** Invoked by Escape keydown or the in-sheet close button. */
  onClose: () => void;
  /** Detail panel contents — typically <DetailPanel /> when used in AppShell. */
  children: ReactNode;
}

/**
 * Mobile bottom sheet for node details. Sized at 60vh so half the canvas
 * remains visible above the sheet, preserving spatial context with the
 * selected node.
 */
export default function MobileDetailSheet({ open, onClose, children }: Props) {
  // Escape listener wired at the window level so it fires regardless of focus.
  // Only mounted while open, unmounted on close, to avoid stealing Escape
  // events from other dialogs (e.g. the sidebar drawer when it is open instead).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <aside
      aria-label="Selected node details"
      aria-hidden={!open}
      className={`fixed bottom-0 left-0 right-0 h-[60vh] z-30 bg-darkblue/95 border-t border-darkteal/30 rounded-t-xl flex flex-col transition-transform duration-200 ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Sheet header: centred drag-handle pill above a close-button row. The
          handle is purely decorative for v1 (no drag gestures wired); the close
          button is the functional dismiss control. flex-shrink-0 keeps the
          header at its natural size while the scroll region below absorbs the
          remaining height. */}
      <div className="flex flex-col flex-shrink-0 border-b border-darkteal/30">
        {/* Decorative drag handle row — small pill centred above the close-button
            row, mirroring iOS / Maps-style bottom-sheet affordances. */}
        <div className="flex justify-center pt-2 pb-1">
          <span aria-hidden="true" className="block w-10 h-1 rounded-full bg-darkteal/50" />
        </div>
        {/* Close-button row — right-aligned so the tap target sits where the
            thumb naturally lands when reaching to dismiss the sheet. */}
        <div className="flex items-center justify-end px-4 pb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="px-2 py-1 text-sm text-medteal hover:text-lightteal"
          >
            Close
          </button>
        </div>
      </div>
      {/* Scrollable region for the embedded detail panel contents. flex-1
          fills the remaining height after the fixed-size header; min-h-0
          lets the flex child shrink below its intrinsic content height so
          overflow-y-auto actually scrolls instead of overflowing the parent. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </aside>
  );
}
