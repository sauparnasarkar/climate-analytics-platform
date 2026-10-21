// The design's per-theme series colours for UI drawn on the page background (KPI card rules, sparklines, deltas).
// Charts on the dark panel use the on-dark colours in lib/climateColors.ts instead.
export const SERIES_STYLES = `
.series--emissions { --series: #B07A10; } .series--concentration { --series: #0A6E8C; } .series--temperature { --series: #B3261E; }
[data-syn-theme="night"] .series--emissions { --series: #e5b955; }
[data-syn-theme="night"] .series--concentration { --series: #5ecbf5; }
[data-syn-theme="night"] .series--temperature { --series: #f2637e; }
.series-spark { color: var(--series); }
`;
