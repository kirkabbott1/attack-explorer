import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { GraphData, SearchIndex, FilterState } from '@/lib/attack/types';
import { AttackProvider, useSelection } from '@/lib/attack/context';
import { decodeStateFromQuery, encodeStateToQuery } from '@/lib/attack/url';
import AppShell from '@/components/attack/AppShell';
import FilterSidebar from '@/components/attack/FilterSidebar';
import DetailPanel from '@/components/attack/DetailPanel';
import KeyboardShortcuts from '@/components/attack/KeyboardShortcuts';
import SidebarToggle from '@/components/attack/SidebarToggle';
import InfoPanel from '@/components/attack/InfoPanel';
import BackLink from '@/components/attack/BackLink';

// R3F (React Three Fiber) is client-only, so we disable SSR for the Scene component.
// This prevents hydration errors since Three.js relies on browser APIs (WebGL, canvas).
const Scene = dynamic(() => import('@/components/attack/Scene'), { ssr: false });

/**
 * Inner layout component that reads selection state from context.
 * It must live inside AttackProvider so it can call useSelection() - which is
 * why we cannot put this logic directly in AttackExplorerApp (the provider
 * wraps ExplorerLayout, not the other way round).
 * detailPanelOpen is derived from focusId so AppShell can animate the column width.
 *
 * Also creates the searchInputRef that is threaded through:
 *   ExplorerLayout -> FilterSidebar -> SearchBox (ref lands on the <input>)
 *   ExplorerLayout -> KeyboardShortcuts (reads the ref to call .focus())
 *
 * sidebarOpen state is managed here so SidebarToggle can flip it and AppShell
 * can hide/show the left aside column accordingly. Defaults to open on desktop
 * (the aside is already hidden on mobile via hidden md:block in AppShell).
 */
function ExplorerLayout() {
  // Read the current focus id from context to drive the panel open/closed state.
  const [focusId] = useSelection();

  // Ref pointing to the search input inside SearchBox. Passed to both FilterSidebar
  // (to forward onto the input element) and KeyboardShortcuts (to call .focus()).
  // React 19 types: useRef<T>(null) produces RefObject<T | null>.
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Whether the left filter sidebar is currently expanded. Toggled by SidebarToggle.
  // Defaults to true (open) so desktop users see the filters on first load.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <>
      {/* KeyboardShortcuts: registers global keydown listener for /, Cmd+K, and Esc.
          Must live inside AttackProvider so it can call useSelection(). Renders no
          visible UI, so it stays as a sibling of AppShell. */}
      <KeyboardShortcuts searchInputRef={searchInputRef} />

      <AppShell
        sidebar={<FilterSidebar searchInputRef={searchInputRef} />}
        canvas={<Scene />}
        canvasOverlays={
          <>
            {/* SidebarToggle: absolutely positioned inside <main> (the canvas column) so
                it sits at the left edge of the canvas area, not the left edge of the
                viewport. This prevents it from overlapping the sidebar when it is open. */}
            <SidebarToggle open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />

            {/* InfoPanel: absolutely positioned inside <main> at bottom-right so it does
                not overlap the sidebar (left) or the detail panel (right aside column). */}
            <InfoPanel />

            {/* BackLink: absolutely positioned inside <main> at top-right. Scoping it
                here (not fixed to the viewport) ensures it never overlaps the detail
                panel header — the panel is a separate aside column outside <main>. */}
            <BackLink />
          </>
        }
        detailPanel={<DetailPanel />}
        detailPanelOpen={focusId !== null}
        sidebarOpen={sidebarOpen}
      />
    </>
  );
}

// Shape of the state once both JSON files have been fetched successfully.
interface LoadedState {
  graph: GraphData;
  searchIndex: SearchIndex;
}

/**
 * Full-bleed application page for the ATT&CK 3D Explorer.
 *
 * This page intentionally skips the default site Layout (navbar, footer, etc.)
 * so the 3D canvas can fill the entire viewport. It fetches the pre-built static
 * JSON files on mount, then renders the scene wrapped in the global context
 * provider and the AppShell layout (sidebar + canvas + detail panel).
 *
 * Per-page layout opt-out: attaching getLayout = (page) => page tells _app.js
 * to skip the default Layout wrapper for this route.
 */
export default function AttackExplorerApp() {
  // Holds both data blobs once they have loaded, or null while loading.
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  // Holds a human-readable error string if either fetch fails.
  const [error, setError] = useState<string | null>(null);

  // Next.js router — used to read initial state from URL query params and to
  // push updated state back to the URL without a full page reload.
  const router = useRouter();

  // Decode initial filters and focusId from the URL query string.
  // Returns null while router is still hydrating (router.isReady === false),
  // so we can gate the provider render until both data and URL are ready.
  const initial = useMemo(() => {
    if (!router.isReady) return null;
    // Cast router.query to the shape decodeStateFromQuery expects.
    return decodeStateFromQuery(router.query as Record<string, string | string[] | undefined>);
  }, [router.isReady, router.query]);

  // Push filter/focus state changes back to the URL without a full navigation.
  // shallow: true tells Next.js to update the URL bar only — no server round-trip
  // and no re-mounting of the page component.
  const handleStateChange = useCallback((filters: FilterState, focusId: string | null) => {
    const query = encodeStateToQuery({ filters, focusId });
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }, [router]);

  // Fetch the two static JSON data files in parallel on first mount.
  // These are generated by the build script and served from /public/data/.
  useEffect(() => {
    Promise.all([
      fetch('/data/attack-graph.json').then(r => r.json()),
      fetch('/data/attack-index.json').then(r => r.json()),
    ])
      .then(([graph, searchIndex]) => setLoaded({ graph, searchIndex }))
      .catch(err => setError(String(err)));
  }, []);

  return (
    <>
      <Head>
        <title>ATT&amp;CK 3D Explorer</title>
        <meta name="description" content="Interactive 3D explorer of MITRE ATT&CK Enterprise." />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        {/* Remove default body margin/padding and prevent scrollbars on the 3D canvas page. */}
        <style>{`html, body { margin: 0; padding: 0; overflow: hidden; }`}</style>
      </Head>

      {/* Error state: data fetch failed. Shown instead of the canvas. */}
      {error && (
        <div className="fixed inset-0 flex items-center justify-center bg-darkblue text-red-300">
          Failed to load ATT&amp;CK data: {error}
        </div>
      )}

      {/* Loaded state: render the full 3D explorer.
          We gate on both `loaded` (data ready) and `initial` (router.isReady),
          so AttackProvider always receives the correct URL-derived initial state.
          ExplorerLayout lives inside AttackProvider so it can call useSelection()
          to derive detailPanelOpen and pass it to AppShell. */}
      {loaded && initial && (
        <AttackProvider
          graph={loaded.graph}
          searchIndex={loaded.searchIndex}
          initialFilters={initial.filters}
          initialFocusId={initial.focusId ?? null}
          onStateChange={handleStateChange}
        >
          <ExplorerLayout />
        </AttackProvider>
      )}

      {/* Loading state: shown while the JSON fetches are in flight. */}
      {!loaded && !error && (
        <div className="fixed inset-0 flex items-center justify-center bg-darkblue text-lightteal/60">
          Loading ATT&amp;CK data...
        </div>
      )}
    </>
  );
}

// Opt out of the default site Layout for this full-bleed page.
// _app.js reads this property and skips wrapping with Layout/Navbar/Footer.
AttackExplorerApp.getLayout = (page: React.ReactElement) => page;
