import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttackProvider } from '@/lib/attack/context';
import SearchBox from '../SearchBox';
import type { GraphData, SearchIndex } from '@/lib/attack/types';
import fixture from '@/lib/attack/__tests__/fixtures/mini-graph.json';

// Cast the imported JSON fixture to the typed GraphData shape.
const graph = fixture as GraphData;

// Search index with three representative entries covering technique and group types.
const searchIndex: SearchIndex = {
  entries: [
    { id: 'T1059', type: 'technique', name: 'Command and Scripting Interpreter', aliases: [], description: '' },
    { id: 'T1059.001', type: 'technique', name: 'PowerShell', aliases: [], description: '' },
    { id: 'G0016', type: 'group', name: 'APT29', aliases: ['Cozy Bear'], description: '' },
  ],
};

// Helper: renders SearchBox wrapped in AttackProvider so context hooks resolve.
function renderSearchBox() {
  return render(
    <AttackProvider graph={graph} searchIndex={searchIndex}>
      <SearchBox />
    </AttackProvider>
  );
}

describe('SearchBox', () => {
  // The input must always be present so the user can type a query.
  test('renders an input', () => {
    renderSearchBox();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  // No results list should render until the user has typed something.
  test('shows no results when empty', () => {
    renderSearchBox();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // Typing a partial query should surface matching entries ranked by relevance.
  test('shows ranked results when user types', async () => {
    renderSearchBox();
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'powershell' } });
    await waitFor(() => {
      expect(screen.getByText('PowerShell')).toBeInTheDocument();
    });
  });

  // Clicking a result should call setSelection with that entry's id, which clears the
  // query string and removes the results list from the DOM.
  test('clicking a result sets the selection', async () => {
    renderSearchBox();
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'apt29' } });
    await waitFor(() => screen.getByText('APT29'));
    fireEvent.click(screen.getByText('APT29'));
    expect(screen.queryByText('APT29')).not.toBeInTheDocument();
  });
});
