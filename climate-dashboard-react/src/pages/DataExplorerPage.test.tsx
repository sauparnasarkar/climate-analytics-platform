import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Themed } from '../test/Themed';
import { AppProviders } from '../test/AppProviders';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { api } from '../api/client';
import type { ExplorerColumnDetail, ExplorerDataResponse, ExplorerDataset, ExplorerMetaResponse, ModelComparisonResponse } from '../api/types';
import DataExplorerPage from './DataExplorerPage';

// JumpLinks (SPEC.md §5.19) calls the design system's useReducedMotion during render -- jsdom has
// no window.matchMedia at all, so every test needs this stub. Same pattern as useCountUp.test.ts.
function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

// jsdom has no layout, so the design system's DataTable draws no cells here. Stand in for it by its props, following its
// rules: a column is numeric when its `numeric` says so or, left out, when every value is a number; a cell is written by the
// column's `format` when it has one, otherwise a number is written with the most decimals any value in the column has.
// The header (name, then its unit on its own line) is drawn too, so a test can read the units.
vi.mock('@syena/ds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@syena/ds')>();
  type Col = { key: string; header: string; unit?: string; numeric?: boolean; format?: (v: unknown, row: unknown) => string };
  const digits = (n: number) => (String(n).split('.')[1] ?? '').length;
  return {
    ...actual,
    DataTable: ({ caption, columns, rows, density, maxVisibleRows }: { caption: string; columns: Col[]; rows: Record<string, unknown>[]; density?: string; maxVisibleRows?: number }) => (
      <table aria-label={caption} data-density={density ?? 'comfortable'} data-max-rows={maxVisibleRows ?? 10}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.header}
                {c.unit ? <small>{c.unit}</small> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const values = rows.map((r) => r[c.key]).filter((v) => v !== null && v !== undefined);
                const numeric = c.numeric ?? (values.length > 0 && values.every((v) => typeof v === 'number'));
                const decimals = numeric ? Math.max(0, ...values.filter((v): v is number => typeof v === 'number').map(digits)) : undefined;
                const v = row[c.key];
                return (
                  <td key={c.key} data-numeric={String(numeric)}>
                    {c.format ? c.format(v, row) : numeric && typeof v === 'number' ? actual.formatFigure(v, { decimals }) : String(v ?? '')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    ),
  };
});

// RangeSlider/MultiSelect/DataTable render plain DOM (no canvas/Plotly lifecycle) —
// only Chart needs stubbing elsewhere in this app, none of that applies here.
vi.mock('../api/client', () => ({
  api: {
    explorerDatasets: vi.fn(),
    listCountries: vi.fn().mockResolvedValue({ featured: [], expanded: [] }), // the shell's settings panel asks for it
    explorerMeta: vi.fn(),
    explorerData: vi.fn(),
    explorerSummary: vi.fn(),
    explorerDownloadUrl: vi.fn(),
  },
}));

const detail = (id: string, label: string, over: Partial<ExplorerColumnDetail> = {}): ExplorerColumnDetail => ({
  id, label, unit: null, kind: 'level', decimals: null, is_key: false, default: true, ...over,
});

function dataset(over: Partial<ExplorerDataset> & Pick<ExplorerDataset, 'id' | 'title'>): ExplorerDataset {
  return {
    source_label: 'Our World in Data',
    description: `About ${over.title}.`,
    row_label: 'a country in a year',
    grain: 'country_year',
    keys: ['country', 'year'],
    chain_step: 'emissions',
    available: true,
    unavailable_reason: null,
    coverage: { first: '1990', last: '2023', countries: 218 },
    default_year_range: [1990, 2023],
    licence_class: 'open',
    source: {
      provenance_id: over.id, name: 'Our World in Data (Global Carbon Project)', short_citation: null, short_license: 'CC BY 4.0', license: 'CC BY 4.0', required_citation_format: null,
      landing_links: [], source_urls: [], source_release: null, retrieved_at: '2026-11-10T09:30:06+00:00', caveats: [], citations: [],
    },
    excluded_incomplete_years: [],
    charted_on: [{ label: 'Historical Trends', path: '/historical' }, { label: 'Country Profile', path: '/country-profile' }],
    method_note: `${over.title}: how it is made.`,
    methods_anchor: 'sources',
    ...over,
  };
}

