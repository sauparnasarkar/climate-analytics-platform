import { useMemo, useState } from 'react';
import { Button, MultiSelect, RangeSlider, DataTable, InlineAlert, Spinner, useReducedMotion, type DataTableColumn } from '@syena/ds';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import type { ExplorerMetaResponse } from '../api/types';
import { humanize } from '../lib/humanize';
import { plainYear } from '../lib/keyStatistics';
import { formatNatural, formatSummaryValue, isNumberColumn } from '../lib/explorerFigures';
import { PageChrome, PageFilters } from '../layouts/PageChrome';
import { StickyJumpLinks, useStickyRowReady } from '../components/StickyJumpLinks';

const DEFAULT_COLUMNS = ['country', 'year', 'co2', 'co2_per_capita', 'population', 'gdp', 'total_ghg'];
const PAGE_SIZE = 50;

// Stable labels (SPEC.md §5.19) -- this page uses no ChartCard at all, so both anchor ids land
// directly on the two static <h2> headings in DataExplorerContent below.
const JUMP_ITEMS: JumpLinkItem[] = [
  { id: 'dataset-preview', label: 'Dataset Preview' },
  { id: 'summary-stats', label: 'Summary Statistics' },
];

// Split out so the data/summary fetches only ever start once `meta` (and the default
// column selection / year range derived from it) are already known — avoiding a wasted
// initial fetch of all 79 columns before the intended default subset is set.
function DataExplorerContent({ meta }: { meta: ExplorerMetaResponse }) {
  const [countries, setCountries] = useState<string[]>([]);
  const [yearMin, setYearMin] = useState(meta.year_min);
  const [yearMax, setYearMax] = useState(meta.year_max);
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS.filter((c) => meta.columns.includes(c)));
  const [page, setPage] = useState(1);

  const data = useAsync(
    () => api.explorerData(countries, yearMin, yearMax, columns, page, PAGE_SIZE),
    [countries, yearMin, yearMax, columns, page],
  );
  const summary = useAsync(
    () => api.explorerSummary(countries, yearMin, yearMax, columns),
    [countries, yearMin, yearMax, columns],
  );

  const totalPages = data.data ? Math.max(1, Math.ceil(data.data.total_rows / PAGE_SIZE)) : 1;

  // AG Grid treats a new `columnDefs` array reference as a real column-model change and
  // fully rebuilds the grid's column/header state — since this page's data (and its own
  // fresh `.map()` result) refetches on every filter tweak, an unmemoized array here forces
  // a full column rebuild on every keystroke/drag update instead of only when the actual
  // set of column names changes.
  const dataColumnsKey = (data.data?.columns ?? []).join(',');
  const dataColumns: DataTableColumn<Record<string, unknown>>[] = useMemo(
    () => (data.data?.columns ?? []).map((c) => ({ key: c, header: humanize(c), format: c === 'year' ? plainYear : formatNatural })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataColumnsKey],
  );
  // A summary column is numeric (right-aligned, in the figure face) when every value in it is a number, as the table does for its own.
  const summaryNumeric = (summary.data?.columns ?? []).map((c) => isNumberColumn((summary.data?.rows ?? []).map((r) => r[c])));
  const summaryColumnsKey = `${(summary.data?.columns ?? []).join(',')}|${summaryNumeric.join(',')}`;
  const summaryColumns: DataTableColumn<Record<string, unknown>>[] = useMemo(
    () =>
      (summary.data?.columns ?? []).map((c, i) => ({
        key: c,
        header: c === 'statistic' ? 'Statistic' : humanize(c),
        // This table is transposed (one row per statistic: `top`, `unique` and `freq` are text, `mean` and `std`
        // are numbers, in the same column), and its values arrive as text, so each is parsed and written here.
        numeric: summaryNumeric[i],
        format: (value: unknown, row: Record<string, unknown>) => formatSummaryValue(c, value, row.statistic),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summaryColumnsKey],
  );
  const downloadUrl = api.explorerDownloadUrl(countries, yearMin, yearMax, columns);

  return (
    <div>
      <PageFilters>
        <MultiSelect
          label="Countries (leave empty to show all)"
          options={meta.countries.map((c) => ({ value: c, label: c }))}
          value={countries}
          onChange={(next) => {
            setCountries(next);
            setPage(1);
          }}
        />
        <RangeSlider
          label="Year range"
          min={meta.year_min}
          max={meta.year_max}
          value={[yearMin, yearMax]}
          thumbLabels={['From year', 'To year']}
          onChange={([lo, hi]) => {
            setYearMin(lo);
            setYearMax(hi);
            setPage(1);
          }}
        />
        <MultiSelect
          label="Columns"
          options={meta.columns.map((c) => ({ value: c, label: humanize(c) }))}
          value={columns}
          onChange={(next) => {
            setColumns(next);
            setPage(1);
          }}
        />
      </PageFilters>

      <h2 id="dataset-preview" className="syn-title-sm">Dataset Preview</h2>
      {columns.length === 0 ? (
        <InlineAlert variant="default">Select at least one column to preview the data.</InlineAlert>
      ) : data.loading ? (
        <Spinner />
      ) : data.error ? (
        <InlineAlert variant="warning">{data.error}</InlineAlert>
      ) : data.data ? (
        <>
          <p className="syn-caption" style={{ color: 'var(--syn-color-text-muted)', margin: '4px 0 8px' }}>
            {data.data.total_rows.toLocaleString()} rows · page {page} of {totalPages}
          </p>
          <DataTable density="compact" maxVisibleRows={14} caption="Dataset preview" columns={dataColumns} rows={data.data.rows} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
            <a
              href={downloadUrl}
              download
              className="app-cta app-cta--secondary app-cta--s"
              style={{ marginLeft: 'auto' }}
            >
              Download filtered data as CSV
            </a>
          </div>
        </>
      ) : null}

      <h2 id="summary-stats" className="syn-title-sm" style={{ marginTop: 24 }}>Summary Statistics</h2>
      {summary.loading ? (
        <Spinner />
      ) : summary.error ? (
        <InlineAlert variant="warning">{summary.error}</InlineAlert>
      ) : summary.data ? (
        <DataTable density="compact" maxVisibleRows={14} caption="Summary statistics" columns={summaryColumns} rows={summary.data.rows} />
      ) : null}
    </div>
  );
}

export default function DataExplorerPage() {
  const meta = useAsync(() => api.explorerMeta(), []);
  const reduceMotion = useReducedMotion();
  // Unlike the other five pages, this page's <h1> is in the outer component while
  // DataExplorerContent (and its two jump targets) mounts separately below, once meta.data
  // resolves -- ready reflects that, not just this outer component's own mount.
  // The deep-link jump also waits for the pinned row's first measurement: where it wraps, the offset is wrong until then.
  const { rowReady, onRowReady } = useStickyRowReady();
  useJumpToHashOnLoad(rowReady && Boolean(meta.data), reduceMotion);

  return (
    <div>
      <PageChrome
        title="Data Explorer"
        purpose={'Browse the full dataset behind this dashboard: every sovereign country (regional and income-group aggregates like "World" or "European Union" excluded) from 1990 onward, with the raw and derived columns.'}
      />
      <StickyJumpLinks onReady={onRowReady} items={JUMP_ITEMS} />

      {meta.loading ? <Spinner /> : meta.error ? <InlineAlert variant="warning">{meta.error}</InlineAlert> : meta.data ? (
        <DataExplorerContent meta={meta.data} />
      ) : null}
    </div>
  );
}
