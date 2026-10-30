import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { DEFAULT_COUNTRIES_STORAGE_KEY } from '../../lib/defaultCountries';
import { AppProviders } from '../../test/AppProviders';
import { SettingsPanel } from './SettingsPanel';

vi.mock('../../api/client', () => ({ api: { listCountries: vi.fn() } }));

const FEATURED = ['China', 'United States', 'India', 'Russia', 'Japan', 'Germany', 'Brazil', 'United Kingdom', 'South Africa', 'Australia'];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.listCountries).mockResolvedValue({ featured: FEATURED, expanded: [...FEATURED, 'Indonesia', 'Vietnam'] });
});
afterEach(cleanup);

const mount = () => render(<AppProviders><SettingsPanel /></AppProviders>);
const field = () => screen.findByRole('combobox', { name: 'Default countries' });

describe('Settings: default countries', () => {
  it('is the third section, with the help text, and starts on the Featured ten with Reset disabled', async () => {
    mount();
    const section = await screen.findByRole('region', { name: 'Default countries settings' });
    expect(within(section).getByText('Used when a page opens without a selection. Up to 10.')).toBeInTheDocument();
    expect(await field()).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Reset to featured' })).toBeDisabled();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Theme settings', 'Motion settings', 'Default countries settings']);
    expect(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)).toBeNull();
  });

  it('shows the stored list (names that are gone dropped), and Reset to featured clears it', async () => {
    localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(['Indonesia', 'Atlantis', 'India']));
    const user = userEvent.setup();
    mount();
    const section = await screen.findByRole('region', { name: 'Default countries settings' });
    await waitFor(() => expect(within(section).getByRole('button', { name: 'Reset to featured' })).toBeEnabled());
    expect(await field()).toHaveTextContent(/Indonesia/);
    await user.click(within(section).getByRole('button', { name: 'Reset to featured' }));
    expect(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)).toBeNull();
    await waitFor(() => expect(within(section).getByRole('button', { name: 'Reset to featured' })).toBeDisabled());
  });

  it('choosing countries stores them; clearing the list stores nothing', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await field());
    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)).toBeNull();
    await user.click(await screen.findByRole('option', { name: /Vietnam/ }));
    expect(JSON.parse(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)!)).toEqual(['Vietnam']);
  });

  it('brings the list into view when it opens, so it is not left below the fold of a scrolling panel', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();
    mount();
    await user.click(await field());
    await screen.findByRole('listbox', { name: 'Default countries' });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
    // ...and it is the list's own box (search, options, footer) that is brought in, not the whole panel.
    const target = scrollIntoView.mock.contexts[0] as HTMLElement;
    expect(target.contains(screen.getByRole('listbox', { name: 'Default countries' }))).toBe(true);
    expect(target.contains(screen.getByRole('combobox', { name: 'Default countries' }))).toBe(false);
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('says so when the countries cannot be loaded, and keeps the other sections', async () => {
    vi.mocked(api.listCountries).mockRejectedValue(new Error('offline'));
    mount();
    expect(await screen.findByText('The countries could not be loaded right now.')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Motion' })).toBeInTheDocument();
  });
});
