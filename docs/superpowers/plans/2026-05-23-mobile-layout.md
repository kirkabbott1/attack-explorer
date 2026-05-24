# Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ATT&CK 3D Explorer usable on phones by adding a slide-in drawer for filters/search and a bottom sheet for node details, while keeping the desktop layout pixel-identical.

**Architecture:** A new `useIsMobile` hook drives a single branch in `AppShell`. The mobile branch renders the canvas full-bleed plus two overlay components (`MobileSidebarDrawer`, `MobileDetailSheet`) that reuse the existing `FilterSidebar` and `DetailPanel` verbatim. The camera-fit work from the prior fix attempt stays; only its diagnostic `console.log` is removed.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Jest + jest-dom + @testing-library/react, R3F (untouched here).

**Spec:** `docs/superpowers/specs/2026-05-23-mobile-layout-design.md`

**Working directory for all paths in this plan:** `C:/Users/kirka/dev/attack-explorer`

---

## File Inventory

| File | Action | Owner Task |
| --- | --- | --- |
| `src/lib/attack/useIsMobile.ts` | CREATE | Task 1 |
| `src/lib/attack/__tests__/useIsMobile.test.ts` | CREATE | Task 1 |
| `src/components/attack/MobileSidebarDrawer.tsx` | CREATE | Task 2 |
| `src/components/attack/__tests__/MobileSidebarDrawer.test.tsx` | CREATE | Task 2 |
| `src/components/attack/MobileDetailSheet.tsx` | CREATE | Task 3 |
| `src/components/attack/__tests__/MobileDetailSheet.test.tsx` | CREATE | Task 3 |
| `src/components/attack/AppShell.tsx` | MODIFY | Task 4 |
| `src/components/attack/FitCameraToViewport.tsx` | MODIFY (remove console.log) | Task 5 |

---

## Task 1: `useIsMobile` hook

**Files:**
- Create: `src/lib/attack/useIsMobile.ts`
- Test: `src/lib/attack/__tests__/useIsMobile.test.ts`

### - [ ] Step 1.1: Write the failing tests

Create `src/lib/attack/__tests__/useIsMobile.test.ts`:

```ts
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

  it('returns false on a desktop width (1280px)', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true on a phone width (375px)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates from false to true when the viewport shrinks past 768px', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    setViewportWidth(500);
    expect(result.current).toBe(true);
  });

  it('updates from true to false when the viewport grows past 768px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    setViewportWidth(1024);
    expect(result.current).toBe(false);
  });

  it('respects a custom breakpoint argument', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 900 });
    const { result } = renderHook(() => useIsMobile(1024));
    expect(result.current).toBe(true);
  });

  it('removes its resize listener on unmount', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    // Confirm the listener was removed. Spy is loose because other code may also
    // remove listeners on unmount; we only assert ours was among them.
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeSpy.mockRestore();
  });
});
```

### - [ ] Step 1.2: Run the tests to verify they fail

Run: `cd C:/Users/kirka/dev/attack-explorer && npx jest src/lib/attack/__tests__/useIsMobile.test.ts`

Expected: `Cannot find module '../useIsMobile'` — test file imports a module that doesn't exist yet.

### - [ ] Step 1.3: Implement the hook

Create `src/lib/attack/useIsMobile.ts`:

```ts
// useIsMobile.ts
// React hook that returns true when window.innerWidth is below a given breakpoint.
// Drives the mobile-layout branch in AppShell.tsx. Centralising the breakpoint
// here means the value lives in one place — change it once, both the layout
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
```

### - [ ] Step 1.4: Run the tests to verify they pass

Run: `cd C:/Users/kirka/dev/attack-explorer && npx jest src/lib/attack/__tests__/useIsMobile.test.ts`

Expected: 6 passed, 0 failed.

### - [ ] Step 1.5: Type-check

Run: `cd C:/Users/kirka/dev/attack-explorer && npx tsc --noEmit`

Expected: no output (success).

### - [ ] Step 1.6: Commit

```bash
cd C:/Users/kirka/dev/attack-explorer
git add src/lib/attack/useIsMobile.ts src/lib/attack/__tests__/useIsMobile.test.ts
git commit -m "feat(mobile): add useIsMobile hook with resize subscription"
```

