import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CoverageSection from '../CoverageSection';
import { AttackProvider } from '@/lib/attack/context';
import type { GraphData, SearchIndex } from '@/lib/attack/types';
import fixture from '@/lib/attack/__tests__/fixtures/mini-graph.json';

const graph = fixture as GraphData;
const searchIndex: SearchIndex = { entries: [] };

function renderInProvider() {
  return render(
    <AttackProvider graph={graph} searchIndex={searchIndex}>
      <CoverageSection />
    </AttackProvider>,
  );
}

describe('CoverageSection — empty state', () => {
  beforeEach(() => window.localStorage.clear());

  test('renders the section heading and Import button', () => {
    renderInProvider();
    expect(screen.getByRole('button', { name: /import layer/i })).toBeInTheDocument();
    // Use getByRole('heading') so the query uniquely targets the sr-only <h3>
    // and is not ambiguous with the visible <span> that has identical text.
    expect(screen.getByRole('heading', { name: /coverage layer/i })).toBeInTheDocument();
  });

  test('does not show the toggle, clear, or export controls before any layer is loaded', () => {
    renderInProvider();
    expect(screen.queryByRole('button', { name: /coverage view/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^clear$/i })).not.toBeInTheDocument();
  });
});

describe('CoverageSection — import handling', () => {
  beforeEach(() => window.localStorage.clear());

  test('imports a valid layer and shows the loaded state', async () => {
    renderInProvider();
    const file = new File(
      [JSON.stringify({
        domain: 'enterprise-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        name: 'My Coverage',
        techniques: [{ techniqueID: graph.techniques[0].id, score: 80, enabled: true }],
      })],
      'layer.json',
      { type: 'application/json' },
    );

    const input = screen.getByTestId('coverage-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('My Coverage')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /coverage view/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^clear$/i })).toBeInTheDocument();
    });
  });

  test('rejects a wrong-domain layer with an error message and stays in empty state', async () => {
    renderInProvider();
    const file = new File(
      [JSON.stringify({
        domain: 'mobile-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        techniques: [],
      })],
      'wrong.json',
      { type: 'application/json' },
    );

    const input = screen.getByTestId('coverage-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/enterprise-attack/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /coverage view/i })).not.toBeInTheDocument();
  });
});

