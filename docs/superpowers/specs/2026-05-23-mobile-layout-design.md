# Mobile Layout for ATT&CK 3D Explorer — Design Spec

Date: 2026-05-23
Status: Approved, awaiting implementation plan

## Problem

The explorer is currently unusable on phones. Two layered failures:

1. **Camera framing.** The Canvas in `src/components/attack/Scene.tsx` ships a
   fixed perspective camera at `position: [0, 30, 130]` with `fov: 50`. On a
   portrait phone viewport (aspect ~0.46) the horizontal frustum collapses to
   about 26% of its desktop width, clipping the tactics row, group
   constellation, and software constellation off-screen. Only the central
   technique dot cluster remains visible.
2. **UI presence.** Every interactive surface is `hidden md:block` or
   `hidden md:flex` — the filter sidebar (`AppShell.tsx:38`), the detail panel
   (`AppShell.tsx:56`), and the sidebar toggle (`SidebarToggle.tsx:30`). Below
   the Tailwind `md` breakpoint (768px) the layout collapses to a bare canvas
   with no way to search, filter, or inspect a node.

The result on a phone: a partial dot cloud floating on a blank dark-blue
background with no controls.

## Goals

- Mobile users can see the full 3D scene (tactics, techniques, groups, software).
- Mobile users can search, filter, and inspect nodes with parity to desktop.
- Desktop UX is pixel-identical to today.
- One source of truth for selection / filter state across both layouts.

## Non-Goals

- Touch gestures for drawer / sheet drag-to-dismiss (Escape, backdrop tap, and
  close buttons are enough for v1).
- Tuned landscape phone layout (the `md` breakpoint covers landscape phones
  with the existing desktop layout; this is intentional and acceptable).
- A separate tablet layout. Tablets in portrait fall under `md` and get the
  desktop layout — intentional, since they have enough horizontal space.

## Architecture

### Single source of truth: viewport hook

A new hook, `useIsMobile()`, returns a boolean based on
`window.innerWidth < 768`. It subscribes to the resize event and returns the
live value. The hook is the only place that reads `window.innerWidth` so the
breakpoint stays in one place. SSR-safe (returns `false` until first effect run).

### Layout branching in AppShell

`AppShell.tsx` reads `useIsMobile()` and renders one of two layout trees:

- **Desktop tree (current code, unchanged).** Three-column flex with left
  aside, center main, right aside.
- **Mobile tree (new).** Full-bleed canvas as the only layout child, plus
  two overlays positioned absolutely inside `<main>`:
  - A hamburger button anchored top-left (visible only on mobile).
  - A `MobileSidebarDrawer` slide-in from the left.
  - A `MobileDetailSheet` slide-up from the bottom.

The hamburger button is inline JSX inside the mobile branch of `AppShell` —
not a separate component file, and not a modification of the existing
`SidebarToggle.tsx`. The existing `SidebarToggle.tsx` remains desktop-only
(its `hidden md:flex` class already handles that correctly).

### Component reuse

The two new mobile components are pure presentation wrappers. They embed the
existing `<FilterSidebar />` and `<DetailPanel />` verbatim — same context
hooks, same logic, same rendering. No duplication. If a filter or detail
behavior changes later, both layouts pick it up automatically.

## Components

### `src/lib/attack/useIsMobile.ts` (new)

```ts
export function useIsMobile(breakpointPx?: number): boolean;
```

- Default breakpoint: 768 (matches Tailwind `md`).
- Returns `false` on the server / before first effect run.
- Subscribes to `window` `resize` events; debounces is not needed —
  React already batches state updates.

### `src/components/attack/MobileSidebarDrawer.tsx` (new)

Props:
```ts
{ open: boolean; onClose: () => void; children: ReactNode }
```

- Renders a fixed-position container at z-index 30.
- Contains a backdrop (`bg-darkblue/60 backdrop-blur-sm`) and a panel.
- Panel translates `-translate-x-full` (closed) / `translate-x-0` (open) with
  a 200ms transform transition.
- Closes on backdrop click and on Escape keydown.
- Traps focus within the panel while open (basic implementation: focus the
  panel root on open, restore on close).
- Has its own internal scroll region; sized as `w-[min(85vw,320px)]` so it
  doesn't fully cover narrow phones.

### `src/components/attack/MobileDetailSheet.tsx` (new)

Props:
```ts
{ open: boolean; onClose: () => void; children: ReactNode }
```

- Renders a fixed-position container at z-index 30.
- Sized as `h-[60vh]` with rounded top corners. Backdrop optional —
  the canvas under the sheet stays interactive (matches Maps-style sheet).
- Panel translates `translate-y-full` (closed) / `translate-y-0` (open) with
  200ms transform transition.
- Header has a drag handle visual + close button. Body is `overflow-y-auto`.
- Closes by calling onClose, which the parent wires to `setSelection(null)`.

### `src/components/attack/AppShell.tsx` (modified)

- Calls `useIsMobile()` at the top.
- Returns the existing desktop layout when `!isMobile` — no code changes
  inside that branch.
- Returns the new mobile layout when `isMobile`, embedding the new components.

