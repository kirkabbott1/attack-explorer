import { type ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  canvas: ReactNode;
  /** Optional overlay elements rendered inside <main> (absolutely positioned).
   *  Use this for controls like SidebarToggle and InfoPanel so they are scoped
   *  to the canvas area and do not overlap the sidebar or detail panel. */
  canvasOverlays?: ReactNode;
  detailPanel: ReactNode;
  detailPanelOpen: boolean;
  /** Controls whether the left filter sidebar is visible. When false, the aside
   *  collapses to zero width so the canvas fills the full viewport width.
   *  Managed by ExplorerLayout in app.tsx via the SidebarToggle button. */
  sidebarOpen: boolean;
}

/**
 * Three-region layout for the ATT&CK Explorer app page:
 *  - Left sidebar (filters + search), collapsible, 320px when open
 *  - Center canvas (the 3D scene), fills remaining width
 *  - Right detail panel (slides in/out), fixed width 320px when open
 *
 * Full-bleed: no Layout shell, no Navbar, no Footer. The explorer is a tool, not a piece
 * of content, and benefits from every pixel of available canvas.
 *
 * canvasOverlays are rendered inside <main> which has position:relative, so absolutely-
 * positioned overlays (SidebarToggle, InfoPanel) are contained within the canvas column
 * rather than being fixed to the viewport. This prevents them from overlapping the sidebar
 * or detail panel when those panels are open.
 */
export default function AppShell({ sidebar, canvas, canvasOverlays, detailPanel, detailPanelOpen, sidebarOpen }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-darkblue text-lightteal">
      {/* Left sidebar: hidden on mobile (< 768px), collapsible on desktop via sidebarOpen.
          transition-all animates the width change when the toggle button is clicked.
          When collapsed (w-0), the border is also removed to avoid a 1px gap. */}
      <aside
        className={`hidden md:block flex-shrink-0 border-r border-darkteal/30 bg-darkblue/95 overflow-y-auto transition-all duration-200 ${
          sidebarOpen ? 'w-[320px]' : 'w-0 border-r-0'
        }`}
        aria-label="Filters and search"
        aria-hidden={!sidebarOpen}
      >
        {/* Only render sidebar contents when open — prevents hidden interactive
            elements from receiving keyboard/screen-reader focus when collapsed. */}
        {sidebarOpen && sidebar}
      </aside>
      <main className="flex-1 relative" aria-label="3D explorer canvas">
        {canvas}
        {/* Canvas overlays (e.g. SidebarToggle, InfoPanel) are rendered here so they are
            absolutely positioned within main and cannot overflow into the sidebar or detail
            panel columns. main already has position:relative which anchors them correctly. */}
        {canvasOverlays}
      </main>
      {/* Right detail panel: hidden on mobile (< 768px), slides in/out at md and up */}
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
