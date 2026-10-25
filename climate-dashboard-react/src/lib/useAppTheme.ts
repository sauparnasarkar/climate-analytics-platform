import { useCallback, useEffect, useState } from 'react';
import { readStoredTheme, storeTheme, systemTheme, type AppTheme } from './theme';

/**
 * The theme in use and a setter for the toggle. Until the visitor uses the toggle the theme is the device's own (Light or Dark), and it
 * follows the device if that changes while the page is open; nothing is stored for it. Using the toggle is a choice: it is stored and
 * from then on wins over the device.
 */
export function useAppTheme(): [AppTheme, (theme: AppTheme) => void] {
  const [chosen, setChosen] = useState<AppTheme | null>(readStoredTheme);
  const [system, setSystem] = useState<AppTheme>(systemTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystem(systemTheme());
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const choose = useCallback((theme: AppTheme) => { setChosen(theme); storeTheme(theme); }, []);
  return [chosen ?? system, choose];
}
