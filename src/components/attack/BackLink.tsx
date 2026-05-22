import Link from 'next/link';

/**
 * BackLink: renders a "Back to project page" anchor positioned at the top-right
 * of the canvas area (NOT the viewport).
 *
 * It is mounted via AppShell's canvasOverlays prop, which places children inside
 * the <main> element using absolute positioning. Because <main> is bounded by the
 * AppShell flex layout (sidebar on left, detail panel on right as a separate aside),
 * this link will never overlap the detail panel header or the filter sidebar —
 * it always sits within the canvas column only.
 *
 * z-10 is sufficient here since we are scoped to <main>, not the full viewport.
 */
export default function BackLink() {
  return (
    <Link
      href="/lab/attack-explorer"
      className="absolute top-3 right-3 z-10 text-sm text-medteal hover:text-lightteal bg-darkblue/95 px-3 py-2 rounded border border-darkteal/40 hover:border-medteal transition-colors"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {/* HTML entity for left arrow — avoids Windows charmap encoding errors */}
      &larr; Back to project page
    </Link>
  );
}
