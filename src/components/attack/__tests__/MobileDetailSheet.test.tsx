// MobileDetailSheet.test.tsx
// Verifies the bottom-sheet renders children when open, hides them when closed,
// and calls onClose for Escape and explicit close button. The sheet has no
// backdrop (canvas under the sheet stays interactive), so there is no backdrop test.

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobileDetailSheet from '../MobileDetailSheet';

describe('MobileDetailSheet', () => {
  test('renders children when open', () => {
    render(
      <MobileDetailSheet open={true} onClose={() => {}}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    expect(screen.getByText('node detail content')).toBeInTheDocument();
  });

  test('hides the sheet from assistive tech when closed', () => {
    render(
      <MobileDetailSheet open={false} onClose={() => {}}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    const sheet = screen.getByLabelText('Selected node details');
    expect(sheet).toHaveAttribute('aria-hidden', 'true');
  });

  test('exposes the sheet to assistive tech when open', () => {
    render(
      <MobileDetailSheet open={true} onClose={() => {}}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    const sheet = screen.getByLabelText('Selected node details');
    expect(sheet).toHaveAttribute('aria-hidden', 'false');
  });

  test('calls onClose when Escape is pressed while open', () => {
    const onClose = jest.fn();
    render(
      <MobileDetailSheet open={true} onClose={onClose}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('renders an explicit close button that calls onClose', () => {
    const onClose = jest.fn();
    render(
      <MobileDetailSheet open={true} onClose={onClose}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    fireEvent.click(screen.getByRole('button', { name: /close details/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not respond to Escape when closed', () => {
    const onClose = jest.fn();
    render(
      <MobileDetailSheet open={false} onClose={onClose}>
        <div>node detail content</div>
      </MobileDetailSheet>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
