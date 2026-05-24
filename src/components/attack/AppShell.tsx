// AppShell.tsx
// Three-region layout for desktop (left sidebar, center canvas, right detail
// panel) plus a full-bleed mobile variant (canvas-only with overlay drawer
// + bottom sheet) chosen based on viewport width.
//
// The mobile branch reuses the same props as the desktop branch — sidebar
// contents, detail-panel contents, and the sidebarOpen / detailPanelOpen
// flags are identical. The parent (ExplorerLayout in App.tsx) owns the
// state and is layout-agnostic; AppShell decides how to present it.
//
// Why branch in JS rather than CSS? The mobile components (MobileSidebarDrawer,
// MobileDetailSheet) are wrapper presentations that need to KNOW which mode
// they're in to set up keyboard handlers and aria-hidden correctly. CSS-only
// branching with display:none would still leave the desktop side mounted on
// mobile and vice versa, doubling event handlers and aria semantics. Cleaner
// to render only the relevant tree.

import { type ReactNode } from 'react';
import { useIsMobile } from '@/lib/attack/useIsMobile';
import MobileSidebarDrawer from './MobileSidebarDrawer';
import MobileDetailSheet from './MobileDetailSheet';
import MobileHint from './MobileHint';

interface AppShellProps {
  sidebar: ReactNode;
  canvas: ReactNode;
  /** Absolutely-positioned overlay elements rendered inside <main>. Used for
   *  controls scoped to the canvas area such as SidebarToggle and InfoPanel.
   *  Hidden visually on mobile via the components' own md:* classes. */
  canvasOverlays?: ReactNode;
  detailPanel: ReactNode;
  detailPanelOpen: boolean;
  /** Controls whether the left filter sidebar is visible. On desktop this
   *  collapses the aside to zero width; on mobile this opens the drawer. */
  sidebarOpen: boolean;
  /** Setter used by the mobile hamburger and drawer's close button to flip
   *  sidebarOpen. The parent owns the state via useState in ExplorerLayout. */
  onSidebarOpenChange: (open: boolean) => void;
  /** Clears the current node selection. Wired to the detail sheet's close
   *  button so closing the sheet also clears focusId and the URL query state. */
  onClearSelection: () => void;
}

export default function AppShell({
  sidebar,
  canvas,
  canvasOverlays,
  detailPanel,
  detailPanelOpen,
  sidebarOpen,
  onSidebarOpenChange,
  onClearSelection,
}: AppShellProps) {
  // Viewport hook decides which layout tree to render. Tailwind's `md`
  // breakpoint (768px) is the same threshold the hook uses by default.
  const isMobile = useIsMobile();

  if (isMobile) {
    // Mobile layout: full-bleed canvas with overlay drawer + bottom sheet.
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-darkblue text-lightteal">
        <main className="absolute inset-0" aria-label="3D explorer canvas">
          {canvas}
          {canvasOverlays}
          {/* Mobile hamburger button — inline JSX, not a separate component.
              Positioned top-left of the canvas at z-10 so it overlays the 3D
              scene but sits below the drawer (z-30) when open. Always
              visible on mobile because the parent only mounts this branch
              when isMobile is true. */}
          <button
            type="button"
            onClick={() => onSidebarOpenChange(true)}
            aria-label="Show filters"
            aria-expanded={sidebarOpen}
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-2 text-sm bg-darkblue/95 hover:bg-darkblue text-medteal hover:text-lightteal border border-darkteal/40 rounded"
            style={{ backdropFilter: 'blur(4px)' }}
          >
            {/* Three-line hamburger glyph using HTML entity to avoid charmap
                issues in the build (matches SidebarToggle.tsx convention). */}
            <span aria-hidden="true">&#9776;</span>
            <span>Filters</span>
          </button>
          {/* MobileHint: one-shot tip pill prompting first-time users to tap a
              node. Auto-dismisses on first selection and persists in localStorage. */}
          <MobileHint />
        </main>
        <MobileSidebarDrawer open={sidebarOpen} onClose={() => onSidebarOpenChange(false)}>
          {sidebar}
        </MobileSidebarDrawer>
        <MobileDetailSheet open={detailPanelOpen} onClose={onClearSelection}>
          {detailPanel}
        </MobileDetailSheet>
      </div>
    );
  }

  // Desktop layout: three-column flex (unchanged from the previous AppShell).
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-darkblue text-lightteal">
      <aside
        className={`hidden md:block flex-shrink-0 border-r border-darkteal/30 bg-darkblue/95 overflow-y-auto transition-all duration-200 ${
          sidebarOpen ? 'w-[320px]' : 'w-0 border-r-0'
        }`}
        aria-label="Filters and search"
        aria-hidden={!sidebarOpen}
      >
        {sidebarOpen && sidebar}
      </aside>
      <main className="flex-1 relative" aria-label="3D explorer canvas">
        {canvas}
        {canvasOverlays}
      </main>
      <aside
        className={`hidden md:block flex-shrink-0 border-l border-darkteal/30 bg-darkblue/95 overflow-y-auto transition-all duration-200 ${
          detailPanelOpen ? 'w-[320px]' : 'w-0'
        }`}
        aria-label="Selected node details"
      >
        {detailPanelOpen && detailPanel}
      </aside>
    </div>
  );
}
