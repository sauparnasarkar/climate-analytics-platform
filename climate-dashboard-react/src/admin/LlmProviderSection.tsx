import { useEffect, useState } from 'react';
import { Button, InlineAlert, Select, Spinner } from '@syena/ds';
import { adminApi } from './adminClient';
import type { LlmChoice } from './types';
import { useAsync } from '../hooks/useAsync';

// Mirrors services/agent/src/agent/settings.py's ALLOWED_CHOICES -- SPEC.md §14.2. Kept as a
// small hand-synced copy rather than a shared import, matching this repo's established
// "small per-sub-project copies over a shared import" convention (services/agent/SPEC.md
// "Corrections applied" #15). Shown in a Select at every width: the three long labels in a
// SegmentedControl ran off a phone screen, and one control is simpler than switching by width.
const OPTIONS = [
  { id: 'anthropic-sonnet', provider: 'anthropic', model: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Anthropic)' },
  { id: 'ollama-qwen3.8-27b-ctx32k', provider: 'ollama', model: 'qwen3.8-27b-ctx32k', label: 'Qwen 3.8 27B (local, 32k ctx)' },
  { id: 'ollama-gpt-oss-20b-ctx32k', provider: 'ollama', model: 'gpt-oss:20b-ctx32k', label: 'gpt-oss 20B (local, 32k ctx)' },
];

function idForChoice(choice: LlmChoice): string | undefined {
  return OPTIONS.find((o) => o.provider === choice.provider && o.model === choice.model)?.id;
}

export function LlmProviderSection() {
  const current = useAsync(() => adminApi.getLlmChoice(), []);
  // The choice this section actually treats as "currently applied" -- seeded from the initial
  // GET, then updated directly from a successful POST's own response. Deliberately NOT derived
  // from `current.data` on every render: that value is frozen at whatever the one-time GET
  // returned, so after a successful switch the Apply button would stay enabled against a
  // choice that's no longer live, letting the admin repeatedly re-POST the same switch.
  const [appliedChoice, setAppliedChoice] = useState<LlmChoice | null>(null);
  // undefined until the admin actually picks something in this session -- until then the
  // Select just reflects `appliedChoice`.
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<{ variant: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (current.data) setAppliedChoice(current.data);
  }, [current.data]);

  if (current.loading) {
    return <Spinner label="Loading current model…" />;
  }

  if (current.error || !appliedChoice) {
    return (
      <InlineAlert variant="error">
        Could not load the current model — reload the page to try again. If this keeps
        happening, your admin session may have expired.
      </InlineAlert>
    );
  }

  const appliedId = idForChoice(appliedChoice);
  // "" (not undefined) when appliedId is unrecognized: an explicit "" matches no real option, so
  // the Select shows its placeholder rather than silently presenting Sonnet as the live choice.
  const activeId = selectedId ?? appliedId ?? '';

  const handleApply = async () => {
    if (!selectedId || applying) return;
    setApplying(true);
    setStatus(null);
    try {
      const updated = await adminApi.setLlmChoice(selectedId);
      setAppliedChoice(updated);
      setSelectedId(undefined); // falls back to the freshly-applied choice, Apply goes disabled again
      const label = OPTIONS.find((o) => o.id === selectedId)?.label ?? selectedId;
      setStatus({ variant: 'success', message: `Switched to ${label}.` });
    } catch (err) {
      setStatus({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Could not switch models.',
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {appliedId === undefined && (
        <InlineAlert variant="warning">
          The live model ({appliedChoice.provider}/{appliedChoice.model}) isn't one of the known
          options below -- pick one to switch to a recognized state.
        </InlineAlert>
      )}
      <div style={{ maxWidth: 420 }}>
        <Select
          ariaLabel="Model"
          options={OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
          value={activeId}
          onChange={setSelectedId}
          suppressSearch
          placeholder="Choose a model"
        />
      </div>
      <div>
        <Button
          onClick={handleApply}
          disabled={!selectedId || selectedId === appliedId || applying}
          isLoading={applying}
        >
          Apply
        </Button>
      </div>
      {status && <InlineAlert variant={status.variant === 'success' ? 'default' : 'error'}>{status.message}</InlineAlert>}
    </div>
  );
}
