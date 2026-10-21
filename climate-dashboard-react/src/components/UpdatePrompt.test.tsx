import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceNewVersion, forgetNewVersion, onReloadForUpdate } from '../pwa/updateState';
import { UpdatePrompt } from './UpdatePrompt';

afterEach(() => { act(() => forgetNewVersion()); });

describe('UpdatePrompt', () => {
  it('says nothing until a new version is waiting', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('offers a reload once a new version is waiting, and reloads on request', async () => {
    const reload = vi.fn();
    onReloadForUpdate(reload);
    render(<UpdatePrompt />);
    act(() => announceNewVersion());
    expect(screen.getByRole('status')).toHaveTextContent(/new version is available/i);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('can be put off, and comes back with the next new version', async () => {
    render(<UpdatePrompt />);
    act(() => announceNewVersion());
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => announceNewVersion());
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('goes away when the new version is no longer waiting, and asks again for the next one even after Later', async () => {
    render(<UpdatePrompt />);
    act(() => announceNewVersion());
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    act(() => forgetNewVersion());
    act(() => announceNewVersion());
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => forgetNewVersion());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
