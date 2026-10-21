// The dark panel Area 2 charts sit on in both themes (design: "Light theme puts charts on a dark chart panel"),
// shared by the landing banner's scatter and the Overview's cumulative-CO₂ view.
export const CHART_PANEL_STYLES = `
.climate-chart-panel { --climate-panel-bg: #182746; border-radius: 12px; padding: 16px 18px; background: var(--climate-panel-bg); color: #d7e0f0; display: flex; flex-direction: column; gap: 10px; }
[data-syn-theme="tidewater"] .climate-chart-panel { --climate-panel-bg: #061E28; }
/* The scatter keeps its drawn proportions and the height the panel gives it: the picture is scaled to fit, never stretched. */
.climate-scatter { position: relative; aspect-ratio: 600 / 360; max-height: min(56vh, 520px); }
.climate-scatter > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
`;
