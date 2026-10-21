import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Themed } from '../test/Themed';
import { api } from '../api/client';
import type { ExplorerDataResponse, ExplorerMetaResponse, ModelComparisonResponse } from '../api/types';
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
vi.mock('@syena/ds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@syena/ds')>();
  type Col = { key: string; header: string; numeric?: boolean; format?: (v: unknown, row: unknown) => string };
  const digits = (n: number) => (String(n).split('.')[1] ?? '').length;
  return {
    ...actual,
    DataTable: ({ caption, columns, rows, density, maxVisibleRows }: { caption: string; columns: Col[]; rows: Record<string, unknown>[]; density?: string; maxVisibleRows?: number }) => (
      <table aria-label={caption} data-density={density ?? 'comfortable'} data-max-rows={maxVisibleRows ?? 10}>
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
    explorerMeta: vi.fn(),
    explorerData: vi.fn(),
    explorerSummary: vi.fn(),
    explorerDownloadUrl: vi.fn(),
  },
}));

const META: ExplorerMetaResponse = {
  countries: ['China', 'Kenya', 'United States'],
  columns: ['country', 'year', 'co2', 'population'],
  year_min: 1990,
  year_max: 2023,
};
const DATA: ExplorerDataResponse = {
  columns: ['country', 'year', 'co2'],
  rows: [{ country: 'China', year: 2023, co2: 11000 }],
  total_rows: 1,
  page: 1,
  page_size: 50,
};
const SUMMARY: ModelComparisonResponse = {
  columns: ['statistic', 'co2'],
  rows: [{ statistic: 'count', co2: 1 }],
};

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
  it('fetches meta then data/summary, and renders the row count and filter controls', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockResolvedValue(DATA);
    vi.mocked(api.explorerSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.explorerDownloadUrl).mockReturnValue('/api/explorer/download?foo=bar');
    render(<Themed><DataExplorerPage /></Themed>);

    expect(await screen.findByText('Data Explorer')).toBeInTheDocument();
    expect(await screen.findByText('1 rows · page 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Countries (leave empty to show all)')).toBeInTheDocument();
    expect(screen.getByText('Year range')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Summary Statistics' })).toBeInTheDocument();

    expect(vi.mocked(api.explorerData)).toHaveBeenCalledWith([], 1990, 2023, ['country', 'year', 'co2', 'population'], 1, 50);
    const link = screen.getByText('Download filtered data as CSV');
    expect(link).toHaveAttribute('href', '/api/explorer/download?foo=bar');
  });

  it('writes the Year column as a plain year (1990, not 1,990), in the preview and in the summary', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockResolvedValue({ ...DATA, columns: ['country', 'year', 'population'], rows: [{ country: 'China', year: 1990, population: 1135185000 }] });
    vi.mocked(api.explorerSummary).mockResolvedValue({ columns: ['statistic', 'year'], rows: [{ statistic: 'min', year: '1990' }, { statistic: 'max', year: '2024' }] });
    vi.mocked(api.explorerDownloadUrl).mockReturnValue('/x');
    render(<Themed><DataExplorerPage /></Themed>);
    const preview = await screen.findByRole('table', { name: 'Dataset preview' });
    expect(await within(preview).findByText('1990')).toBeInTheDocument();
    expect(within(preview).queryByText('1,990')).not.toBeInTheDocument();
    const summary = screen.getByRole('table', { name: 'Summary statistics' });
    expect(await within(summary).findByText('2024')).toBeInTheDocument();
    expect(within(summary).queryByText('2,024')).not.toBeInTheDocument();
  });

  it('writes the preview\'s numbers as they are: separators and a true minus, but no padded decimals (0.1 stays 0.1)', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockResolvedValue({
      ...DATA,
      columns: ['country', 'year', 'co2_per_capita', 'population', 'total_ghg'],
      rows: [
        { country: 'China', year: 1990, co2_per_capita: 0.1, population: 1135185000, total_ghg: -0.003 },
        { country: 'Kenya', year: 1991, co2_per_capita: 0.168, population: 23400000, total_ghg: 10.98 },
      ],
    });
    vi.mocked(api.explorerSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.explorerDownloadUrl).mockReturnValue('/x');
    render(<Themed><DataExplorerPage /></Themed>);
    const preview = await screen.findByRole('table', { name: 'Dataset preview' });
    const rows = within(preview).getAllByRole('row').map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['China', '1990', '0.1', '1,135,185,000', '−0.003'],
      ['Kenya', '1991', '0.168', '23,400,000', '10.98'],
    ]);
    expect([...preview.querySelectorAll('tr')[0].children].map((c) => c.getAttribute('data-numeric'))).toEqual(['false', 'true', 'true', 'true', 'true']); // numbers stay right-aligned
  });

  it('writes the summary like the preview: its text values parsed, with separators and a sensible number of decimals, years kept plain', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockResolvedValue(DATA);
    vi.mocked(api.explorerSummary).mockResolvedValue({
      columns: ['statistic', 'country', 'year', 'co2', 'population'],
      rows: [
        { statistic: 'count', country: '7630', year: '7630', co2: '7508', population: '7560' },
        { statistic: 'top', country: 'Afghanistan', year: '', co2: '', population: '' },
        { statistic: 'mean', country: '', year: '2007', co2: '137.54446710175813', population: '31302138.233862434' },
        { statistic: 'std', country: '', year: '10.100166832057344', co2: '675.2864584040935', population: '125305091.82751873' },
        { statistic: 'min', country: '', year: '1990', co2: '0', population: '501' },
        { statistic: '25%', country: '', year: '1998', co2: '0.85325', population: '634044.5' },
        { statistic: 'max', country: '', year: '2024', co2: '12289.037', population: '1450935785' },
      ],
    });
    vi.mocked(api.explorerDownloadUrl).mockReturnValue('/x');
    render(<Themed><DataExplorerPage /></Themed>);
    const summary = await screen.findByRole('table', { name: 'Summary statistics' });
    const rows = within(summary).getAllByRole('row').map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['count', '7,630', '7,630', '7,508', '7,560'],
      ['top', 'Afghanistan', '', '', ''],
      ['mean', '', '2007', '137.5', '31,302,138'],
      ['std', '', '10.1', '675.3', '125,305,092'],
      ['min', '', '1990', '0', '501'],
      ['25%', '', '1998', '0.853', '634,045'],
      ['max', '', '2024', '12,289', '1,450,935,785'],
    ]);
    // A column of numbers is a numeric column (right-aligned); the country column, which holds a name, is not.
    expect([...summary.querySelectorAll('tr')[0].children].map((c) => c.getAttribute('data-numeric'))).toEqual(['false', 'false', 'true', 'true', 'true']);
  });

  it('sets both tables in the compact density, since they are long lists read down', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockResolvedValue(DATA);
    vi.mocked(api.explorerSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.explorerDownloadUrl).mockReturnValue('/x');
    render(<Themed><DataExplorerPage /></Themed>);
    expect(await screen.findByRole('table', { name: 'Dataset preview' })).toHaveAttribute('data-density', 'compact');
    expect(screen.getByRole('table', { name: 'Summary statistics' })).toHaveAttribute('data-density', 'compact');
  });

  it('shows about fourteen rows of each table before it scrolls, so the compact rows fill a window as tall as before', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockResolvedValue(DATA);
    vi.mocked(api.explorerSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.explorerDownloadUrl).mockReturnValue('/x');
    render(<Themed><DataExplorerPage /></Themed>);
    expect(await screen.findByRole('table', { name: 'Dataset preview' })).toHaveAttribute('data-max-rows', '14');
    expect(screen.getByRole('table', { name: 'Summary statistics' })).toHaveAttribute('data-max-rows', '14');
  });

  it('says that regional and income-group aggregates are excluded from the data', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockResolvedValue(DATA);
    vi.mocked(api.explorerSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.explorerDownloadUrl).mockReturnValue('/x');
    render(<Themed><DataExplorerPage /></Themed>);
    expect(await screen.findByText(/aggregates like "World" or "European Union" excluded/)).toBeInTheDocument();
  });

  it('renders an inline error instead of crashing when meta fails to load', async () => {
    vi.mocked(api.explorerMeta).mockRejectedValue(new Error('Failed to load data.'));
    render(<Themed><DataExplorerPage /></Themed>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
  });

  it('renders an inline error for the table when the data call fails, independent of summary', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockRejectedValue(new Error('Failed to load data.'));
    vi.mocked(api.explorerSummary).mockResolvedValue(SUMMARY);
    render(<Themed><DataExplorerPage /></Themed>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
    expect(await screen.findByRole('heading', { name: 'Summary Statistics' })).toBeInTheDocument();
  });

  it('renders a Jump To nav under the h1 linking to both sections', async () => {
    vi.mocked(api.explorerMeta).mockResolvedValue(META);
    vi.mocked(api.explorerData).mockResolvedValue(DATA);
    vi.mocked(api.explorerSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.explorerDownloadUrl).mockReturnValue('/api/explorer/download?foo=bar');
    render(<Themed><DataExplorerPage /></Themed>);
    await screen.findByText('1 rows · page 1 of 1');

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Dataset Preview', 'Summary Statistics']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#dataset-preview', '#summary-stats']);
    expect(document.getElementById('dataset-preview')).not.toBeNull();
    expect(document.getElementById('summary-stats')).not.toBeNull();
  });
});
