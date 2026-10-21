import type { ReactNode } from 'react';

/** Every new Area 2 chart states what question it answers (requirements §2.3). */
export function PurposeLine({ children }: { children: ReactNode }) {
  return (
    <p className="syn-caption" style={{ margin: '0 0 8px', color: 'var(--syn-color-text-muted)' }}>
      <strong>Purpose:</strong> {children}
    </p>
  );
}
