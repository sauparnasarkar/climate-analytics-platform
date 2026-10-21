import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('compact: one icon button with an accessible name that switches to the other theme', () => {
    const setTheme = vi.fn();
    render(<ThemeToggle theme="night" setTheme={setTheme} compact />);
    expect(screen.queryByText('Light')).toBeNull();
    const button = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(setTheme).toHaveBeenCalledWith('tidewater');
  });

  it('compact: from the light theme it offers dark', () => {
    const setTheme = vi.fn();
    render(<ThemeToggle theme="tidewater" setTheme={setTheme} compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(setTheme).toHaveBeenCalledWith('night');
  });

  it('full: the Light and Dark choices', () => {
    render(<ThemeToggle theme="night" setTheme={() => {}} />);
    expect(screen.getByLabelText('Light')).toBeInTheDocument();
    expect(screen.getByLabelText('Dark')).toBeChecked();
  });
});
