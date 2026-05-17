/**
 * SidebarToggle: a small button anchored to the top-left of the canvas area.
 * Clicking it calls onToggle to flip the sidebarOpen state managed by
 * ExplorerLayout in app.tsx.
 *
 * Positioned with absolute (not fixed) so it is scoped to the <main> canvas
 * column inside AppShell. This prevents it from overlapping the sidebar when
 * that panel is open — absolute top-3 left-3 places it at the left edge of
 * the canvas, which is always to the right of the sidebar.
 * z-10 is sufficient for viewport-scoped stacking; z-50 was only needed when
 * the element was fixed to the full viewport.
 * Hidden on mobile (hidden md:flex) because the sidebar is already hidden on
 * small screens via AppShell's hidden md:block class on the aside element.
 */

interface Props {
  /** Whether the filter sidebar is currently visible */
  open: boolean;
  /** Callback that flips the open state in the parent */
  onToggle: () => void;
}

export default function SidebarToggle({ open, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Hide filter sidebar' : 'Show filter sidebar'}
      aria-pressed={open}
      className="hidden md:flex absolute top-3 left-3 z-10 items-center gap-1.5 px-2.5 py-1.5 text-xs bg-darkblue/85 hover:bg-darkblue text-medteal hover:text-lightteal border border-darkteal/40 rounded"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {/* Angle-bracket chevron — ⟨ open, ⟩ closed — indicates sidebar direction.
          Using HTML entities avoids Windows charmap encoding issues in the build. */}
      <span aria-hidden="true">{open ? '⟨' : '⟩'}</span>
      <span>{open ? 'Hide filters' : 'Show filters'}</span>
    </button>
  );
}
