import { Text, Tile } from '@syena/ds';

export interface StarterPromptTileProps {
  /** e.g. "Historical trends", "Forecasts" (SPEC.md §4) */
  kicker: string;
  prompt: string;
  onClick: () => void;
}

// The tile is a button that already carries its arrow, so only the kicker and the prompt are composed here.
export function StarterPromptTile({ kicker, prompt, onClick }: StarterPromptTileProps) {
  return (
    <Tile interactive onClick={onClick}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <Text type="caption" tone="muted">{kicker}</Text>
        <Text type="text-md">{prompt}</Text>
      </span>
    </Tile>
  );
}
