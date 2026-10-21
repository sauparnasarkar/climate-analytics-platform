/**
 * The per-figure baseline chip every Area 2 chart and KPI carries (requirements §2.5), e.g. "Baseline 1990 · OWID". Mono 11px, neutral chip surface.
 * `inChartPanel`: the chip sits inside a chart panel, which stays dark in every theme, so it takes the design system's chart-surface muted colour and a
 * faint wash of that same colour instead of the page's chip colours (dark text on the dark panel would fall to ~2.7:1 in the bright theme; a white wash lifted the surface until the text read 3.9:1 in the dark theme).
 */
export function BaselineChip({ baseline, source, inChartPanel = false }: { baseline: string; source?: string; inChartPanel?: boolean }) {
  return (
    <span
      className="baseline-chip"
      style={{
        display: 'inline-block',
        padding: '3px 6px',
        borderRadius: 3,
        fontFamily: 'var(--syn-family-figure)',
        fontSize: 11,
        background: inChartPanel ? 'color-mix(in srgb, var(--syn-data-text) 8%, transparent)' : 'var(--syn-color-surface-overlay, rgba(127,127,127,0.18))',
        color: inChartPanel ? 'var(--syn-data-text)' : 'var(--syn-color-text-muted)',
      }}
    >
      {`Baseline ${baseline}`}
      {source ? ` · ${source}` : ''}
    </span>
  );
}
