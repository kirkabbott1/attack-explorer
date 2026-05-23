// MobileSidebarDrawer.test.tsx
// Verifies the slide-in drawer renders children when open, hides them when
// closed, calls onClose on backdrop click and Escape, and is keyboard-accessible.

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobileSidebarDrawer from '../MobileSidebarDrawer';

describe('MobileSidebarDrawer', () => {
  test('renders children when open', () => {
    render(
      <MobileSidebarDrawer open={true} onClose={() => {}}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    expect(screen.getByText('filter content')).toBeInTheDocument();
  });

  test('hides the panel from assistive tech when closed', () => {
    render(
      <MobileSidebarDrawer open={false} onClose={() => {}}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    // Panel should still mount (so transitions work) but be aria-hidden when closed.
    const panel = screen.getByLabelText('Filters and search');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  test('exposes the panel to assistive tech when open', () => {
    render(
      <MobileSidebarDrawer open={true} onClose={() => {}}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    const panel = screen.getByLabelText('Filters and search');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  test('calls onClose when the backdrop is clicked', () => {
    const onClose = jest.fn();
    render(
      <MobileSidebarDrawer open={true} onClose={onClose}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    fireEvent.click(screen.getByTestId('drawer-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when Escape is pressed while open', () => {
    const onClose = jest.fn();
    render(
      <MobileSidebarDrawer open={true} onClose={onClose}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not call onClose on Escape when closed', () => {
    const onClose = jest.fn();
    render(
      <MobileSidebarDrawer open={false} onClose={onClose}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('renders an explicit close button that calls onClose', () => {
    const onClose = jest.fn();
    render(
      <MobileSidebarDrawer open={true} onClose={onClose}>
        <div>filter content</div>
      </MobileSidebarDrawer>
    );
    fireEvent.click(screen.getByRole('button', { name: /close filters/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
