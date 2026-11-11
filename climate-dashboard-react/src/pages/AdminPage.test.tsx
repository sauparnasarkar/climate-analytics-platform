import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../admin/adminClient';
import type { LlmChoice } from '../admin/types';
import AdminPage from './AdminPage';

vi.mock('../admin/adminClient', () => ({ adminApi: { getLlmChoice: vi.fn(), setLlmChoice: vi.fn() } }));

const SONNET_CHOICE: LlmChoice = { provider: 'anthropic', model: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Anthropic)', updated_at: '2026-01-01T00:00:00+00:00' };
const OLLAMA_CHOICE: LlmChoice = { provider: 'ollama', model: 'qwen3.8-27b-ctx32k', label: 'Qwen 3.8 27B (local, 32k ctx)', updated_at: '2026-01-02T00:00:00+00:00' };

afterEach(() => {
  vi.clearAllMocks();
});

const SONNET = 'Claude Sonnet 5 (Anthropic)';
const QWEN = 'Qwen 3.8 27B (local, 32k ctx)';
const picker = () => screen.findByRole('combobox', { name: 'Model' });
async function pick(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(await picker());
  await user.click(screen.getByRole('option', { name: label }));
}

describe('AdminPage', () => {
  it('shows a loading state before getLlmChoice resolves', () => {
    vi.mocked(adminApi.getLlmChoice).mockReturnValue(new Promise(() => {}));
    render(<AdminPage />);

    expect(screen.getByText('Loading current model…')).toBeInTheDocument();
  });

  it('shows an error state if getLlmChoice fails', async () => {
    vi.mocked(adminApi.getLlmChoice).mockRejectedValue(new Error('network error'));
    render(<AdminPage />);

    expect(await screen.findByText(/Could not load the current model/)).toBeInTheDocument();
  });

  it('renders both allow-list options with the live choice selected, once loaded', async () => {
    vi.mocked(adminApi.getLlmChoice).mockResolvedValue(SONNET_CHOICE);
    render(<AdminPage />);

    const user = userEvent.setup();
    expect(await picker()).toHaveTextContent(SONNET);
    await user.click(await picker());
    expect(screen.getByRole('option', { name: SONNET })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: QWEN })).toHaveAttribute('aria-selected', 'false');
  });

  it('applying the currently-selected option is disabled', async () => {
    vi.mocked(adminApi.getLlmChoice).mockResolvedValue(SONNET_CHOICE);
    render(<AdminPage />);

    expect(await picker()).toHaveTextContent(SONNET);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('selecting a different option and applying calls setLlmChoice and shows a success alert', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.getLlmChoice).mockResolvedValue(SONNET_CHOICE);
    vi.mocked(adminApi.setLlmChoice).mockResolvedValue(OLLAMA_CHOICE);
    render(<AdminPage />);

    await pick(user, QWEN);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(adminApi.setLlmChoice).toHaveBeenCalledWith('ollama-qwen3.8-27b-ctx32k'));
    expect(await screen.findByText('Switched to Qwen 3.8 27B (local, 32k ctx).')).toBeInTheDocument();
  });

  it('after a successful apply, the newly-applied option is treated as current -- Apply goes disabled again, not stuck enabled against the stale initial choice', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.getLlmChoice).mockResolvedValue(SONNET_CHOICE);
    vi.mocked(adminApi.setLlmChoice).mockResolvedValue(OLLAMA_CHOICE);
    render(<AdminPage />);

    await pick(user, QWEN);
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText('Switched to Qwen 3.8 27B (local, 32k ctx).');

    expect(await picker()).toHaveTextContent(QWEN);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    // A second apply of the same (now-current) choice must not fire another request.
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(adminApi.setLlmChoice).toHaveBeenCalledTimes(1);
  });

  it('an unrecognized live provider/model shows a warning and leaves no option pre-selected', async () => {
    vi.mocked(adminApi.getLlmChoice).mockResolvedValue({
      provider: 'openai',
      model: 'gpt-5',
      label: 'Unknown',
      updated_at: '2026-01-01T00:00:00+00:00',
    });
    render(<AdminPage />);

    expect(await screen.findByText(/isn't one of the known options/)).toBeInTheDocument();
    expect(await picker()).toHaveTextContent('Choose a model');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('a failed apply shows the curated error message, not a raw exception', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.getLlmChoice).mockResolvedValue(SONNET_CHOICE);
    vi.mocked(adminApi.setLlmChoice).mockRejectedValue(new Error('Could not switch models -- the new configuration failed to initialize. Still running: Claude Sonnet 5 (Anthropic).'));
    render(<AdminPage />);

    await pick(user, QWEN);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText(/Could not switch models/)).toBeInTheDocument();
  });
});
