import { useShell } from '@syena/ds';

/** A page's one-line description, written at the top of the page content in the phone layout, where the analysis bar that carries it elsewhere is not on the page.
 * It scrolls away with the page and is not drawn at other widths, so there is one copy at a time. A page with nothing to say, or that writes its own, gets none. */
export function PagePurpose({ purpose }: { purpose?: string }) {
  const compact = useShell()?.compact === true;
  if (!compact || !purpose) return null;
  return <p className="syn-text-md" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }}>{purpose}</p>;
}
