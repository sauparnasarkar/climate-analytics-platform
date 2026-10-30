import { useEffect, useRef, useState } from 'react';
import { Button, Icon, MultiSelect, SegmentedControl, Text, useSynTheme } from '@syena/ds';
import { MAX_SELECTED_COUNTRIES } from '../../constants';
import { useKnownCountries } from '../../hooks/useKnownCountries';
import { useEffectiveDefaults } from '../../lib/DefaultCountriesProvider';
import { THEME_CHOICES, type AppTheme } from '../../lib/theme';
import { useThemeChoice } from '../../lib/useThemeChoice';
import { MOTION_CHOICES } from '../../lib/motion';
import { useMotionChoice } from '../../lib/MotionChoiceProvider';

const rule = { border: 0, borderTop: '1px solid var(--syn-color-border-default)', margin: 0, width: '100%' } as const;

/** Settings → Default countries: the selection a page opens with when its address names none. Up to ten of the Expanded countries; Reset goes back to the Featured ten. */
function DefaultCountries() {
  const countries = useKnownCountries();
  if (countries.status !== 'ready') {
    return (
      <section aria-label="Default countries settings" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Text as="h3" type="caption" tone="muted">Default countries</Text>
        <Text as="p" type="caption" tone="muted" role="status">
          {countries.status === 'error' ? 'The countries could not be loaded right now.' : countries.status === 'slow' ? 'Still loading the countries…' : 'Loading countries…'}
        </Text>
        {countries.status !== 'loading' ? <div><Button variant="secondary" size="small" onClick={countries.retry}>Try again</Button></div> : null}
      </section>
    );
  }
  return <DefaultCountriesControl featured={countries.data.featured} expanded={countries.data.expanded} />;
}

function DefaultCountriesControl({ featured, expanded }: { featured: string[]; expanded: string[] }) {
  const { defaults, custom, setStored } = useEffectiveDefaults(featured, expanded);
  // The list is edited here, in the order the visitor builds it: an empty list is stored as nothing (pages then use the Featured ten), but
  // the editor itself must be able to show it empty, or removing the last chip would snap straight back to ten countries.
  const [draft, setDraft] = useState(defaults);
  const change = (next: string[]) => { setDraft(next); setStored(next.length === 0 ? null : next); };
  const add = (picked: string[]) => change([...draft, ...picked.filter((c) => !draft.includes(c))].slice(0, MAX_SELECTED_COUNTRIES));
  // Removing a chip removes the button that had focus: put focus on the next chip's remove button (the previous one at the end), or on the
  // add field when none is left, so the keyboard stays inside the panel and Escape still closes it.
  const chipList = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const remove = (name: string) => { pendingFocus.current = draft.indexOf(name); change(draft.filter((c) => c !== name)); };
  const full = draft.length >= MAX_SELECTED_COUNTRIES;
  // The list of countries to add from opens below its field, often near the bottom of the panel (or the drawer): bring it into view when it
  // opens, so it is not left below the fold behind a scrollbar.
  const fit = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const holder = fit.current;
    if (!holder) return undefined;
    const reveal = () => {
      const field = holder.querySelector('[role="combobox"]');
      if (field?.getAttribute('aria-expanded') !== 'true') return;
      holder.querySelector('[role="listbox"]')?.parentElement?.scrollIntoView?.({ block: 'nearest' });
    };
    const watch = new MutationObserver(reveal);
    watch.observe(holder, { attributes: true, attributeFilter: ['aria-expanded'], subtree: true });
    return () => watch.disconnect();
  }, [full]);
  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    const buttons = chipList.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    const target = buttons.length > 0 ? buttons[Math.min(index, buttons.length - 1)] : fit.current?.querySelector<HTMLElement>('[role="combobox"]');
    target?.focus();
  });
  const reset = () => { setDraft(featured); setStored(null); };
  return (
    <section aria-label="Default countries settings" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text as="h3" type="caption" tone="muted">Default countries</Text>
        <Text as="span" type="caption" tone="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{draft.length} of {MAX_SELECTED_COUNTRIES}</Text>
      </div>
      <Text as="p" type="caption" tone="muted">Used when a page opens without a selection. Up to 10.</Text>
      {draft.length > 0 ? (
        <ul ref={chipList} aria-label="Your default countries" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {draft.map((name) => (
            <li key={name} className="settings-chip">
              <span>{name}</span>
              <button type="button" aria-label={`Remove ${name}`} onClick={() => remove(name)}><Icon name="close" size="small" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      {full ? (
        <Text as="p" type="caption" tone="muted">Ten is the most a chart can show. Remove one to add another.</Text>
      ) : (
        /* The design system gives a field a minimum width a little wider than the phone drawer's content; here it may shrink to the room it has. */
        <div ref={fit} className="settings-field-fit">
          <MultiSelect
            ariaLabel="Add a country"
            placeholder="Add a country"
            options={expanded.filter((c) => !draft.includes(c)).map((c) => ({ value: c, label: c }))}
            value={[]}
            onChange={add}
            maxSelected={MAX_SELECTED_COUNTRIES - draft.length}
          />
        </div>
      )}
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
