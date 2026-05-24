import { lazy, Suspense, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { GraphData, SearchIndex, FilterState } from '@/lib/attack/types';
import { AttackProvider, useSelection } from '@/lib/attack/context';
import { decodeStateFromQuery, encodeStateToQuery } from '@/lib/attack/url';
import { readQuery, writeQuery } from '@/lib/attack/history';
import AppShell from '@/components/attack/AppShell';
import FilterSidebar from '@/components/attack/FilterSidebar';
import DetailPanel from '@/components/attack/DetailPanel';
import KeyboardShortcuts from '@/components/attack/KeyboardShortcuts';
import SidebarToggle from '@/components/attack/SidebarToggle';
import InfoPanel from '@/components/attack/InfoPanel';
import BackLink from '@/components/attack/BackLink';

// R3F + Three.js is a large bundle; lazy-load the Scene so it becomes a
// separate chunk and the data-loading UI can paint first.
const Scene = lazy(() => import('@/components/attack/Scene'));

/**
 * Inner layout — must live inside AttackProvider so it can call useSelection().
 * detailPanelOpen is derived from focusId; sidebarOpen is local UI state.
 */
function ExplorerLayout() {
  // We now need both focusId AND setSelection so the detail sheet's close
  // button can clear the selection (which derives detailPanelOpen, and also
  // clears the URL query state via the existing onStateChange wiring).
  const [focusId, setSelection] = useSelection();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Desktop starts with the sidebar open (matches prior behaviour); mobile
  // starts with the drawer closed so the canvas is visible on first load and
  // the user opens the drawer via the hamburger button. The useState lazy
  // initialiser reads window.innerWidth once on mount — we don't need a
  // reactive subscription here because we want the user's later toggles to
  // persist across orientation changes. AppShell's own useIsMobile call is
  // the reactive source of truth for which layout tree to render.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 768,
  );

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

// Shape of the state once both JSON files have loaded.
interface LoadedState {
  graph: GraphData;
  searchIndex: SearchIndex;
}

/**
 * Root component for the standalone ATT&CK 3D Explorer.
 * Fetches the pre-built static JSON on mount, seeds filter/focus state from
 * the URL query string, and renders the scene inside the context provider.
 */
export default function App() {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initial filter/focus state, decoded from the URL query string once on mount.
  const initial = useMemo(() => decodeStateFromQuery(readQuery()), []);

  // Push filter/focus changes back to the URL without reloading.
  const handleStateChange = useCallback((filters: FilterState, focusId: string | null) => {
    writeQuery(encodeStateToQuery({ filters, focusId }));
  }, []);

  // Fetch the two static data files in parallel on first mount.
  useEffect(() => {
    Promise.all([
      fetch('/data/attack-graph.json').then(r => r.json()),
      fetch('/data/attack-index.json').then(r => r.json()),
    ])
      .then(([graph, searchIndex]) => setLoaded({ graph, searchIndex }))
      .catch(err => setError(String(err)));
  }, []);

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-darkblue text-red-300">
        Failed to load ATT&amp;CK data: {error}
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-darkblue text-lightteal/60">
        Loading ATT&amp;CK data...
      </div>
    );
  }

  return (
    <AttackProvider
      graph={loaded.graph}
      searchIndex={loaded.searchIndex}
      initialFilters={initial.filters}
      initialFocusId={initial.focusId ?? null}
      onStateChange={handleStateChange}
    >
      <ExplorerLayout />
    </AttackProvider>
  );
}