### `src/components/attack/Scene.tsx` (no change beyond existing camera-fit)

`FitCameraToViewport` was added in the prior fix. It addresses the camera
framing problem. The temporary `console.log` is removed in this work.

## Data Flow

| State              | Owner              | Mobile usage                                     |
| ------------------ | ------------------ | ------------------------------------------------ |
| `sidebarOpen`      | `ExplorerLayout`   | Drives drawer open/close (was desktop-only)      |
| `focusId`          | AttackProvider     | Drives sheet open/close (derived: open if !null) |
| `filters`          | AttackProvider     | Identical — read by FilterSidebar in both layouts|
| Drawer-specific UI | local to component | Backdrop visibility, focus trap                  |

Closing the bottom sheet calls `setSelection(null)`. That clears:
- The bottom sheet (derived).
- The URL focus query parameter (via existing `onStateChange`).
- The desktop detail panel (no-op on mobile, but maintains consistency).

This single-handler model is why the existing components can be reused
verbatim: they already react correctly to `focusId` and `filters`.

## Camera-fit Integration

The camera-fit work from the prior debugging session stays:

- `src/lib/attack/cameraFit.ts` — pure function.
- `src/components/attack/FitCameraToViewport.tsx` — R3F child that calls
  `camera.position.set`, `camera.lookAt(0,0,0)`, `camera.updateProjectionMatrix`,
  and `controls.update()`.
- The temporary `console.log` is removed before commit.

The camera fix is necessary even with proper mobile UI — without it, the
scene is still clipped horizontally and the new search/filter affordances
would land on a scene the user can't visually parse.

## Styling

Pure Tailwind. No new CSS files.

- Drawer: `fixed top-0 left-0 h-full w-[min(85vw,320px)] z-30
  transform transition-transform duration-200`.
- Sheet: `fixed bottom-0 left-0 right-0 h-[60vh] z-30 rounded-t-xl
  transform transition-transform duration-200`.
- Backdrop: `fixed inset-0 bg-darkblue/60 backdrop-blur-sm z-20`.
- Hamburger: `absolute top-3 left-3 z-10 md:hidden`.

The `md:hidden` / `md:block` pairs draw a clean line between desktop and
mobile presentations. No JS-driven viewport sniffing for visibility —
just CSS — except inside `AppShell` itself, which needs the `useIsMobile`
hook to decide which layout tree to render.

## Testing

### Unit tests

- `src/lib/attack/__tests__/useIsMobile.test.ts` — mock `window.innerWidth`
  and resize events, verify hook returns expected booleans, verify cleanup on
  unmount.
- Existing 115 tests stay green; this work doesn't touch their domain.

### Manual verification (Edge + DevTools mobile emulation)

1. Open the dev server in Edge, F12 → Ctrl+Shift+M → "iPhone 12 Pro".
2. Full 3D scene visible (tactics row + technique dots + group + software).
3. Hamburger button visible top-left.
4. Tap hamburger → drawer slides in with search and filters.
5. Tap a category → filter applies, scene updates as on desktop.
6. Tap outside drawer → drawer closes.
7. Tap a technique node → bottom sheet slides up with details.
8. Tap close on sheet → sheet slides down, `focusId` clears, URL updates.
9. Rotate device to landscape → desktop layout returns; back to portrait → mobile returns.

## Risks / Open Questions

- **Z-index conflicts with R3F Canvas.** The Canvas owns its own DOM. The
  drawer/sheet are siblings of the Canvas under `<main>`. As long as their
  z-index is above 0 (Canvas default), they overlay correctly.
- **Focus trap implementation.** Plan to use a minimal approach (focus root on
  open, restore on close). If the lab-style focus trap requirements grow,
  we'd reach for `focus-trap-react` — but YAGNI for now.
- **Hamburger discoverability.** A single button with no label might be
  unclear to first-time mobile users. Mitigate with `aria-label="Show
  filters"` and a visible text label (`Filters`) next to the icon at this
  small button density.

## Out-of-Scope

Listed once more for explicit boundary:

- Drag gestures (only tap, click, and Escape).
- Landscape-phone-specific layout.
- Tablet-portrait-specific layout.
- Pinch-zoom UX changes (R3F OrbitControls already handles touch).
- Hardening against pre-existing mobile bugs unrelated to layout
  (e.g., R3F pointer-event quirks on specific devices).

## File Inventory

| File                                                          | Action  |
| ------------------------------------------------------------- | ------- |
| `src/lib/attack/useIsMobile.ts`                               | NEW     |
| `src/lib/attack/__tests__/useIsMobile.test.ts`                | NEW     |
| `src/components/attack/MobileSidebarDrawer.tsx`               | NEW     |
| `src/components/attack/MobileDetailSheet.tsx`                 | NEW     |
| `src/components/attack/AppShell.tsx`                          | MODIFY  |
| `src/components/attack/FitCameraToViewport.tsx`               | MODIFY (remove console.log) |
| `src/components/attack/SidebarToggle.tsx`                     | NO CHANGE (already correctly hidden on mobile) |
| `src/components/attack/Scene.tsx`                             | NO CHANGE |

Total: 4 new files, 2 modified files.
