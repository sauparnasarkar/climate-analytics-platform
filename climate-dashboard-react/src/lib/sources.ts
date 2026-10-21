import type { WidgetSpec } from '../agent/types';

/** Who supplied the data behind a chart, written the way the cards' footers show it. */
export const OWID = 'Our World in Data (Global Carbon Project)';
export const BERKELEY = 'Berkeley Earth';
export const NOAA = 'NOAA GML and Law Dome';
export const PRIMAP = 'PRIMAP-hist';
export const MODELS = `Forecast models fitted to ${OWID} data`;
export const SCENARIOS = `Illustrative scenarios computed from ${OWID} data`;
export const joinSources = (...parts: string[]) => parts.join(' · ');

/** The source of an agent answer's chart: its own source line without the label, or the platform's datasets. */
export const widgetSource = (widget: WidgetSpec) => widget.source_line?.replace(/^Source:\s*/i, '').trim() || joinSources(OWID, PRIMAP, BERKELEY, NOAA);