---

## Task 2: `MobileSidebarDrawer` component

**Files:**
- Create: `src/components/attack/MobileSidebarDrawer.tsx`
- Test: `src/components/attack/__tests__/MobileSidebarDrawer.test.tsx`

### - [ ] Step 2.1: Write the failing tests

Create `src/components/attack/__tests__/MobileSidebarDrawer.test.tsx`:

```tsx
// MobileSidebarDrawer.test.tsx
// Verifies the slide-in drawer renders children when open, hides them when
// closed, calls onClose on backdrop click and Escape, and is keyboard-accessible.

import { render, screen, fireEvent } from '@testing-library/react';
import MobileSidebarDrawer from '../MobileSidebarDrawer';

describe('MobileSidebarDrawer', () => {
  it('renders children when open', () => {
    render(
      <MobileSidebarDrawer open={true} onClose={() => {}}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    expect(screen.getByText('filter content')).toBeInTheDocument();
  });

  it('hides the panel from assistive tech when closed', () => {
    render(
      <MobileSidebarDrawer open={false} onClose={() => {}}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    // Panel should still mount (so transitions work) but be aria-hidden when closed.
    const panel = screen.getByLabelText('Filters and search');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the panel to assistive tech when open', () => {
    render(
      <MobileSidebarDrawer open={true} onClose={() => {}}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    const panel = screen.getByLabelText('Filters and search');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = jest.fn();
    render(
      <MobileSidebarDrawer open={true} onClose={onClose}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    fireEvent.click(screen.getByTestId('drawer-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed while open', () => {
    const onClose = jest.fn();
    render(
      <MobileSidebarDrawer open={true} onClose={onClose}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when closed', () => {
    const onClose = jest.fn();
    render(
      <MobileSidebarDrawer open={false} onClose={onClose}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders an explicit close button that calls onClose', () => {
    const onClose = jest.fn();
    render(
      <MobileSidebarDrawer open={true} onClose={onClose}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    fireEvent.click(screen.getByRole('button', { name: /close filters/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

### - [ ] Step 2.2: Run the tests to verify they fail

Run: `cd C:/Users/kirka/dev/attack-explorer && npx jest src/components/attack/__tests__/MobileSidebarDrawer.test.tsx`

Expected: `Cannot find module '../MobileSidebarDrawer'`.

### - [ ] Step 2.3: Implement the drawer

Create `src/components/attack/MobileSidebarDrawer.tsx`:

```tsx
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
        className={`fixed top-0 left-0 h-full w-[min(85vw,320px)] z-30 bg-darkblue/95 border-r border-darkteal/30 transform transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header: small bar with the explicit close button. The button is
            keyboard-accessible and labelled so the close affordance is obvious
            even on devices without a backdrop tap. */}
        <div className="flex items-center justify-end px-3 py-2 border-b border-darkteal/30">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="px-2 py-1 text-sm text-medteal hover:text-lightteal"
          >
            Close
          </button>
        </div>
        {/* Scrollable region for the embedded sidebar contents. h-[calc(100%-...)]
            ensures the scroll area fills the panel minus the header height. */}
        <div className="h-[calc(100%-41px)] overflow-y-auto">
          {children}
        </div>
      </aside>
    </>
  );
}
```

### - [ ] Step 2.4: Run the tests to verify they pass

Run: `cd C:/Users/kirka/dev/attack-explorer && npx jest src/components/attack/__tests__/MobileSidebarDrawer.test.tsx`

Expected: 7 passed, 0 failed.

### - [ ] Step 2.5: Type-check

Run: `cd C:/Users/kirka/dev/attack-explorer && npx tsc --noEmit`

Expected: no output.

### - [ ] Step 2.6: Commit

```bash
cd C:/Users/kirka/dev/attack-explorer
git add src/components/attack/MobileSidebarDrawer.tsx src/components/attack/__tests__/MobileSidebarDrawer.test.tsx
git commit -m "feat(mobile): add MobileSidebarDrawer slide-in panel"
```

---

## Task 3: `MobileDetailSheet` component

**Files:**
- Create: `src/components/attack/MobileDetailSheet.tsx`
- Test: `src/components/attack/__tests__/MobileDetailSheet.test.tsx`

### - [ ] Step 3.1: Write the failing tests

Create `src/components/attack/__tests__/MobileDetailSheet.test.tsx`:

```tsx
// MobileDetailSheet.test.tsx
// Verifies the bottom-sheet renders children when open, hides them when closed,
// and calls onClose for Escape and explicit close button. The sheet has no
// backdrop (canvas under the sheet stays interactive), so there is no backdrop test.

import { render, screen, fireEvent } from '@testing-library/react';
import MobileDetailSheet from '../MobileDetailSheet';

describe('MobileDetailSheet', () => {
  it('renders children when open', () => {
    render(
      <MobileDetailSheet open={true} onClose={() => {}}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    expect(screen.getByText('node detail content')).toBeInTheDocument();
  });

  it('hides the sheet from assistive tech when closed', () => {
    render(
      <MobileDetailSheet open={false} onClose={() => {}}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    const sheet = screen.getByLabelText('Selected node details');
    expect(sheet).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the sheet to assistive tech when open', () => {
    render(
      <MobileDetailSheet open={true} onClose={() => {}}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    const sheet = screen.getByLabelText('Selected node details');
    expect(sheet).toHaveAttribute('aria-hidden', 'false');
  });

  it('calls onClose when Escape is pressed while open', () => {
    const onClose = jest.fn();
    render(
      <MobileDetailSheet open={true} onClose={onClose}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders an explicit close button that calls onClose', () => {
    const onClose = jest.fn();
    render(
      <MobileDetailSheet open={true} onClose={onClose}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    fireEvent.click(screen.getByRole('button', { name: /close details/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not respond to Escape when closed', () => {
    const onClose = jest.fn();
    render(
      <MobileDetailSheet open={false} onClose={onClose}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

### - [ ] Step 3.2: Run the tests to verify they fail

Run: `cd C:/Users/kirka/dev/attack-explorer && npx jest src/components/attack/__tests__/MobileDetailSheet.test.tsx`

Expected: `Cannot find module '../MobileDetailSheet'`.

### - [ ] Step 3.3: Implement the sheet

Create `src/components/attack/MobileDetailSheet.tsx`:

```tsx
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
      className={`fixed bottom-0 left-0 right-0 h-[60vh] z-30 bg-darkblue/95 border-t border-darkteal/30 rounded-t-xl transform transition-transform duration-200 ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Sheet header: drag-handle visual + close button. The handle is purely
          decorative for v1 (no drag gestures wired); the close button is the
          functional dismiss control. */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-darkteal/30">
        {/* Decorative drag handle — small pill centred-ish at the top so the
            sheet visually reads as draggable even though gestures are deferred. */}
        <span aria-hidden="true" className="block w-10 h-1 rounded-full bg-darkteal/50 mx-auto" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="px-2 py-1 text-sm text-medteal hover:text-lightteal"
        >
          Close
        </button>
      </div>
      {/* Scrollable region for the embedded detail panel contents. */}
      <div className="h-[calc(100%-41px)] overflow-y-auto">
        {children}
      </div>
    </aside>
  );
}
```

### - [ ] Step 3.4: Run the tests to verify they pass

Run: `cd C:/Users/kirka/dev/attack-explorer && npx jest src/components/attack/__tests__/MobileDetailSheet.test.tsx`

Expected: 6 passed, 0 failed.

### - [ ] Step 3.5: Type-check

Run: `cd C:/Users/kirka/dev/attack-explorer && npx tsc --noEmit`

Expected: no output.

### - [ ] Step 3.6: Commit

```bash
cd C:/Users/kirka/dev/attack-explorer
git add src/components/attack/MobileDetailSheet.tsx src/components/attack/__tests__/MobileDetailSheet.test.tsx
git commit -m "feat(mobile): add MobileDetailSheet bottom sheet"
```

---

## Task 4: Wire mobile branch into `AppShell`

**Files:**
- Modify: `src/components/attack/AppShell.tsx`

**Note:** AppShell currently receives `sidebar`, `canvas`, `canvasOverlays`, `detailPanel`, `detailPanelOpen`, `sidebarOpen`. The mobile branch reuses these same props — the parent (`ExplorerLayout` in `App.tsx`) already manages `sidebarOpen` state and `detailPanelOpen` is derived from `focusId !== null`. We don't change the parent at all.

### - [ ] Step 4.1: Read the current AppShell

Run: `cat src/components/attack/AppShell.tsx`

Confirm the structure: a `<div>` with `<aside>` (sidebar), `<main>` (canvas + overlays), `<aside>` (detail panel). All three are siblings of the flex container.

### - [ ] Step 4.2: Replace the AppShell file in full

Overwrite `src/components/attack/AppShell.tsx` with:

```tsx
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
```

### - [ ] Step 4.3: Update the AppShell call site in `App.tsx`

`App.tsx` currently passes `sidebar`, `canvas`, `canvasOverlays`, `detailPanel`, `detailPanelOpen`, and `sidebarOpen` — but the new AppShell adds `onSidebarOpenChange` and `onClearSelection`. Open `src/App.tsx` and locate the existing `ExplorerLayout` function (around line 22):

Add `setSelection` to the selection hook destructure and pass the two new callback props to `AppShell`. Replace the entire `ExplorerLayout` function body:

```tsx
function ExplorerLayout() {
  // We now need both focusId AND setSelection so the detail sheet's close
  // button can clear the selection (which derives detailPanelOpen, and also
  // clears the URL query state via the existing onStateChange wiring).
  const [focusId, setSelection] = useSelection();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <>
      <KeyboardShortcuts searchInputRef={searchInputRef} />
      <AppShell
        sidebar={<FilterSidebar searchInputRef={searchInputRef} />}
        canvas={
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        }
        canvasOverlays={
          <>
            <SidebarToggle open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
            <InfoPanel />
            <BackLink />
          </>
        }
        detailPanel={<DetailPanel />}
        detailPanelOpen={focusId !== null}
        sidebarOpen={sidebarOpen}
        onSidebarOpenChange={setSidebarOpen}
        onClearSelection={() => setSelection(null)}
      />
    </>
  );
}
```

(Leave the rest of `App.tsx` untouched.)

### - [ ] Step 4.4: Type-check

Run: `cd C:/Users/kirka/dev/attack-explorer && npx tsc --noEmit`

Expected: no output. If you see "useState is not defined" — the import line at the top of `App.tsx` already imports `useState` per the existing code; no change needed. If you see errors about `useSelection` returning a tuple, recheck that the destructure matches the existing return type (it returns `[focusId, setSelection]`).

### - [ ] Step 4.5: Run the full test suite

Run: `cd C:/Users/kirka/dev/attack-explorer && npx jest`

Expected: all tests pass (115 existing + 6 useIsMobile + 7 drawer + 6 sheet = 134 total).

### - [ ] Step 4.6: Commit

```bash
cd C:/Users/kirka/dev/attack-explorer
git add src/components/attack/AppShell.tsx src/App.tsx
git commit -m "feat(mobile): branch AppShell to render drawer+sheet on mobile widths"
```

---

## Task 5: Remove diagnostic `console.log` from `FitCameraToViewport`

The prior debugging session left a `console.log` in `FitCameraToViewport.tsx` so we could confirm the effect was running. With unit tests in place for `cameraZForAspect` (5 tests, all passing) and the layout work landing, the log is no longer needed.

**Files:**
- Modify: `src/components/attack/FitCameraToViewport.tsx`

### - [ ] Step 5.1: Remove the log statement

In `src/components/attack/FitCameraToViewport.tsx`, find and delete these three lines:

```ts
    // Temporary diagnostic so we can confirm in the browser console that the
    // effect actually ran and at what distance. Remove once verified.
    // eslint-disable-next-line no-console
    console.log('[FitCameraToViewport] aspect=', aspect.toFixed(2), 'z=', z.toFixed(1));
```

### - [ ] Step 5.2: Type-check and test

Run: `cd C:/Users/kirka/dev/attack-explorer && npx tsc --noEmit && npx jest`

Expected: clean type-check, 134 tests pass.

### - [ ] Step 5.3: Commit

```bash
cd C:/Users/kirka/dev/attack-explorer
git add src/components/attack/FitCameraToViewport.tsx
git commit -m "chore(mobile): remove diagnostic console.log from FitCameraToViewport"
```

---

## Task 6: Production build + manual verification

This task is the gate before we declare the feature done. Code, tests, and types are not enough — we have to see the explorer behave correctly on a mobile viewport.

### - [ ] Step 6.1: Production build

Run: `cd C:/Users/kirka/dev/attack-explorer && npm run build`

Expected: successful build, no TypeScript errors, output similar to:
```
dist/index.html ...
dist/assets/index-*.css ...
dist/assets/index-*.js  ...
dist/assets/Scene-*.js  ~1.06 MB ...
```

### - [ ] Step 6.2: Start the dev server

Run (background): `cd C:/Users/kirka/dev/attack-explorer && npm run dev`

Note the URL it prints (typically `http://localhost:5173`, or 5174 if 5173 is busy).

### - [ ] Step 6.3: Manual checklist in Edge or Chrome (with hardware accel enabled)

Open the dev URL, F12 → device emulation toolbar (Ctrl+Shift+M) → choose "iPhone 12 Pro" or similar portrait phone. Verify every item:

1. **Full graph visible.** Tactic hexagons across the top, technique dot cloud below, group constellation in the back plane, software constellation deepest. Not just dots in the center.
2. **Hamburger button visible.** Top-left of the canvas, labelled "Filters" with the &#9776; icon.
3. **Open drawer.** Tap hamburger. Drawer slides in from the left containing the search box, four filter categories, and the Clear all link.
4. **Search works.** Type `T1059` in the search input. The 3D scene updates (matching technique highlighted, non-matching dimmed) as on desktop.
5. **Close drawer via backdrop.** Tap the dim area outside the drawer. Drawer slides back out.
6. **Open drawer + close via button.** Open again, then tap the "Close" button in the drawer header. Drawer dismisses.
7. **Tap a node.** Tap a visible technique dot. The bottom sheet slides up with the node's name, description, platform tags, etc.
8. **Close sheet.** Tap "Close" in the sheet header. Sheet slides down, the URL focus query parameter is removed (check `chrome://flags`-style — easier: copy the URL and verify there's no `?focus=...`).
9. **Rotate to landscape (in DevTools, click the rotate icon).** The desktop layout returns: left sidebar visible (if its toggle was open), no hamburger.
10. **Rotate back to portrait.** Mobile layout returns: hamburger reappears, sidebar collapses behind the drawer.
11. **Resize manually to ~700px and back to 1000px.** Verify the layout switches as the viewport crosses 768px.

If any item fails, document what failed in the commit-block notes for Step 6.5 and fix before continuing.

### - [ ] Step 6.4: Stop the dev server

Use the TaskStop tool on the dev-server background task, or Ctrl+C if running in the foreground.

### - [ ] Step 6.5: Final commit (only if 6.3 passed cleanly)

Nothing should need committing here — all production changes were committed in tasks 1-5. If the manual run revealed issues, return to the relevant task, fix, re-test, and commit. Only after a clean manual checklist do we declare the feature done.

---

## Self-Review

- **Spec coverage:** Every section of the spec is covered. The `useIsMobile` hook → Task 1. `MobileSidebarDrawer` → Task 2. `MobileDetailSheet` → Task 3. `AppShell` modification + `App.tsx` callback wiring → Task 4. Camera-fit `console.log` cleanup → Task 5. Manual verification → Task 6.
- **Placeholder scan:** No TBDs, no "implement later", no vague-validation steps. Every code block is complete and runnable.
- **Type consistency:** `useIsMobile(breakpointPx?: number): boolean` consistent across tests and impl. `MobileSidebarDrawer` and `MobileDetailSheet` share `{ open, onClose, children }` props consistently. `AppShell` adds `onSidebarOpenChange: (open: boolean) => void` and `onClearSelection: () => void` — both matched at the call site in `App.tsx` step 4.3.
- **Camera-fit integration:** The `controls.update()` + `camera.lookAt(0,0,0)` fix from the prior debugging session is already in the file; Task 5 only removes the diagnostic log. Plan does not re-derive that code because it has already been written and committed-ready.