describe('CoverageSection — clear', () => {
  beforeEach(() => window.localStorage.clear());

  test('clear returns to the empty state and removes the persisted layer', async () => {
    renderInProvider();
    const file = new File(
      [JSON.stringify({
        domain: 'enterprise-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        name: 'Tmp',
        techniques: [{ techniqueID: graph.techniques[0].id, score: 50, enabled: true }],
      })],
      'layer.json',
    );
    fireEvent.change(screen.getByTestId('coverage-file-input'), { target: { files: [file] } });

    await waitFor(() => screen.getByRole('button', { name: /^clear$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Tmp')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /import layer/i })).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('attack-explorer.coverage.v1')).toBeNull();
  });
});

describe('CoverageSection — export', () => {
  beforeEach(() => window.localStorage.clear());

  // Helper that stubs out the Blob-download plumbing and returns the captured
  // blob text after clicking the Export button.
  async function clickExportAndCapture(): Promise<string> {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let capturedBlob: Blob | null = null;
    URL.createObjectURL = (b: Blob | MediaSource) => {
      capturedBlob = b as Blob;
      return 'blob:mock';
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = () => {};

    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(capturedBlob).not.toBeNull());
    const text = await capturedBlob!.text();

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    return text;
  }

  test('export produces a valid Navigator layer from the current filter selection', async () => {
    renderInProvider();
    // Import any layer just to surface the Export button.
    const tid = graph.techniques[0].id;
    const file = new File(
      [JSON.stringify({
        domain: 'enterprise-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        techniques: [{ techniqueID: tid, score: 100, enabled: true }],
      })],
      'l.json',
    );
    fireEvent.change(screen.getByTestId('coverage-file-input'), { target: { files: [file] } });
    await waitFor(() => screen.getByRole('button', { name: /export/i }));

    const text = await clickExportAndCapture();
    const parsed = JSON.parse(text);
    expect(parsed.domain).toBe('enterprise-attack');
    expect(parsed.versions).toEqual(expect.objectContaining({ layer: '4.5' }));
    expect(Array.isArray(parsed.techniques)).toBe(true);
  });

  // Item 4: export with NO filters active uses the "empty selection" label and
  // includes ALL techniques from the graph (no filter exclusion).
  test('export with no active filters names the layer "empty selection" and includes all techniques', async () => {
    renderInProvider();
    // Load any valid layer to surface the Export button.
    const file = new File(
      [JSON.stringify({
        domain: 'enterprise-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        techniques: [{ techniqueID: graph.techniques[0].id, score: 50, enabled: true }],
      })],
      'l.json',
    );
    fireEvent.change(screen.getByTestId('coverage-file-input'), { target: { files: [file] } });
    await waitFor(() => screen.getByRole('button', { name: /export/i }));

    const text = await clickExportAndCapture();
    const parsed = JSON.parse(text);

    // Name should contain "empty selection" when no filters are active.
    expect(parsed.name).toContain('empty selection');

    // All technique IDs from the mini-graph fixture must be present in the export.
    const exportedIds: string[] = parsed.techniques.map((t: { techniqueID: string }) => t.techniqueID);
    for (const t of graph.techniques) {
      expect(exportedIds).toContain(t.id);
    }
  });
});

// Item 5: importing a second layer replaces the first and resets viewActive to true.
describe('CoverageSection — re-import', () => {
  beforeEach(() => window.localStorage.clear());

  test('importing a second layer replaces the first and viewActive is true', async () => {
    renderInProvider();

    // Load first layer and toggle the view off.
    const firstFile = new File(
      [JSON.stringify({
        domain: 'enterprise-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        name: 'First Layer',
        techniques: [{ techniqueID: graph.techniques[0].id, score: 80, enabled: true }],
      })],
      'first.json',
    );
    fireEvent.change(screen.getByTestId('coverage-file-input'), { target: { files: [firstFile] } });
    await waitFor(() => screen.getByText('First Layer'));

    // Toggle the view off so aria-pressed becomes "false".
    fireEvent.click(screen.getByRole('button', { name: /coverage view/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /coverage view/i })).toHaveAttribute('aria-pressed', 'false'),
    );

    // Import a second layer; this should replace the first and reset viewActive to true.
    const secondFile = new File(
      [JSON.stringify({
        domain: 'enterprise-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        name: 'Second Layer',
        techniques: [{ techniqueID: graph.techniques[1].id, score: 90, enabled: true }],
      })],
      'second.json',
    );
    fireEvent.change(screen.getByTestId('coverage-file-input'), { target: { files: [secondFile] } });

    await waitFor(() => {
      // The second layer's name is visible; the first is gone.
      expect(screen.getByText('Second Layer')).toBeInTheDocument();
      expect(screen.queryByText('First Layer')).not.toBeInTheDocument();
      // viewActive must have been reset to true on import.
      expect(screen.getByRole('button', { name: /coverage view/i })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

// Item 6: Coverage view toggle aria-pressed reflects active/inactive state.
describe('CoverageSection — aria-pressed', () => {
  beforeEach(() => window.localStorage.clear());

  test('Coverage view toggle has aria-pressed="true" when active and "false" when off', async () => {
    renderInProvider();
    const file = new File(
      [JSON.stringify({
        domain: 'enterprise-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        name: 'ToggleTest',
        techniques: [{ techniqueID: graph.techniques[0].id, score: 70, enabled: true }],
      })],
      'toggle.json',
    );
    fireEvent.change(screen.getByTestId('coverage-file-input'), { target: { files: [file] } });
    await waitFor(() => screen.getByRole('button', { name: /coverage view/i }));

    const btn = screen.getByRole('button', { name: /coverage view/i });

    // Initially on after import (viewActive = true).
    expect(btn).toHaveAttribute('aria-pressed', 'true');

    // Toggle off.
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'));

    // Toggle on again.
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'));
  });
});

// Item 7: cancelling the file picker (empty files list) does NOT throw or clear state.
describe('CoverageSection — empty file selection', () => {
  beforeEach(() => window.localStorage.clear());

  test('firing the change event with no files does not throw and leaves state unchanged', async () => {
    renderInProvider();
    // Simulate dialog cancel — files is an empty FileList-like object.
    const input = screen.getByTestId('coverage-file-input') as HTMLInputElement;
    // Firing without a files override means e.target.files is either null or
    // has length 0; in jsdom the default is null when no files property is set.
    expect(() => fireEvent.change(input, { target: { files: [] } })).not.toThrow();
    // Component should still be in the empty/import state.
    expect(screen.getByRole('button', { name: /import layer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /coverage view/i })).not.toBeInTheDocument();
  });
});

// Item 8: unknown technique IDs in the imported layer surface a warning text.
describe('CoverageSection — warning surfacing', () => {
  beforeEach(() => window.localStorage.clear());

  test('importing a layer with an unknown technique ID shows a warning', async () => {
    renderInProvider();
    // T9999 is not in the mini-graph fixture, so the parser emits a warning.
    const file = new File(
      [JSON.stringify({
        domain: 'enterprise-attack',
        versions: { attack: '17', navigator: '5', layer: '4.5' },
        name: 'Warn Layer',
        techniques: [
          { techniqueID: graph.techniques[0].id, score: 60, enabled: true },
          { techniqueID: 'T9999', score: 50, enabled: true },
        ],
      })],
      'warn.json',
    );
    fireEvent.change(screen.getByTestId('coverage-file-input'), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Warn Layer')).toBeInTheDocument();
      // The parser warns "1 technique ID … not present in the current ATT&CK graph".
      expect(screen.getByText(/not present in the current att&ck graph/i)).toBeInTheDocument();
    });
  });
});
