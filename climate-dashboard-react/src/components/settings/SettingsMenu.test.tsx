import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReducedMotion } from '@syena/ds';
import { MOTION_STORAGE_KEY } from '../../lib/motion';
import { THEME_STORAGE_KEY } from '../../lib/theme';
import { AppProviders } from '../../test/AppProviders';
import { SettingsMenu } from './SettingsMenu';
import { SettingsPanel } from './SettingsPanel';

// A device whose preferences can change while the page is open.
function device(dark: boolean, reduce: boolean) {
  const listeners = new Set<() => void>();
  const state = { dark, reduce };
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    get matches() { return (q === '(prefers-color-scheme: dark)' && state.dark) || (q === '(prefers-reduced-motion: reduce)' && state.reduce); },
    media: q,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return { set: (next: Partial<typeof state>) => { Object.assign(state, next); listeners.forEach((l) => l()); }, restore: () => { window.matchMedia = original; } };
}

function Readout() {
  return <output aria-label="Reduced">{String(useReducedMotion())}</output>;
}

const shownTheme = () => document.documentElement.getAttribute('data-syn-theme');
const mountMenu = () => render(<MemoryRouter><AppProviders><SettingsMenu /><button type="button">Elsewhere</button><Readout /></AppProviders></MemoryRouter>);
const mountInline = () => render(<AppProviders><SettingsPanel /><Readout /></AppProviders>);

describe('Settings menu: opening and closing', () => {
  let d: ReturnType<typeof device>;
  beforeEach(() => { localStorage.clear(); d = device(true, false); });
  afterEach(() => { cleanup(); d.restore(); });

  it('opens from the Settings button, linked with aria-expanded and aria-controls, and moves focus into the panel', async () => {
    mountMenu();
    const trigger = screen.getByRole('button', { name: 'Settings' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', dialog.id);
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(within(dialog).getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
  });

  it('Escape closes it and returns focus to the button', async () => {
    const user = userEvent.setup();
    mountMenu();
    const trigger = screen.getByRole('button', { name: 'Settings' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Settings' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('the close button closes it and returns focus', async () => {
    const user = userEvent.setup();
    mountMenu();
    const trigger = screen.getByRole('button', { name: 'Settings' });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Close settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('a press outside closes it, and focus stays where the press put it', async () => {
    const user = userEvent.setup();
    mountMenu();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('dialog', { name: 'Settings' });
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    await user.click(elsewhere);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(elsewhere).toHaveFocus();
  });

  it('pressing the button again closes it (once: it does not close and reopen)', async () => {
    const user = userEvent.setup();
    mountMenu();
    const trigger = screen.getByRole('button', { name: 'Settings' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Settings' });
    await user.click(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the radio groups work from the keyboard: arrow keys move the choice within a group', async () => {
    const user = userEvent.setup();
    mountInline();
    const theme = screen.getByRole('radiogroup', { name: 'Theme' });
    await user.click(within(theme).getByLabelText('System'));
    await user.keyboard('{ArrowRight}');
    expect(within(theme).getByLabelText('Light')).toBeChecked();
    await user.keyboard('{ArrowRight}');
    expect(within(theme).getByLabelText('Dark')).toBeChecked();
    const motion = screen.getByRole('radiogroup', { name: 'Motion' });
    await user.click(within(motion).getByLabelText('System'));
    await user.keyboard('{ArrowRight}');
    expect(within(motion).getByLabelText('Reduce')).toBeChecked();
  });
});

describe('Settings: theme', () => {
  let d: ReturnType<typeof device>;
  beforeEach(() => { localStorage.clear(); d = device(true, false); });
  afterEach(() => { cleanup(); d.restore(); });

  it('lists System, Light, Dark in that order, System selected for a new visitor, with nothing stored', () => {
    mountInline();
    const theme = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(theme).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['System', 'Light', 'Dark']);
    expect(within(theme).getByLabelText('System')).toBeChecked();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('System follows the device live; Light and Dark persist and win; System clears the stored choice', () => {
    mountInline();
    expect(shownTheme()).toBe('night');
    act(() => d.set({ dark: false }));
    expect(shownTheme()).toBe('tidewater');
    act(() => d.set({ dark: true }));
    fireEvent.click(screen.getByLabelText('Light'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('tidewater');
    act(() => d.set({ dark: false })); act(() => d.set({ dark: true }));
    expect(shownTheme()).toBe('tidewater');
    fireEvent.click(screen.getByLabelText('Dark'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('night');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Theme' })).getByLabelText('System'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(shownTheme()).toBe('night');
    act(() => d.set({ dark: false }));
    expect(shownTheme()).toBe('tidewater');
  });
});

describe('Settings: motion', () => {
  let d: ReturnType<typeof device>;
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-syn-motion'); d = device(true, false); });
  afterEach(() => { cleanup(); d.restore(); });

  const motionGroup = () => screen.getByRole('radiogroup', { name: 'Motion' });

  it('lists System, Reduce, Full, System selected for a new visitor, with nothing stored and the help text shown', () => {
    mountInline();
    expect(within(motionGroup()).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['System', 'Reduce', 'Full']);
    expect(within(motionGroup()).getByLabelText('System')).toBeChecked();
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    expect(screen.getByText('Stops movement that starts on its own. Play buttons still work.')).toBeInTheDocument();
  });

  it('System follows the device\'s prefers-reduced-motion, live', () => {
    mountInline();
    expect(screen.getByLabelText('Reduced')).toHaveTextContent('false');
    act(() => d.set({ reduce: true }));
    expect(screen.getByLabelText('Reduced')).toHaveTextContent('true');
    act(() => d.set({ reduce: false }));
    expect(screen.getByLabelText('Reduced')).toHaveTextContent('false');
  });

  it('Reduce and Full override the device and persist; System clears the stored choice', () => {
    mountInline();
    fireEvent.click(within(motionGroup()).getByLabelText('Reduce'));
    expect(screen.getByLabelText('Reduced')).toHaveTextContent('true');
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('reduce');
    expect(document.documentElement).toHaveAttribute('data-syn-motion', 'reduce');
    act(() => d.set({ reduce: true }));
    fireEvent.click(within(motionGroup()).getByLabelText('Full'));
    expect(screen.getByLabelText('Reduced')).toHaveTextContent('false'); // the device says reduce; the visitor said Full
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('full');
    fireEvent.click(within(motionGroup()).getByLabelText('System'));
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    expect(screen.getByLabelText('Reduced')).toHaveTextContent('true');
    expect(document.documentElement).not.toHaveAttribute('data-syn-motion');
  });

  it('a stored choice is in force on the first render, so nothing autoplays before it applies', () => {
    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce');
    mountInline();
    expect(screen.getByLabelText('Reduced')).toHaveTextContent('true');
    expect(within(motionGroup()).getByLabelText('Reduce')).toBeChecked();
  });

  it('keeps working for the session where storage is blocked', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    try {
      mountInline();
      fireEvent.click(within(motionGroup()).getByLabelText('Reduce'));
      expect(screen.getByLabelText('Reduced')).toHaveTextContent('true');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
