// Reads and writes the explorer's filter/focus state to the URL query string.
// Replaces the next/router shallow routing used while the explorer lived in Next.js.

/** Parse the current URL query string into a flat string record. */
export function readQuery(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Replace the URL query string with the given record. Uses replaceState so it
 * does not reload the page or add a history entry. An empty record clears the
 * query string entirely.
 */
export function writeQuery(record: Record<string, string>): void {
  const qs = new URLSearchParams(record).toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}
