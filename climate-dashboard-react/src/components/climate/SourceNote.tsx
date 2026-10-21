import type { ReactNode } from 'react';

/**
 * Source traceability under a chart or KPI (requirements §2.3): who supplied the data, plus an optional caveat. `sources` come from the API's
 * attribution/meta, not retyped copy. `inChartPanel`: the note sits inside a chart panel, which stays dark in every theme, so it takes the design
 * system's chart-surface muted colour instead of the page's.
 */
export function SourceNote({ sources, children, inChartPanel = false }: { sources: string[]; children?: ReactNode; inChartPanel?: boolean }) {
  return (
    <p className="syn-caption" style={{ margin: '8px 0 0', color: inChartPanel ? 'var(--syn-data-text)' : 'var(--syn-color-text-muted)' }}>
      Source: {sources.join(' · ')}
      {children ? <> — {children}</> : null}
    </p>
  );
}
