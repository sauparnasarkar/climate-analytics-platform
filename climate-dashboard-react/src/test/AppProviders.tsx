import type { ReactNode } from 'react';
import { SynThemeProvider } from '@syena/ds';
import { DefaultCountriesProvider } from '../lib/DefaultCountriesProvider';
import { MotionChoiceProvider } from '../lib/MotionChoiceProvider';
import { THEME_STORAGE_KEY } from '../lib/theme';

/** The providers App puts above every layout (theme, motion), with the app's real storage key, for a test that renders a layout or the settings on their own. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SynThemeProvider defaultChoice="system" storageKey={THEME_STORAGE_KEY}>
      <MotionChoiceProvider><DefaultCountriesProvider>{children}</DefaultCountriesProvider></MotionChoiceProvider>
    </SynThemeProvider>
  );
}
