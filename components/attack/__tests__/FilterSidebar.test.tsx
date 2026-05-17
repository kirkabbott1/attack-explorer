import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttackProvider } from '@/lib/attack/context';
import FilterSidebar from '../FilterSidebar';
import type { GraphData, SearchIndex } from '@/lib/attack/types';
import fixture from '@/lib/attack/__tests__/fixtures/mini-graph.json';

// Cast the imported JSON fixture to the typed GraphData shape.
const graph = fixture as GraphData;
// Empty search index — not exercised by these tests.
const searchIndex: SearchIndex = { entries: [] };

// Helper: renders FilterSidebar wrapped in the AttackProvider so context hooks work.
function renderSidebar() {
  return render(
    <AttackProvider graph={graph} searchIndex={searchIndex}>
      <FilterSidebar />
    </AttackProvider>
  );
}

describe('FilterSidebar', () => {
  // Each section heading must be visible so users can identify the filter group.
  test('renders sections for Platform, Tactic, Group, Software', () => {
    renderSidebar();
    expect(screen.getByRole('heading', { name: /platform/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /tactic/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /group/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /software/i })).toBeInTheDocument();
  });

  // The mini-graph fixture has Linux, Windows, macOS across its techniques.
  test('shows a chip for each unique platform across techniques', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /linux/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /windows/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /macos/i })).toBeInTheDocument();
  });

  // Clicking a chip toggles aria-pressed between true and false.
  test('clicking a platform chip toggles its selected state', () => {
    renderSidebar();
    const linuxChip = screen.getByRole('button', { name: /linux/i });
    fireEvent.click(linuxChip);
    expect(linuxChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(linuxChip);
    expect(linuxChip).toHaveAttribute('aria-pressed', 'false');
  });

  // "Clear all" must reset every active filter chip back to deselected.
  test('Clear all link clears every selected filter', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /linux/i }));
    fireEvent.click(screen.getByRole('button', { name: /windows/i }));
    fireEvent.click(screen.getByText(/clear all/i));
    expect(screen.getByRole('button', { name: /linux/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /windows/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
