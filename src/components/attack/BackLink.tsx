/**
 * BackLink: a "Back to project page" anchor positioned at the top-right of the
 * canvas area. Mounted via AppShell's canvasOverlays prop, which absolutely
 * positions children inside the <main> element.
 *
 * In the standalone app this points back to the portfolio project page.
 */
export default function BackLink() {
  return (
    <a
      href="https://kirkabbott.com/lab/attack-explorer"
      className="absolute top-3 right-3 z-10 text-sm text-medteal hover:text-lightteal bg-darkblue/95 px-3 py-2 rounded border border-darkteal/40 hover:border-medteal transition-colors"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {/* HTML entity for left arrow — avoids Windows charmap encoding errors */}
      &larr; Back to project page
    </a>
  );
}
