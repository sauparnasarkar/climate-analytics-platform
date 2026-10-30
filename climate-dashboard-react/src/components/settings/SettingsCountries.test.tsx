import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { resetKnownCountries } from '../../hooks/useKnownCountries';
import { DEFAULT_COUNTRIES_STORAGE_KEY } from '../../lib/defaultCountries';
import { AppProviders } from '../../test/AppProviders';
import { SettingsPanel } from './SettingsPanel';

vi.mock('../../api/client', () => ({ api: { listCountries: vi.fn() } }));

const FEATURED = ['China', 'United States', 'India', 'Russia', 'Japan', 'Germany', 'Brazil', 'United Kingdom', 'South Africa', 'Australia'];

beforeEach(() => {
  resetKnownCountries();
  vi.mocked(api.listCountries).mockReset();
  localStorage.clear();
  vi.mocked(api.listCountries).mockResolvedValue({ featured: FEATURED, expanded: [...FEATURED, 'Indonesia', 'Vietnam'] });
});
afterEach(cleanup);

const mount = () => render(<AppProviders><SettingsPanel /></AppProviders>);
const field = () => screen.findByRole('list', { name: 'Your default countries' });
const chips = () => within(screen.getByRole('list', { name: 'Your default countries' })).getAllByRole('listitem').map((li) => li.textContent);

describe('Settings: default countries', () => {
  it('is the third section, with the help text, the ten Featured as chips in order, "10 of 10", Reset disabled and nothing to add', async () => {
    mount();
    await field();
    const section = screen.getByRole('region', { name: 'Default countries settings' });
    expect(within(section).getByText('Used when a page opens without a selection. Up to 10.')).toBeInTheDocument();
    expect(chips()).toEqual(FEATURED);
    expect(within(section).getByText('10 of 10')).toBeInTheDocument();
    expect(within(section).getByText('Ten is the most a chart can show. Remove one to add another.')).toBeInTheDocument();
    expect(within(section).queryByRole('combobox')).toBeNull();
    expect(within(section).getByRole('button', { name: 'Reset to featured' })).toBeDisabled();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Theme settings', 'Motion settings', 'Default countries settings']);
    expect(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)).toBeNull();
  });

  it('shows the stored list as chips in the visitor\'s own order (names that are gone dropped), and Reset to featured clears it', async () => {
    localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(['Vietnam', 'Atlantis', 'India', 'Brazil']));
    const user = userEvent.setup();
    mount();
    await field();
    const section = screen.getByRole('region', { name: 'Default countries settings' });
    expect(chips()).toEqual(['Vietnam', 'India', 'Brazil']);
    expect(within(section).getByText('3 of 10')).toBeInTheDocument();
    await waitFor(() => expect(within(section).getByRole('button', { name: 'Reset to featured' })).toBeEnabled());
    await user.click(within(section).getByRole('button', { name: 'Reset to featured' }));
    expect(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)).toBeNull();
    await waitFor(() => expect(chips()).toEqual(FEATURED));
  });

  it('removing a chip stores the rest in order; adding appends to the end; removing the last stores nothing', async () => {
    localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(['India', 'Brazil', 'Vietnam']));
    const user = userEvent.setup();
    mount();
    await field();
    await user.click(screen.getByRole('button', { name: 'Remove Brazil' }));
    expect(JSON.parse(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)!)).toEqual(['India', 'Vietnam']);
    await user.click(screen.getByRole('combobox', { name: 'Add a country' }));
    await user.click(await screen.findByRole('option', { name: /Brazil/ }));
    expect(JSON.parse(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)!)).toEqual(['India', 'Vietnam', 'Brazil']);
    expect(chips()).toEqual(['India', 'Vietnam', 'Brazil']);
    // The list of countries to add from no longer offers the ones already chosen.
    expect(screen.queryByRole('option', { name: /^India/ })).toBeNull();
    await user.keyboard('{Escape}');
    for (const name of ['India', 'Vietnam', 'Brazil']) await user.click(screen.getByRole('button', { name: `Remove ${name}` }));
    expect(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)).toBeNull();
    expect(screen.getByText('None chosen: pages use the Featured ten.')).toBeInTheDocument();
    expect(screen.getByText('0 of 10')).toBeInTheDocument();
  });

  it('keeps focus inside the panel when a chip is removed: the next chip, the previous at the end, the add field when none is left', async () => {
    localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(['India', 'Brazil', 'Vietnam']));
    const user = userEvent.setup();
    mount();
    await field();
    screen.getByRole('button', { name: 'Remove Brazil' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Remove Vietnam' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Remove India' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('combobox', { name: 'Add a country' })).toHaveFocus();
  });

  it('brings the list of countries to add into view when it opens, so it is not left below the fold of a scrolling panel', async () => {
    localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(['India']));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();
    mount();
    await field();
    await user.click(screen.getByRole('combobox', { name: 'Add a country' }));
    await screen.findByRole('listbox', { name: 'Add a country' });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
    const target = scrollIntoView.mock.contexts[0] as HTMLElement;
    expect(target.contains(screen.getByRole('listbox', { name: 'Add a country' }))).toBe(true);
    expect(target.contains(screen.getByRole('combobox', { name: 'Add a country' }))).toBe(false);
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('does not ask again for a list it already has: a second opening is instant', async () => {
    const first = mount();
    await field();
    first.unmount();
    mount();
    expect(await field()).toBeInTheDocument();
    expect(vi.mocked(api.listCountries)).toHaveBeenCalledTimes(1);
  });

  it('says it is slow rather than loading for ever, and Try again asks once more', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.listCountries).mockReturnValueOnce(new Promise(() => {}));
      mount();
      expect(screen.getByText('Loading countries…')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      await act(async () => { vi.advanceTimersByTime(8100); });
      expect(screen.getByText('Still loading the countries…')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await field()).toBeInTheDocument();
      expect(vi.mocked(api.listCountries)).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an original request that succeeds after Try again still fills the panel', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let answerFirst: (value: { featured: string[]; expanded: string[] }) => void = () => {};
      vi.mocked(api.listCountries)
        .mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve; }))
        .mockReturnValueOnce(new Promise(() => {}));
      mount();
      await act(async () => { vi.advanceTimersByTime(8100); });
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(vi.mocked(api.listCountries)).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Loading countries…')).toBeInTheDocument();
      await act(async () => { answerFirst({ featured: FEATURED, expanded: [...FEATURED, 'Vietnam'] }); });
      expect(await field()).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when the countries cannot be loaded, and keeps the other sections', async () => {
    vi.mocked(api.listCountries).mockRejectedValue(new Error('offline'));
    mount();
    expect(await screen.findByText('The countries could not be loaded right now.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Motion' })).toBeInTheDocument();
  });
});
