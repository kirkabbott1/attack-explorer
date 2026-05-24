// MobileHint.test.tsx
// Verifies the one-shot hint pill renders by default, auto-dismisses on
// selection, manual-dismisses on click, and respects the localStorage flag
// across mounts.

import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobileHint from '../MobileHint';
import { AttackProvider } from '@/lib/attack/context';
import type { GraphData, SearchIndex } from '@/lib/attack/types';

// Minimal fixture -- the hint doesn't read graph data, but AttackProvider
// requires non-null arguments to mount. One tactic, one technique is enough.
const fakeGraph: GraphData = {
  version: '17.1',
  tactics: [{ id: 'TA0001', name: 'Initial Access', shortName: 'initial-access', order: 1 }],
  techniques: [{
    id: 'T1059', name: 'PowerShell', isSubtechnique: false,
    tacticIds: ['TA0001'], platforms: [],
  }],
  groups: [],
  software: [],
};
const fakeIndex: SearchIndex = { entries: [] };

function renderWithProvider(initialFocusId: string | null = null) {
  return render(
    <AttackProvider
      graph={fakeGraph}
      searchIndex={fakeIndex}
      initialFilters={{ platforms: [], tactics: [], groups: [], software: [] }}
      initialFocusId={initialFocusId}
    >
      <MobileHint />
    </AttackProvider>
  );
}

describe('MobileHint', () => {
  // Clear localStorage between tests so dismissals from one don't bleed into another.
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('renders the hint pill on first load when nothing is dismissed', () => {
    renderWithProvider();
    expect(screen.getByText(/tap a node to see connections/i)).toBeInTheDocument();
  });

  test('does not render when localStorage has the dismissed flag set', () => {
    window.localStorage.setItem('attack-explorer.mobileHint.dismissed.v1', '1');
    renderWithProvider();
    expect(screen.queryByText(/tap a node to see connections/i)).not.toBeInTheDocument();
  });

  test('clicking the pill dismisses it and persists the flag', () => {
    renderWithProvider();
    const pill = screen.getByRole('button', { name: /dismiss tip/i });
    fireEvent.click(pill);
    expect(screen.queryByText(/tap a node to see connections/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem('attack-explorer.mobileHint.dismissed.v1')).toBe('1');
  });

  test('auto-dismisses when a node becomes focused (initialFocusId non-null)', () => {
    renderWithProvider('T1059');
    // The effect runs after mount; flush it.
    act(() => {});
    expect(screen.queryByText(/tap a node to see connections/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem('attack-explorer.mobileHint.dismissed.v1')).toBe('1');
  });
});
