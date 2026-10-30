import { act, fireEvent, render, screen } from '@testing-library/react';
import { SynThemeProvider } from '@syena/ds';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

// A device whose preference can change while the page is open.
function device(dark: boolean) {
  const listeners = new Set<() => void>();
  let isDark = dark;
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    get matches() { return q === '(prefers-color-scheme: dark)' && isDark; },
    media: q,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return { set: (next: boolean) => { isDark = next; listeners.forEach((l) => l()); }, restore: () => { window.matchMedia = original; } };
}

const shown = () => document.documentElement.getAttribute('data-syn-theme');
const mount = (compact = false) => render(
  <SynThemeProvider defaultChoice="system" storageKey={THEME_STORAGE_KEY}><ThemeToggle compact={compact} /></SynThemeProvider>,
);

describe('ThemeToggle', () => {
  let d: ReturnType<typeof device>;
  beforeEach(() => localStorage.clear());
  afterEach(() => d?.restore());

  it('offers System, Light, Dark in that order, with System selected for a new visitor', () => {
    d = device(true);
    mount();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toEqual(['System', 'Light', 'Dark']);
    expect(screen.getByLabelText('System')).toBeChecked();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('System follows a change of the device live, with no reload', () => {
    d = device(true);
    mount();
    expect(shown()).toBe('night');
    act(() => d.set(false));
    expect(shown()).toBe('tidewater');
    act(() => d.set(true));
    expect(shown()).toBe('night');
  });

  it('Light and Dark persist and win over the device', () => {
    d = device(true);
    mount();
    fireEvent.click(screen.getByLabelText('Light'));
    expect(shown()).toBe('tidewater');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('tidewater');
    act(() => d.set(false)); act(() => d.set(true));
    expect(shown()).toBe('tidewater');
    fireEvent.click(screen.getByLabelText('Dark'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('night');
  });

  it('choosing System clears the stored choice and follows the device again', () => {
    d = device(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'tidewater');
    mount();
    expect(screen.getByLabelText('Light')).toBeChecked();
    fireEvent.click(screen.getByLabelText('System'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(shown()).toBe('night');
    act(() => d.set(false));
    expect(shown()).toBe('tidewater');
  });

  it('a returning visitor\'s stored choice is applied on first render', () => {
    d = device(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'tidewater');
    mount();
    expect(shown()).toBe('tidewater');
  });

  it('compact: one icon button that cycles System → Light → Dark → System, naming the current choice and the next', () => {
    d = device(true);
    mount(true);
    expect(screen.queryByRole('radio')).toBeNull();
    const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('button', { name: 'Theme: System. Switch to Light' })).toBeEnabled();
    click('Theme: System. Switch to Light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('tidewater');
    click('Theme: Light. Switch to Dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('night');
    click('Theme: Dark. Switch to System');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Theme: System. Switch to Light' })).toBeInTheDocument();
  });
});
