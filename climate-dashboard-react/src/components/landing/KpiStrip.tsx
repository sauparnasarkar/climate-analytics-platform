import type { ReactNode } from 'react';

// The figures under a landing banner's headline: three cells in a row between two rules. Both banners use this one strip,
// so value, label, padding and rule spacing are the same on each; a cell's colour is passed only where it means something
// (a rise in emissions, a series that is also drawn in the chart beside it).

export const KPI_STRIP_STYLES = `
.landing-kpi-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--climate-banner-line); border-bottom: 1px solid var(--climate-banner-line); }
.landing-kpi-strip > div { min-width: 0; padding: var(--syn-space-4) var(--syn-space-4) var(--syn-space-4) 0; }
.landing-kpi-strip > div + div { padding-left: var(--syn-space-4); border-left: 1px solid var(--climate-banner-line); }
/* The design system's figure role (28 px on a 38 px line), stepping down with the width; the line box stays whole so the figure never reaches the label or the rule. */
.landing-kpi-strip .landing-kpi-strip__value { font-size: clamp(1.25rem, 2.2vw, var(--syn-type-figure-md-size)); }
.landing-kpi-strip .landing-kpi-strip__label { margin-top: var(--syn-space-1); color: var(--syn-color-text-muted); }
@media (max-width: 640px) { .landing-kpi-strip .landing-kpi-strip__value { line-height: var(--syn-type-figure-sm-line); } }
`;

export interface KpiStripItem {
  value: string;
  label: string;
  /** A CSS class that colours the value, for a colour that has a meaning. */
  valueClassName?: string;
  /** A CSS colour for the value, for a colour that has a meaning. */
  color?: string;
}

export function KpiStrip({ items, className }: { items: KpiStripItem[]; className?: string }): ReactNode {
  return (
    <div className={`landing-kpi-strip${className ? ` ${className}` : ''}`}>
      {items.map((item) => (
        <div key={item.label}>
          <div className={`syn-figure-md landing-kpi-strip__value${item.valueClassName ? ` ${item.valueClassName}` : ''}`} style={item.color ? { color: item.color } : undefined}>{item.value}</div>
          <div className="syn-caption landing-kpi-strip__label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
