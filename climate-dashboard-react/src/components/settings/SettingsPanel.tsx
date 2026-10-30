import { useState } from 'react';
import { Button, MultiSelect, SegmentedControl, Text, useSynTheme } from '@syena/ds';
import { MAX_SELECTED_COUNTRIES } from '../../constants';
import { useCountries } from '../../hooks/useCountries';
import { useEffectiveDefaults } from '../../lib/DefaultCountriesProvider';
import { THEME_CHOICES, type AppTheme } from '../../lib/theme';
import { useThemeChoice } from '../../lib/useThemeChoice';
import { MOTION_CHOICES } from '../../lib/motion';
import { useMotionChoice } from '../../lib/MotionChoiceProvider';

const rule = { border: 0, borderTop: '1px solid var(--syn-color-border-default)', margin: 0, width: '100%' } as const;

/** Settings → Default countries: the selection a page opens with when its address names none. Up to ten of the Expanded countries; Reset goes back to the Featured ten. */
function DefaultCountries() {
  const countries = useCountries();
  if (!countries.data) {
    return <Text as="p" type="caption" tone="muted">{countries.error ? 'The countries could not be loaded right now.' : 'Loading countries…'}</Text>;
  }
  return <DefaultCountriesControl featured={countries.data.featured} expanded={countries.data.expanded} />;
}

function DefaultCountriesControl({ featured, expanded }: { featured: string[]; expanded: string[] }) {
  const { defaults, custom, setStored } = useEffectiveDefaults(featured, expanded);
  // The picker keeps its own list while it is being edited: an empty list is stored as nothing (pages then use the Featured ten), but the
  // picker itself must be able to show it empty, or Clear would snap straight back to ten countries and nothing else could be chosen.
  const [draft, setDraft] = useState(defaults);
  const change = (next: string[]) => { setDraft(next); setStored(next.length === 0 ? null : next); };
  const reset = () => { setDraft(featured); setStored(null); };
  return (
    <section aria-label="Default countries settings" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Text as="h3" type="caption" tone="muted">Default countries</Text>
      <Text as="p" type="caption" tone="muted">Used when a page opens without a selection. Up to 10.</Text>
      <MultiSelect
        ariaLabel="Default countries"
        options={expanded.map((c) => ({ value: c, label: c }))}
        value={draft}
        onChange={change}
        maxSelected={MAX_SELECTED_COUNTRIES}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text as="span" type="caption" tone="muted">{custom ? 'Your own list.' : draft.length === 0 ? 'None chosen: pages use the Featured ten.' : 'The 10 Featured countries.'}</Text>
        <Button variant="secondary" size="small" disabled={!custom && draft.length === featured.length} onClick={reset}>Reset to featured</Button>
      </div>
    </section>
  );
}

/**
 * The sections of the Settings menu, in order: Theme, Motion, Default countries. Changes apply at once; there is no Save. The same sections fill the
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
      <hr style={rule} />
      <DefaultCountries />
    </>
  );
}
