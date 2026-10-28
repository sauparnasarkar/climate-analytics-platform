import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { META } from '../../test/climateFixtures';
import { BaselinesSection } from './BaselinesSection';
import { SourcesSection } from './SourcesSection';

const SPLICE = { year: 1959, overlapYears: [1959, 2004] as [number, number], gapPpm: -0.28, maxAbsOverlapGapPpm: 3.9 };
const props = { meta: META, metaFailed: false, splice: SPLICE, cumulativeFrom: 1750, anthropogenicFrom: 1850 };

describe('SourcesSection', () => {
  it('shows one platform-wide table with the API\'s coverage, vintage and licence, and a links column', () => {
    render(<SourcesSection {...props} />);
    const table = screen.getByRole('table', { name: /Every source the platform uses/ });
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Source', 'Used for', 'Coverage', 'Vintage', 'Licence', 'Links']);
    const berkeley = within(table).getByRole('row', { name: /Berkeley Earth/ });
    expect(berkeley).toHaveTextContent('1850–2024');
    expect(berkeley).toHaveTextContent('file of 2025-01-10');
    expect(berkeley).toHaveTextContent('CC BY-NC 4.0 International');
    expect(within(table).getByRole('row', { name: /PRIMAP-hist/ })).toHaveTextContent('Non-commercial use only');
    expect(within(table).queryByText(/crosswalk/i)).not.toBeInTheDocument(); // derived rows are not sources
    expect(within(table).queryByText(/Climate Watch/)).not.toBeInTheDocument(); // not ingested
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 5); // header + five sources
  });

  it('links each source to its landing page (a front-end lookup by source id) and cites it', () => {
    render(<SourcesSection {...props} />);
    const table = screen.getByRole('table', { name: /Every source the platform uses/ });
    expect(within(table).getByRole('link', { name: /^OWID CO₂ data \(GitHub\)/ })).toHaveAttribute('href', 'https://github.com/owid/co2-data');
    expect(within(table).getAllByRole('link', { name: /^NOAA GML: Trends in CO₂/ })[0]).toHaveAttribute('href', 'https://gml.noaa.gov/ccgg/trends/');
    expect(within(table).getByRole('link', { name: /^NCEI: Law Dome 2000-year record/ })).toHaveAttribute('href', 'https://www.ncei.noaa.gov/access/paleo-search/study/9959');
    expect(within(table).getByRole('link', { name: /^Berkeley Earth data/ })).toHaveAttribute('href', 'https://berkeleyearth.org/data/');
    expect(within(table).getByRole('link', { name: /^PRIMAP-hist v2\.8 \(Zenodo\)/ })).toHaveAttribute('href', 'https://zenodo.org/records/22876287');
    expect(within(table).getByRole('row', { name: /Berkeley Earth/ })).toHaveTextContent('Cite: Rohde & Hausfather 2020');
  });

  it('keeps the raw data files as a secondary link, from the API\'s source_urls', () => {
    const meta = { ...META, sources: META.sources.map((s) => (s.id === 'temperature_anomaly_annual' ? { ...s, source_urls: ['https://example.org/global.txt'] } : s)) } as typeof META;
    render(<SourcesSection {...props} meta={meta} />);
    expect(within(screen.getByRole('row', { name: /Berkeley Earth/ })).getByRole('link', { name: /^Data file/ })).toHaveAttribute('href', 'https://example.org/global.txt');
  });

  it('lets the keyboard scroll the table: a focusable region named by its caption', () => {
    render(<SourcesSection {...props} />);
    const region = screen.getByRole('region', { name: /Every source the platform uses/ });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('gives the two-totals note verbatim, why the series differ, the two cumulative scopes and the splice figures', () => {
    render(<SourcesSection {...props} />);
    const note = screen.getByText(/^The OWID country shares and the emissions-temperature regression use the same global total/);
    expect(note.textContent).toBe(META.two_global_totals);
    expect(screen.getByText(/differ in scope, method, the treatment of bunker fuels/)).toBeInTheDocument();
    expect(screen.getByText(/fossil and industry CO₂ since 1750.*total anthropogenic CO₂, which adds land-use change, since 1850/)).toBeInTheDocument();
    expect(screen.getByText(/Over the overlap years 1959–2004 the two records differ by up to 3\.9 ppm, and by 0\.28 ppm at the splice itself\./)).toBeInTheDocument();
  });

  it('says the sources could not be loaded, once, and leaves out every API-dependent part (never blank cells)', () => {
    render(<SourcesSection {...props} meta={null} metaFailed splice={null} cumulativeFrom={null} anthropogenicFrom={null} />);
    expect(screen.getByText('The sources, licences and data vintages could not be loaded right now.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Two global totals')).not.toBeInTheDocument();
    expect(screen.queryByText('Two cumulative totals')).not.toBeInTheDocument();
    expect(screen.queryByText(/^The \d{4} splice$/)).not.toBeInTheDocument();
  });
});

describe('BaselinesSection', () => {
  it('shows the baselines by view and the computed temperature offset', () => {
    render(<BaselinesSection meta={META} />);
    const table = screen.getByRole('table', { name: 'Baselines by view' });
    expect(within(table).getByRole('row', { name: /Long-run CO₂ relationship/ })).toHaveTextContent('1850–1900 reference');
    expect(within(table).getByRole('row', { name: /Overview, Historical Trends/ })).toHaveTextContent('1990 = 100');
    expect(screen.getByText(/computed from the Berkeley Earth record itself \(51 years\).*-0\.306 °C/)).toBeInTheDocument();
  });

  it('needs no data for the app\'s own rules, and omits the offset without it', () => {
    render(<BaselinesSection meta={null} />);
    expect(screen.getByRole('table', { name: 'Baselines by view' })).toBeInTheDocument();
    expect(screen.queryByText(/computed from the Berkeley Earth record/)).not.toBeInTheDocument();
  });
});
