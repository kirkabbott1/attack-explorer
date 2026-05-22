import { useEffect } from 'react';
import { useSelection } from '@/lib/attack/context';

interface Props {
  // Ref pointing to the search input element inside FilterSidebar -> SearchBox.
  // Used to programmatically focus the input when the user presses / or Cmd+K.
  // React 19 types: useRef<T>(null) returns RefObject<T | null>, so we accept that here.
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * Global keyboard shortcut handler for the explorer app.
 *
 *  /     - focus the search input (ignored when already typing in an input/textarea)
 *  Cmd+K - same as / (Ctrl+K on Windows/Linux)
 *  Esc   - close the detail panel by clearing the current selection
 *
 * This component renders nothing -- it registers a single keydown listener on window
 * and cleans it up on unmount or when dependencies change.
 */
export default function KeyboardShortcuts({ searchInputRef }: Props) {
  // setSelection maps to setFocusId in context. Calling it with null closes the detail panel.
  const [, setSelection] = useSelection();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Determine whether the event originated from a text input so we can skip
      // the / shortcut -- we do not want to swallow slashes the user types into fields.
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea';

      // Escape always closes the detail panel regardless of where focus is.
      if (e.key === 'Escape') {
        setSelection(null);
        return;
      }

      // Do not intercept typing-related shortcuts when an input has focus.
      if (inInput) return;

      // '/' key: focus search (without modifier keys, to avoid clashing with browser shortcuts).
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Cmd+K (macOS) or Ctrl+K (Windows/Linux): also focuses search.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handler);
    // Cleanup: remove listener when the component unmounts or deps change.
    return () => window.removeEventListener('keydown', handler);
  }, [setSelection, searchInputRef]);

  // No visual output -- purely a side-effect component.
  return null;
}
