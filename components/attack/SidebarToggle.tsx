/**
 * SidebarToggle: a small fixed button anchored to the top-left of the viewport
 * (below the 3 px gap from the top edge). Clicking it calls onToggle to flip
 * the sidebarOpen state managed by ExplorerLayout in app.tsx.
 *
 * Positioned at top-3 left-3 (z-50) — same z-index as the "Back to project"
 * link in the top-right, so neither overlaps the other.
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
      className="hidden md:flex fixed top-3 left-3 z-50 items-center gap-1.5 px-2.5 py-1.5 text-xs bg-darkblue/85 hover:bg-darkblue text-medteal hover:text-lightteal border border-darkteal/40 rounded"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {/* Angle-bracket chevron — ⟨ open, ⟩ closed — indicates sidebar direction.
          Using HTML entities avoids Windows charmap encoding issues in the build. */}
      <span aria-hidden="true">{open ? '⟨' : '⟩'}</span>
      <span>{open ? 'Hide filters' : 'Show filters'}</span>
    </button>
  );
}
