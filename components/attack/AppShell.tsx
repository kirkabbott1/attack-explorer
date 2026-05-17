import { type ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  canvas: ReactNode;
  detailPanel: ReactNode;
  detailPanelOpen: boolean;
}

/**
 * Three-region layout for the ATT&CK Explorer app page:
 *  - Left sidebar (filters + search), fixed width 320px
 *  - Center canvas (the 3D scene), fills remaining width
 *  - Right detail panel (slides in/out), fixed width 320px when open
 *
 * Full-bleed: no Layout shell, no Navbar, no Footer. The explorer is a tool, not a piece
 * of content, and benefits from every pixel of available canvas.
 */
export default function AppShell({ sidebar, canvas, detailPanel, detailPanelOpen }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-darkblue text-lightteal">
      {/* Left sidebar: hidden on mobile (< 768px), visible at md and up */}
      <aside
        className="hidden md:block w-[320px] flex-shrink-0 border-r border-darkteal/30 bg-darkblue/95 overflow-y-auto"
        aria-label="Filters and search"
      >
        {sidebar}
      </aside>
      <main className="flex-1 relative" aria-label="3D explorer canvas">
        {canvas}
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
