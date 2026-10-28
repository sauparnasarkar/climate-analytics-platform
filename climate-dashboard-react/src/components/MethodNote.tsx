import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { methodsHref, type MethodsAnchor } from '../lib/methodology';

/** A page's two-line note on how its numbers are made, with a deep link to the section of Methods & data that owns the method.
 * The full method lives there once; a page says only what a reader needs to read its own charts. */
export function MethodNote({ anchor, id, children }: { anchor: MethodsAnchor; /** An id for the note, where a page's jump row points at it. */ id?: string; children: ReactNode }) {
  return (
    <p id={id} className="syn-caption" style={{ margin: '16px 0 0', maxWidth: 880, color: 'var(--syn-color-text-muted)' }}>
      {children}{' '}
      <Link className="area2-link" to={methodsHref(anchor)} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Method →</Link>
    </p>
  );
}