const OWID = dataset({ id: 'owid_country', title: 'Country emissions' });
const PRIMAP = dataset({
  id: 'primap_global', title: 'Global emissions by gas', source_label: 'PRIMAP-hist', grain: 'global_year', keys: ['year'], row_label: 'the world in a year',
  coverage: { first: '1750', last: '2024', countries: null }, default_year_range: [1970, 2024], licence_class: 'non_commercial_share_alike',
  source: { ...OWID.source!, provenance_id: 'primap_global', name: 'PRIMAP-hist v2.8', short_license: 'CC BY-NC-SA 4.0 · non-commercial', caveats: ['National totals exclude international aviation and shipping.'] },
  excluded_incomplete_years: [2025], charted_on: [{ label: 'Climate Correlation', path: '/climate-correlation' }],
});
const TEMPERATURE = dataset({
  id: 'temperature', title: 'Global temperature', source_label: 'Berkeley Earth', grain: 'global_year', keys: ['year'], row_label: 'the whole world in a year',
  coverage: { first: '1850', last: '2025', countries: null }, default_year_range: [1850, 2025], licence_class: 'non_commercial',
  source: { ...OWID.source!, provenance_id: 'temperature_anomaly_annual', name: 'Berkeley Earth', short_license: 'CC BY-NC 4.0 · non-commercial' },
  charted_on: [{ label: 'Climate Correlation', path: '/climate-correlation' }],
});
const MONTHLY = dataset({
  id: 'co2_monthly', title: 'Atmospheric CO₂, monthly', source_label: 'Mauna Loa', grain: 'global_month', keys: ['year', 'month'], row_label: 'the world in a month',
  coverage: { first: '1958-03', last: '2026-09', countries: null }, default_year_range: [1958, 2026],
  source: { ...OWID.source!, provenance_id: 'co2_concentration_monthly_mlo', name: 'NOAA GML, Mauna Loa monthly mean', short_license: 'Public domain; cite NOAA GML' },
});
const UNAVAILABLE = dataset({ id: 'primap_country', title: 'Country emissions by gas', coverage: null, default_year_range: null, available: false, unavailable_reason: 'harmonized_country_annual.csv has not been generated yet', licence_class: null, source: null });
const DATASETS = [OWID, UNAVAILABLE, PRIMAP, MONTHLY, TEMPERATURE];

const OWID_META: ExplorerMetaResponse = {
  countries: ['China', 'Kenya', 'United States'],
  columns: ['country', 'year', 'co2', 'population'],
  year_min: 1990,
  year_max: 2023,
  dataset: 'owid_country',
  grain: 'country_year',
  keys: ['country', 'year'],
  columns_detail: [
    detail('country', 'Country', { kind: 'key', is_key: true }),
    detail('year', 'Year', { kind: 'key', is_key: true }),
    detail('co2', 'CO2', { unit: 'million tonnes (Mt)', kind: null }),
    detail('population', 'Population', { unit: 'people', kind: null, default: false }),
  ],
};
const TEMPERATURE_META: ExplorerMetaResponse = {
  countries: [], columns: ['year', 'anomaly'], year_min: 1850, year_max: 2025, dataset: 'temperature', grain: 'global_year', keys: ['year'],
  columns_detail: [detail('year', 'Year', { kind: 'key', is_key: true }), detail('anomaly', 'Global temperature anomaly (vs 1850-1900)', { unit: '°C', kind: 'anomaly' })],
};
const PRIMAP_META: ExplorerMetaResponse = {
  countries: [], columns: ['year', 'co2'], year_min: 1750, year_max: 2024, dataset: 'primap_global', grain: 'global_year', keys: ['year'],
  columns_detail: [detail('year', 'Year', { kind: 'key', is_key: true }), detail('co2', 'CO2 (PRIMAP-hist national)', { unit: 'Mt CO2', decimals: 0 })],
};
const MONTHLY_META: ExplorerMetaResponse = {
  countries: [], columns: ['year', 'month', 'co2_ppm'], year_min: 1958, year_max: 2026, dataset: 'co2_monthly', grain: 'global_month', keys: ['year', 'month'],
  columns_detail: [detail('year', 'Year', { kind: 'key', is_key: true }), detail('month', 'Month', { kind: 'key', is_key: true }), detail('co2_ppm', 'Monthly mean CO2 concentration', { unit: 'ppm' })],
};
const META_BY_ID: Record<string, ExplorerMetaResponse> = { owid_country: OWID_META, temperature: TEMPERATURE_META, primap_global: PRIMAP_META, co2_monthly: MONTHLY_META };

