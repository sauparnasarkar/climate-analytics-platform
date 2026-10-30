import { Button, SegmentedControl } from '@syena/ds';
import { THEME_CHOICES, type AppTheme } from '../lib/theme';
import { useThemeChoice } from '../lib/useThemeChoice';

const NAMES: Record<AppTheme, string> = { system: 'System', tidewater: 'Light', night: 'Dark' };
const ICONS = { system: 'system', tidewater: 'sun', night: 'moon' } as const;

/** System / Light / Dark switch shared by the dashboard shell's rail and mobile drawer and the landing layout. `compact` is one icon button that cycles System → Light → Dark, for a place with room for no more (a collapsed rail). */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useThemeChoice();
  if (compact) {
    const index = THEME_CHOICES.findIndex((c) => c.value === choice);
    const next = THEME_CHOICES[(index + 1) % THEME_CHOICES.length].value;
    const label = `Theme: ${NAMES[choice]}. Switch to ${NAMES[next]}`;
    return <Button variant="ghost" icon={ICONS[choice]} aria-label={label} title={label} onClick={() => setChoice(next)} />;
  }
  return (
    <SegmentedControl
      name="theme"
      size="small"
      value={choice}
      onChange={(v) => setChoice(v as AppTheme)}
      items={THEME_CHOICES}
    />
  );
}
