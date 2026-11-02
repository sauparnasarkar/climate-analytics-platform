import { useEffect, useId, useRef, useState } from 'react';

/** The ⓘ beside a chain value whose series has a newer year than the aligned one: a disclosure (aria-expanded) that opens the note BELOW its cell (the nearest positioned ancestor, which the caller makes `position: relative`), so it never covers the value; closed by
 * Escape, an outside tap or the button again. Nothing is drawn when there is no note, so no icon appears unless newer data exists. */
export function AlignedNote({ note, label }: { note: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e: Event) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [open]);
  if (!note) return null;
  return (
    <span ref={root} style={{ display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={`Newer data available: ${label}`}
        aria-expanded={open}
        aria-controls={noteId}
        onClick={() => setOpen((o) => !o)}
        style={{ width: 28, height: 28, padding: 0, borderRadius: '50%', cursor: 'pointer', fontSize: 14, lineHeight: 1, border: '1px solid var(--syn-color-border-default, currentColor)', background: 'transparent', color: 'inherit' }}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>
      {open && (
        <span
          id={noteId}
          role="note"
          style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, margin: '6px 8px 0', padding: '10px 12px', borderRadius: 8, fontSize: 13, lineHeight: 1.45, fontWeight: 400, textTransform: 'none', letterSpacing: 0, background: 'var(--syn-color-surface-raised)', color: 'var(--syn-color-text-secondary)', border: '1px solid var(--syn-color-border-default, currentColor)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}
        >
          {note}
        </span>
      )}
    </span>
  );
}