const DATA: ExplorerDataResponse = {
  columns: ['country', 'year', 'co2'],
  rows: [{ country: 'China', year: 2023, co2: 11000 }],
  total_rows: 1,
  page: 1,
  page_size: 50,
};
const SUMMARY: ModelComparisonResponse = {
  columns: ['column', 'label', 'unit', 'count', 'missing', 'min', 'p25', 'median', 'mean', 'p75', 'max'],
  rows: [{ column: 'co2', label: 'CO2', unit: 'million tonnes (Mt)', count: 7508, missing: 122, min: 0, p25: 0.85325, median: 7.172, mean: 137.54446710175813, p75: 60.1, max: 12289.037 }],
};

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.search}</output>;
}

function setUp(over: { datasets?: ExplorerDataset[]; data?: ExplorerDataResponse; summary?: ModelComparisonResponse } = {}) {
  vi.mocked(api.explorerDatasets).mockResolvedValue({ datasets: over.datasets ?? DATASETS });
  vi.mocked(api.explorerMeta).mockImplementation(async (id: string) => META_BY_ID[id]);
  vi.mocked(api.explorerData).mockResolvedValue(over.data ?? DATA);
  vi.mocked(api.explorerSummary).mockResolvedValue(over.summary ?? SUMMARY);
  vi.mocked(api.explorerDownloadUrl).mockImplementation((id: string) => `/api/explorer/download?dataset=${id}`);
}

function renderPage(url = '/data-explorer') {
  return render(<Themed><MemoryRouter initialEntries={[url]}><DataExplorerPage /><Where /></MemoryRouter></Themed>);
}

const picker = () => screen.findByRole('combobox', { name: /Data set/ });

beforeEach(() => {
  mockReducedMotion(false);
});

afterEach(() => {
  // Not vi.unstubAllGlobals() -- that would also wipe the global ResizeObserver stub
  // src/test/setup.ts establishes once for the whole file (the design system's DataTable needs
  // it), breaking every test after the first. beforeEach already re-stubs matchMedia fresh
  // before each test, so there's nothing stale left for this to clean up anyway.
  vi.clearAllMocks();
});

