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

/** A landing page for a dataset, with the label the table shows. */
export interface SourceLink {
  label: string;
  url: string;
}

/** Where a dataset can be read about and how to cite it, keyed by the pipeline's source id (`/correlation/meta` `sources[].id`).
 * Front-end only for now: the pipeline's metadata carries the raw data-file URLs but no landing pages. TODO(STATUS.md): move this into pipeline metadata after the Nov 9-11 freeze.
 * Each landing URL was fetched and checked on 2026-10-28; the data-file links come from the API's `source_urls`. */
export interface SourceInfo {
  links: SourceLink[];
  /** A short citation, for the table; the full licence wording stays the API's. */
  citation: string;
}

const NOAA_GML: SourceLink = { label: 'NOAA GML: Trends in CO₂', url: 'https://gml.noaa.gov/ccgg/trends/' };
const OWID_REPO: SourceLink = { label: 'OWID CO₂ data (GitHub)', url: 'https://github.com/owid/co2-data' };

export const SOURCE_INFO: Record<string, SourceInfo> = {
  owid_country_co2: { links: [OWID_REPO], citation: 'Our World in Data, CO₂ and Greenhouse Gas Emissions; Global Carbon Budget' },
  owid_world_co2_annual: { links: [OWID_REPO], citation: 'Our World in Data, CO₂ and Greenhouse Gas Emissions; Global Carbon Budget' },
  co2_concentration_annual: {
    links: [NOAA_GML, { label: 'NCEI: Law Dome 2000-year record', url: 'https://www.ncei.noaa.gov/access/paleo-search/study/9959' }],
    citation: 'NOAA GML Mauna Loa; Etheridge et al. 2010 and MacFarling Meure et al. 2006 (Law Dome)',
  },
  co2_concentration_monthly_mlo: { links: [NOAA_GML], citation: 'NOAA GML Mauna Loa' },
  primap_country_annual: { links: [{ label: 'PRIMAP-hist v2.8 (Zenodo)', url: 'https://zenodo.org/records/22876287' }], citation: 'Gütschow & Pflüger, PRIMAP-hist v2.8' },
  primap_global_composition_annual: { links: [{ label: 'PRIMAP-hist v2.8 (Zenodo)', url: 'https://zenodo.org/records/22876287' }], citation: 'Gütschow & Pflüger, PRIMAP-hist v2.8' },
  temperature_anomaly_annual: { links: [{ label: 'Berkeley Earth data', url: 'https://berkeleyearth.org/data/' }], citation: 'Rohde & Hausfather 2020, ESSD 12, 3469–3479' },
};
