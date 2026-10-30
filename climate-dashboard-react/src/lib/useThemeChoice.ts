import { useCallback } from 'react';
import { useSynTheme } from '@syena/ds';
import { clearStoredTheme, type AppTheme } from './theme';

/**
 * The visitor's choice (System, Light or Dark) and a setter. SynThemeProvider owns the choice, follows the device's
 * prefers-color-scheme while it is System, and stores Light and Dark; the one thing the app adds is that choosing System
 * removes the stored choice instead of storing the word "system".
 */
export function useThemeChoice(): [AppTheme, (choice: AppTheme) => void] {
  const { choice, setChoice } = useSynTheme();
  const choose = useCallback((next: AppTheme) => {
    setChoice(next);
    if (next === 'system') clearStoredTheme();
  }, [setChoice]);
  return [choice, choose];
}