describe('DataExplorerPage', () => {
  it('fetches the data sets, then meta, data and summary for the default one, and renders the row count and filter controls', async () => {
    setUp();
    renderPage();

    expect(await screen.findByText('1 rows · page 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Data Explorer')).toBeInTheDocument();
    expect(screen.getByText('Countries (leave empty to show all)')).toBeInTheDocument();
    expect(screen.getByText('Year range')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Summary Statistics' })).toBeInTheDocument();

    expect(vi.mocked(api.explorerMeta)).toHaveBeenCalledWith('owid_country');
    // Opens on the data set's own default columns and year range, which the API sends.
    expect(vi.mocked(api.explorerData)).toHaveBeenCalledWith('owid_country', [], 1990, 2023, ['country', 'year', 'co2'], 1, 50);
    const link = screen.getByText('Download data and attribution (.zip)');
    expect(link).toHaveAttribute('href', '/api/explorer/download?dataset=owid_country');
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/); // the default data set keeps a clean URL
  });

  it('lists the data sets in the API\'s order, with an unavailable one disabled', async () => {
    setUp();
    const user = userEvent.setup();
    renderPage();
    await user.click(await picker());
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Country emissions · Our World in Data',
      'Country emissions by gas · Our World in Data',
      'Global emissions by gas · PRIMAP-hist',
      'Atmospheric CO₂, monthly · Mauna Loa',
      'Global temperature · Berkeley Earth',
    ]);
    expect(options[1]).toHaveAttribute('aria-disabled', 'true');
    expect(options[0]).not.toHaveAttribute('aria-disabled', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('opens a data set from ?dataset= and falls back to the default for an unknown one', async () => {
    setUp();
    renderPage('/data-explorer?dataset=temperature');
    expect(await screen.findByText('About Global temperature.')).toBeInTheDocument();
    await screen.findByText('1 rows · page 1 of 1');
    expect(vi.mocked(api.explorerMeta)).toHaveBeenCalledWith('temperature');
    expect(vi.mocked(api.explorerMeta)).not.toHaveBeenCalledWith('owid_country');
    expect(vi.mocked(api.explorerData)).toHaveBeenCalledWith('temperature', [], 1850, 2025, ['year', 'anomaly'], 1, 50);
  });

  it('does not judge ?dataset= against an empty list: the choice survives the list loading', async () => {
    setUp();
    renderPage('/data-explorer?dataset=co2_monthly');
    expect(await screen.findByText('About Atmospheric CO₂, monthly.')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('?dataset=co2_monthly');
  });

  it('falls back to the default data set for an unknown ?dataset=', async () => {
    setUp();
    renderPage('/data-explorer?dataset=nope');
    expect(await screen.findByText('About Country emissions.')).toBeInTheDocument();
    expect(vi.mocked(api.explorerMeta)).toHaveBeenCalledWith('owid_country');
  });

  it('switching data set resets the filters and the page, loads the new data set and writes ?dataset= to the URL', async () => {
    setUp({ data: { ...DATA, total_rows: 120 } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('120 rows · page 1 of 3');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('120 rows · page 2 of 3')).toBeInTheDocument();

    await user.click(await picker());
    await user.click(screen.getByRole('option', { name: 'Global temperature · Berkeley Earth' }));

    expect(await screen.findByText('About Global temperature.')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('?dataset=temperature');
    expect(await screen.findByText('120 rows · page 1 of 3')).toBeInTheDocument(); // back to page 1
    expect(vi.mocked(api.explorerData)).toHaveBeenLastCalledWith('temperature', [], 1850, 2025, ['year', 'anomaly'], 1, 50);
    // The default selection of the new data set, not the old one's.
    expect(vi.mocked(api.explorerSummary)).toHaveBeenLastCalledWith('temperature', [], 1850, 2025, ['year', 'anomaly']);
  });

  it('shows the compact card from the API: the description, then the facts in order on one line, with the short source label', async () => {
    setUp();
    renderPage();
    const card = await screen.findByRole('group', { name: 'About this data set' });
    expect(within(card).getByText('About Country emissions.')).toBeInTheDocument();
    const facts = card.querySelector('.explorer-facts-line') as HTMLElement;
    const items = [...facts.children].map((c) => c.textContent);
    expect(items).toEqual(['CC BY 4.0', 'One row: a country in a year', '1990–2023 · 218 countries', 'Our World in Data', 'Retrieved 2026-11-10', 'How to cite', 'Charted on Historical Trends, Country Profile']);
    // The short label, not the provenance's full source name (that stays on Methods & data and in ATTRIBUTION.txt).
    expect(within(card).queryByText('Our World in Data (Global Carbon Project)')).not.toBeInTheDocument();
    // The dots between facts are the stylesheet's (decorative): none in the markup, so none for assistive technology to read and none to strand at a wrapped row's edge.
    expect(facts.querySelector('.explorer-facts-sep')).toBeNull();
    expect(within(card).getByRole('link', { name: 'How to cite' })).toHaveAttribute('href', '/about#sources');
    expect(within(card).getByRole('link', { name: 'Historical Trends' })).toHaveAttribute('href', '/historical');
    expect(within(card).getByRole('link', { name: 'Country Profile' })).toHaveAttribute('href', '/country-profile');
  });

  it('opens the Dataset Preview section with the card, so the jump link lands on the card and the table', async () => {
    setUp();
    renderPage();
    const card = await screen.findByRole('group', { name: 'About this data set' });
    const section = document.getElementById('dataset-preview') as HTMLElement;
    expect(section.tagName).toBe('SECTION');
    expect(section.firstElementChild).toBe(card);
    const heading = screen.getByRole('heading', { name: 'Dataset Preview' });
    expect(section).toContainElement(heading);
    expect(section).toHaveAttribute('aria-labelledby', heading.id);
    expect(card.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the card comes before the heading
    expect(heading.id).not.toBe('dataset-preview'); // the jump id is the section's
    await screen.findByText('1 rows · page 1 of 1');
    expect(section).toContainElement(screen.getByRole('table', { name: 'Country emissions, 1990–2023' }));
    expect(screen.getByRole('link', { name: 'Dataset Preview' })).toHaveAttribute('href', '#dataset-preview');
  });

  it('writes coverage as read: months named for a monthly data set, and "shown from" where the table starts later than the data', async () => {
    setUp();
    const { unmount } = renderPage('/data-explorer?dataset=co2_monthly');
    expect(await screen.findByText('March 1958 – September 2026')).toBeInTheDocument();
    unmount();
    renderPage('/data-explorer?dataset=primap_global');
    expect(await screen.findByText('1750–2024 · shown from 1970')).toBeInTheDocument();
  });

  it('colours the licence tag by class, and puts the share-alike notice inside the card for PRIMAP-hist only', async () => {
    setUp();
    const { unmount } = renderPage();
    const open = (await screen.findByText('CC BY 4.0')).closest('span');
    expect(open?.className).toMatch(/positive/);
    expect(screen.queryByText(/Non-commercial use only/)).not.toBeInTheDocument();
    unmount();

    renderPage('/data-explorer?dataset=primap_global');
    const sa = (await screen.findByText('CC BY-NC-SA 4.0 · non-commercial')).closest('span');
    expect(sa?.className).toMatch(/caution/);
    const card = screen.getByRole('group', { name: 'About this data set' });
    const notice = within(card).getByText(/Non-commercial use only/);
    // The licence is named without the API's "· non-commercial" suffix, which the sentence already says; the data set's own source label is credited.
    expect(notice).toHaveTextContent('Non-commercial use only. Anything you publish from this data must carry CC BY-NC-SA 4.0 and credit PRIMAP-hist; the download includes the notice.');
    expect(screen.getAllByText(/Non-commercial use only/)).toHaveLength(1); // one notice, in the card: no separate alert outside it
  });

  it('colours a non-commercial (not share-alike) licence as caution, without the share-alike notice', async () => {
    setUp();
    renderPage('/data-explorer?dataset=temperature');
    const tag = (await screen.findByText('CC BY-NC 4.0 · non-commercial')).closest('span');
    expect(tag?.className).toMatch(/caution/);
    expect(screen.queryByText(/Non-commercial use only/)).not.toBeInTheDocument();
  });

  it('keeps the source\'s caveats in a closed "Source notes (n)" disclosure inside the card, and none for a data set without any', async () => {
    setUp();
    const { unmount } = renderPage('/data-explorer?dataset=primap_global');
    const card = await screen.findByRole('group', { name: 'About this data set' });
    const summary = within(card).getByText('Source notes (1)');
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(summary.tagName).toBe('SUMMARY');
    expect(within(details).getByText('National totals exclude international aviation and shipping.')).toBeInTheDocument();
    unmount();

    renderPage(); // owid_country: no caveats, no disclosure
    await screen.findByRole('group', { name: 'About this data set' });
    expect(screen.queryByText(/Source notes/)).not.toBeInTheDocument();
    expect(document.querySelector('details')).toBeNull();
  });

  it('replaces the country picker with a one-line note on a global data set, and names the monthly one a single station', async () => {
    setUp();
    const { unmount } = renderPage('/data-explorer?dataset=temperature');
    expect(await screen.findByText('A global series: no country filter')).toBeInTheDocument();
    expect(screen.queryByText('Countries (leave empty to show all)')).not.toBeInTheDocument();
    expect(screen.getByText('Year range')).toBeInTheDocument();
    unmount();
    renderPage('/data-explorer?dataset=co2_monthly');
    expect(await screen.findByText('One station: no country filter')).toBeInTheDocument();
  });

  it('shows each column\'s unit in the table header, for every data set including OWID, and a null unit as no unit line', async () => {
    setUp({ data: { ...DATA, columns: ['country', 'year', 'co2', 'population'], rows: [{ country: 'China', year: 2023, co2: 11000, population: 1410000000 }] } });
    renderPage();
    const preview = await screen.findByRole('table', { name: 'Country emissions, 1990–2023' });
    const heads = within(preview).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Country', 'Year', 'CO2million tonnes (Mt)', 'Populationpeople']);
  });

  it('names the month in a monthly data set and keeps its row keys as labels', async () => {
    setUp({ data: { ...DATA, columns: ['year', 'month', 'co2_ppm'], rows: [{ year: 2026, month: 3, co2_ppm: 430.15 }] } });
    renderPage('/data-explorer?dataset=co2_monthly');
    const preview = await screen.findByRole('table', { name: 'Atmospheric CO₂, monthly, 1958–2026' });
    const row = within(preview).getAllByRole('row')[1];
    expect([...row.children].map((c) => c.textContent)).toEqual(['2026', 'March', '430.15']);
    expect([...row.children].map((c) => c.getAttribute('data-numeric'))).toEqual(['false', 'false', 'true']);
  });

  it('writes a column at the decimals the catalog publishes it at, and one with no stated decimals as it is', async () => {
    setUp({ data: { ...DATA, columns: ['year', 'co2'], rows: [{ year: 1970, co2: 15435.661154 }, { year: 1971, co2: 15943.529923 }] } });
    renderPage('/data-explorer?dataset=primap_global');
    const preview = await screen.findByRole('table', { name: 'Global emissions by gas, 1970–2024' });
    const rows = within(preview).getAllByRole('row').slice(1).map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([['1970', '15,436'], ['1971', '15,944']]); // 0 decimals: not 15,435.661154
  });

  it('writes the Year column as a plain year (1990, not 1,990)', async () => {
    setUp({ data: { ...DATA, columns: ['country', 'year', 'population'], rows: [{ country: 'China', year: 1990, population: 1135185000 }] } });
    renderPage();
    const preview = await screen.findByRole('table', { name: 'Country emissions, 1990–2023' });
    expect(await within(preview).findByText('1990')).toBeInTheDocument();
    expect(within(preview).queryByText('1,990')).not.toBeInTheDocument();
  });

  it('writes the preview\'s numbers as they are: separators and a true minus, but no padded decimals (0.1 stays 0.1)', async () => {
    setUp({
      data: {
        ...DATA,
        columns: ['country', 'year', 'co2_per_capita', 'population', 'total_ghg'],
        rows: [
          { country: 'China', year: 1990, co2_per_capita: 0.1, population: 1135185000, total_ghg: -0.003 },
          { country: 'Kenya', year: 1991, co2_per_capita: 0.168, population: 23400000, total_ghg: 10.98 },
        ],
      },
    });
    renderPage();
    const preview = await screen.findByRole('table', { name: 'Country emissions, 1990–2023' });
    const rows = within(preview).getAllByRole('row').slice(1).map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['China', '1990', '0.1', '1,135,185,000', '−0.003'],
      ['Kenya', '1991', '0.168', '23,400,000', '10.98'],
    ]);
    expect([...preview.querySelectorAll('tbody tr')[0].children].map((c) => c.getAttribute('data-numeric'))).toEqual(['false', 'false', 'true', 'true', 'true']); // the keys are labels; the numbers stay right-aligned
  });

  it('writes the summary from typed numbers, one row per column: separators, a sensible number of decimals, a missing value empty', async () => {
    setUp({
      summary: {
        columns: SUMMARY.columns,
        rows: [
          { column: 'co2', label: 'CO2', unit: 'million tonnes (Mt)', count: 7508, missing: 122, min: 0, p25: 0.85325, median: 7.172, mean: 137.54446710175813, p75: 60.1, max: 12289.037 },
          { column: 'gdp', label: 'GDP', unit: null, count: 0, missing: 7630, min: null, p25: null, median: null, mean: null, p75: null, max: null },
        ],
      },
    });
    renderPage();
    const summary = await screen.findByRole('table', { name: 'Summary statistics' });
    expect(within(summary).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Column', 'Unit', 'Rows with data', 'Missing', 'Min', '25th percentile', 'Median', 'Mean', '75th percentile', 'Max'],
    );
    const rows = within(summary).getAllByRole('row').slice(1).map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['CO2', 'million tonnes (Mt)', '7,508', '122', '0', '0.853', '7.172', '137.5', '60.1', '12,289'],
      ['GDP', '', '0', '7,630', '', '', '', '', '', ''],
    ]);
    expect(screen.getByText(/The row keys \(country, year\) are not summarised/)).toBeInTheDocument();
  });

  it('fetches and shows nothing when every column is cleared, rather than the API\'s "all columns" for an empty list', async () => {
    setUp();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('1 rows · page 1 of 1');
    vi.mocked(api.explorerData).mockClear();
    vi.mocked(api.explorerSummary).mockClear();

    await user.click(screen.getByRole('combobox', { name: /Columns/ }));
    for (const name of ['Country', 'Year', 'CO2']) await user.click(screen.getByRole('option', { name }));

    expect(await screen.findByText('Select at least one column to preview the data.')).toBeInTheDocument();
    expect(screen.getByText('Select at least one column to summarise the data.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Summary statistics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Country emissions, 1990–2023' })).not.toBeInTheDocument();
    // No request was made for the empty selection (the last ones were for the selections on the way down, never for []).
    for (const call of vi.mocked(api.explorerData).mock.calls) expect(call[4]).not.toEqual([]);
    for (const call of vi.mocked(api.explorerSummary).mock.calls) expect(call[4]).not.toEqual([]);
  });

  it('sets both tables in the compact density, since they are long lists read down', async () => {
    setUp();
    renderPage();
    expect(await screen.findByRole('table', { name: 'Country emissions, 1990–2023' })).toHaveAttribute('data-density', 'compact');
    expect(screen.getByRole('table', { name: 'Summary statistics' })).toHaveAttribute('data-density', 'compact');
  });

  it('shows about fourteen rows of each table before it scrolls, so the compact rows fill a window as tall as before', async () => {
    setUp();
    renderPage();
    expect(await screen.findByRole('table', { name: 'Country emissions, 1990–2023' })).toHaveAttribute('data-max-rows', '14');
    expect(screen.getByRole('table', { name: 'Summary statistics' })).toHaveAttribute('data-max-rows', '14');
  });

  it('takes the method note from the API, not from a constant', async () => {
    setUp();
    renderPage('/data-explorer?dataset=temperature');
    expect(await screen.findByText('Global temperature: how it is made.')).toBeInTheDocument();
    expect(screen.queryByText(/aggregates like "World"/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Method →' })).toHaveAttribute('href', '/about#sources');
  });

  it('says which years the source held back as incomplete', async () => {
    setUp();
    renderPage('/data-explorer?dataset=primap_global');
    expect(await screen.findByText(/2025 is left out: PRIMAP-hist's latest year fails the completeness check/)).toBeInTheDocument();
  });

  it('explains an unavailable data set instead of loading it, and never fetches its data', async () => {
    setUp();
    renderPage('/data-explorer?dataset=primap_country');
    expect(await screen.findByText(/Country emissions by gas is not available right now: harmonized_country_annual.csv has not been generated yet/)).toBeInTheDocument();
    expect(vi.mocked(api.explorerMeta)).not.toHaveBeenCalled();
    expect(vi.mocked(api.explorerData)).not.toHaveBeenCalled();
  });

  it('renders an inline error instead of crashing when the data set list fails to load', async () => {
    vi.mocked(api.explorerDatasets).mockRejectedValue(new Error('Failed to load data.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
  });

  it('renders an inline error instead of crashing when meta fails to load', async () => {
    setUp();
    vi.mocked(api.explorerMeta).mockRejectedValue(new Error('Failed to load data.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
  });

  it('renders an inline error for the table when the data call fails, independent of summary', async () => {
    setUp();
    vi.mocked(api.explorerData).mockRejectedValue(new Error('Failed to load data.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
    expect(await screen.findByRole('heading', { name: 'Summary Statistics' })).toBeInTheDocument();
  });

  it('renders a Jump To nav under the h1 linking to both sections', async () => {
    setUp();
    renderPage();
    await screen.findByText('1 rows · page 1 of 1');

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Dataset Preview', 'Summary Statistics']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#dataset-preview', '#summary-stats']);
    expect(document.getElementById('dataset-preview')).not.toBeNull();
    expect(document.getElementById('summary-stats')).not.toBeNull();
  });
});

// The page inside the real dashboard shell: the Data set select is a page-wide filter, drawn in the analysis bar (SPEC.md §5.37.1).
describe('DataExplorerPage in the dashboard shell', () => {
  const renderShell = (url = '/data-explorer') => render(
    <AppProviders><MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/data-explorer" element={<DataExplorerPage />} />
        </Route>
      </Routes>
    </MemoryRouter></AppProviders>,
  );
  const bar = () => screen.getByRole('region', { name: 'Analysis controls' });
  const selectInBar = () => within(bar()).getByRole('combobox', { name: /Data set/ });

  it('draws the Data set select in the analysis bar, first of the page-wide filters, and not in the page body', async () => {
    setUp();
    renderShell();
    await screen.findByText('1 rows · page 1 of 1');
    const combos = within(bar()).getAllByRole('combobox');
    expect(combos[0]).toBe(selectInBar());
    expect(combos).toHaveLength(3); // Data set, Countries, Columns
    expect(within(document.getElementById('dataset-preview') as HTMLElement).queryByRole('combobox', { name: /Data set/ })).toBeNull();
  });

  it('keeps focus on the same select after a data set is chosen, once the new data set has loaded', async () => {
    setUp();
    const user = userEvent.setup();
    renderShell();
    await screen.findByText('1 rows · page 1 of 1');
    const select = selectInBar();
    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'Global temperature · Berkeley Earth' }));
    expect(await screen.findByText('About Global temperature.')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(select));
    expect(selectInBar()).toBe(select); // the same element: it was never remounted
  });

  it('keeps the select in the bar while the next data set\'s metadata loads, and the other filters return after it', async () => {
    setUp();
    let release: () => void = () => {};
    vi.mocked(api.explorerMeta).mockImplementation((id: string) => (id === 'temperature' ? new Promise<ExplorerMetaResponse>((resolve) => { release = () => resolve(TEMPERATURE_META); }) : Promise.resolve(META_BY_ID[id])));
    const user = userEvent.setup();
    renderShell();
    await screen.findByText('1 rows · page 1 of 1');
    const select = selectInBar();
    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'Global temperature · Berkeley Earth' }));
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(selectInBar()).toBe(select); // still there, and the slot with it
    expect(within(bar()).queryByText('Countries (leave empty to show all)')).toBeNull();
    release();
    expect(await screen.findByText('About Global temperature.')).toBeInTheDocument();
    expect(within(bar()).getByText('Year range')).toBeInTheDocument();
    expect(within(bar()).getAllByRole('combobox')[0]).toBe(select); // the select is still first
  });

  it('on a phone, names the data set in the top bar', async () => {
    setUp();
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({ matches: /max-width/.test(q), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    renderShell('/data-explorer?dataset=temperature');
    await screen.findByText('1 rows · page 1 of 1');
    expect(within(screen.getByRole('banner')).getByText('Global temperature')).toBeInTheDocument();
  });

  it('keeps the select in the bar for an unavailable data set, with the warning in the body and no card', async () => {
    setUp();
    renderShell('/data-explorer?dataset=primap_country');
    expect(await screen.findByText(/Country emissions by gas is not available right now/)).toBeInTheDocument();
    expect(within(bar()).getAllByRole('combobox')).toHaveLength(1);
    expect(selectInBar()).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'About this data set' })).not.toBeInTheDocument();
    expect(vi.mocked(api.explorerMeta)).not.toHaveBeenCalled();
  });
});

