import { Button, SegmentedControl } from '@syena/ds';
import type { AppTheme } from '../lib/theme';

/** Light/Dark switch shared by the dashboard shell's header/mobile drawer and the landing layout. `compact` is one icon button, for a place with room for no more (a collapsed rail). */
export function ThemeToggle({ theme, setTheme, compact = false }: { theme: AppTheme; setTheme: (t: AppTheme) => void; compact?: boolean }) {
  if (compact) {
    const toDark = theme === 'tidewater';
    const label = toDark ? 'Switch to dark theme' : 'Switch to light theme';
    return <Button variant="ghost" icon={toDark ? 'moon' : 'sun'} aria-label={label} title={label} onClick={() => setTheme(toDark ? 'night' : 'tidewater')} />;
  }
  return (
    <SegmentedControl
      name="theme"
      size="small"
      value={theme}
      onChange={(v) => setTheme(v as AppTheme)}
      items={[
        { value: 'tidewater', label: 'Light' },
        { value: 'night', label: 'Dark' },
      ]}
    />
  );
}
