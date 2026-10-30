import { SegmentedControl, Text, useSynTheme } from '@syena/ds';
import { THEME_CHOICES, type AppTheme } from '../../lib/theme';
import { useThemeChoice } from '../../lib/useThemeChoice';
import { MOTION_CHOICES } from '../../lib/motion';
import { useMotionChoice } from '../../lib/MotionChoiceProvider';

const rule = { border: 0, borderTop: '1px solid var(--syn-color-border-default)', margin: 0, width: '100%' } as const;

/**
 * The sections of the Settings menu, in order: Theme, Motion. Changes apply at once; there is no Save. The same sections fill the
 * popover on a wide screen and sit inline in the phone drawer and the phone menu, which is why this is not tied to the popover.
 */
export function SettingsPanel() {
  const [theme, setTheme] = useThemeChoice();
  const [motion, setMotion] = useMotionChoice();
  const { theme: inForce } = useSynTheme();
  return (
    <>
      <section aria-label="Theme settings" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SegmentedControl name="settings-theme" label="Theme" items={THEME_CHOICES} value={theme} onChange={(v) => setTheme(v as AppTheme)} />
        <Text as="p" type="caption" tone="muted">
          {theme === 'system' ? `Following your device, currently ${inForce === 'night' ? 'Dark' : 'Light'}.` : 'Saved for this site. Choose System to follow your device again.'}
        </Text>
      </section>
      <hr style={rule} />
      <section aria-label="Motion settings" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SegmentedControl name="settings-motion" label="Motion" items={MOTION_CHOICES} value={motion} onChange={(v) => setMotion(v as typeof motion)} />
        <Text as="p" type="caption" tone="muted">Stops movement that starts on its own. Play buttons still work.</Text>
      </section>
    </>
  );
}
