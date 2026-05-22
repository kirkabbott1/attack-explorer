import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttackProvider } from '@/lib/attack/context';
import DetailPanel from '../DetailPanel';
import type { GraphData, SearchIndex } from '@/lib/attack/types';
import fixture from '@/lib/attack/__tests__/fixtures/mini-graph.json';

// Cast the imported JSON fixture to the typed GraphData shape.
const graph = fixture as GraphData;
// Empty search index - not exercised by these tests.
const searchIndex: SearchIndex = { entries: [] };

// Helper: renders DetailPanel wrapped in AttackProvider with a given initial focus id.
// This simulates the user having already selected a node in the 3D scene.
function renderPanel(focusId: string | null) {
  return render(
    <AttackProvider graph={graph} searchIndex={searchIndex} initialFocusId={focusId}>
      <DetailPanel />
    </AttackProvider>
  );
}

describe('DetailPanel', () => {
  // When nothing is selected the panel should not mount - AppShell collapses its column to 0 width.
  test('renders nothing when no node is selected', () => {
    const { container } = renderPanel(null);
    expect(container.firstChild).toBeNull();
  });

  // T1098 "Account Manipulation" is in the mini-graph fixture - both name and id must appear.
  test('renders technique info when a technique is selected', () => {
    renderPanel('T1098');
    expect(screen.getByText('Account Manipulation')).toBeInTheDocument();
    expect(screen.getByText('T1098')).toBeInTheDocument();
  });

  // G0016 (APT29) and G0032 (Lazarus Group) both list T1098 in their techniqueIds.
  // The panel should show both groups in the "Used by groups" section.
  test('renders related groups for a selected technique', () => {
    renderPanel('T1098');
    expect(screen.getByText(/APT29/)).toBeInTheDocument();
    expect(screen.getByText(/Lazarus Group/)).toBeInTheDocument();
  });

  // The panel must include an outbound link to the MITRE ATT&CK website for the selected node.
  test('renders an outbound link to attack.mitre.org', () => {
    renderPanel('T1098');
    const link = screen.getByRole('link', { name: /attack\.mitre\.org/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('T1098'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  // G0016 (APT29) has "Cozy Bear" as an alias - the group info section should surface it.
  test('renders group info when a group is selected', () => {
    renderPanel('G0016');
    expect(screen.getByText('APT29')).toBeInTheDocument();
    expect(screen.getByText(/Cozy Bear/)).toBeInTheDocument();
  });
});
