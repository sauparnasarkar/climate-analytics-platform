import type { ReactNode } from 'react';
import { SynThemeProvider } from '@syena/ds';

/** The real theme provider, as the app mounts it, for tests that render a component without App. */
export function Themed({ children }: { children: ReactNode }) {
  return <SynThemeProvider theme="night" storageKey={null}>{children}</SynThemeProvider>;
}
