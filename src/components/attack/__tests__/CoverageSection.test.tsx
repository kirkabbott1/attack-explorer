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
    expect(screen.getByText(/coverage layer/i)).toBeInTheDocument();
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

    // Stub the anchor-click download.
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
    const parsed = JSON.parse(text);
    expect(parsed.domain).toBe('enterprise-attack');
    expect(parsed.versions).toEqual(expect.objectContaining({ layer: '4.5' }));
    expect(Array.isArray(parsed.techniques)).toBe(true);

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });
});
