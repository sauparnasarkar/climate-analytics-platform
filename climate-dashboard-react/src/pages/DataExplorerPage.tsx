import { useMemo, useState } from 'react';
import { MethodNote } from '../components/MethodNote';
import { METHODS_ANCHORS, type MethodsAnchor } from '../lib/methodology';
import { Button, MultiSelect, RangeSlider, DataTable, InlineAlert, Select, Spinner, Text, useReducedMotion, type DataTableColumn } from '@syena/ds';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import { useUrlChoice } from '../hooks/useUrlChoice';
import type { ExplorerDataset, ExplorerMetaResponse } from '../api/types';
import { humanize } from '../lib/humanize';
import { plainYear } from '../lib/keyStatistics';
import { formatAt, formatNatural, formatStat, monthName } from '../lib/explorerFigures';
import { PageChrome, PageFilters } from '../layouts/PageChrome';
import { StickyJumpLinks, useStickyRowReady } from '../components/StickyJumpLinks';
import { DatasetCard } from '../components/explorer/DatasetCard';

const DEFAULT_DATASET = 'owid_country';
const PAGE_TITLE = 'Data Explorer';
const PAGE_PURPOSE = 'Browse the data behind this dashboard, one data set at a time. Each keeps its own rows, filters, source and licence.';
const PAGE_SIZE = 50;

// Stable labels (SPEC.md §5.19) -- this page uses no ChartCard at all, so both anchor ids land
// directly on the two static <h2> headings in DataExplorerContent below.
const JUMP_ITEMS: JumpLinkItem[] = [
  { id: 'dataset-preview', label: 'Dataset Preview' },
  { id: 'summary-stats', label: 'Summary Statistics' },
];

type Row = Record<string, unknown>;

// One row per column of the data set, over the filtered rows (SPEC.md §5.37): the API sends typed numbers, so no parsing here.
const SUMMARY_COLUMNS: DataTableColumn<Row>[] = [
  { key: 'label', header: 'Column', numeric: false },
  { key: 'unit', header: 'Unit', numeric: false, format: (v) => String(v ?? '') },
  { key: 'count', header: 'Rows with data', numeric: true, format: formatNatural },
  { key: 'missing', header: 'Missing', numeric: true, format: formatNatural },
  { key: 'min', header: 'Min', numeric: true, format: formatStat },
  { key: 'p25', header: '25th percentile', numeric: true, format: formatStat },
  { key: 'median', header: 'Median', numeric: true, format: formatStat },
  { key: 'mean', header: 'Mean', numeric: true, format: formatStat },
  { key: 'p75', header: '75th percentile', numeric: true, format: formatStat },
  { key: 'max', header: 'Max', numeric: true, format: formatStat },
];

const COUNTRY_FILTER_NOTE: Record<ExplorerDataset['grain'], string> = {
  country_year: '',
  global_year: 'A global series: no country filter',
  global_month: 'One station: no country filter',
};

const methodsAnchor = (name: string): MethodsAnchor => Object.values(METHODS_ANCHORS).find((a) => a === name) ?? METHODS_ANCHORS.sources;

const writeYears = (years: number[]) => (years.length === 1 ? `${years[0]} is` : `${years.slice(0, -1).join(', ')} and ${years[years.length - 1]} are`);

// Split out so the data/summary fetches only ever start once `meta` (and the default
// column selection / year range derived from it) are already known -- avoiding a wasted
// initial fetch of every column before the intended default subset is set. It is mounted with
// `key={dataset.id}`, so switching data set resets countries, years, columns and page to the
// new data set's defaults with no reset code.
function DataExplorerContent({ dataset, meta }: { dataset: ExplorerDataset; meta: ExplorerMetaResponse }) {
  const defaultColumns = meta.columns_detail.filter((c) => c.default).map((c) => c.id);
  const initialRange = dataset.default_year_range ?? [meta.year_min, meta.year_max];
  const [countries, setCountries] = useState<string[]>([]);
  const [yearMin, setYearMin] = useState(Math.max(meta.year_min, initialRange[0]));
  const [yearMax, setYearMax] = useState(Math.min(meta.year_max, initialRange[1]));
  const [columns, setColumns] = useState<string[]>(defaultColumns.length ? defaultColumns : meta.columns.slice(0, 7));
  const [page, setPage] = useState(1);

  // An empty selection fetches nothing: the client leaves an empty `columns` list out of the request, which the API reads as "all columns", so a fetch here
  // would show columns the reader has just cleared.
  const data = useAsync(
    () => (columns.length ? api.explorerData(dataset.id, countries, yearMin, yearMax, columns, page, PAGE_SIZE) : Promise.resolve(null)),
    [countries, yearMin, yearMax, columns, page],
  );
  const summary = useAsync(
    () => (columns.length ? api.explorerSummary(dataset.id, countries, yearMin, yearMax, columns) : Promise.resolve(null)),
    [countries, yearMin, yearMax, columns],
  );

  const totalPages = data.data ? Math.max(1, Math.ceil(data.data.total_rows / PAGE_SIZE)) : 1;
  const detail = useMemo(() => new Map(meta.columns_detail.map((c) => [c.id, c])), [meta]);

  // AG Grid treats a new `columnDefs` array reference as a real column-model change and
  // fully rebuilds the grid's column/header state — since this page's data (and its own
  // fresh `.map()` result) refetches on every filter tweak, an unmemoized array here forces
  // a full column rebuild on every keystroke/drag update instead of only when the actual
  // set of column names changes.
  const dataColumnsKey = (data.data?.columns ?? []).join(',');
  const dataColumns: DataTableColumn<Row>[] = useMemo(
    () =>
      (data.data?.columns ?? []).map((c) => {
        const d = detail.get(c);
        return {
          key: c,
          header: d?.label ?? humanize(c),
          unit: d?.unit ?? undefined,
          // A row key (country, year, month) is a label to read down, not a quantity: left-aligned, never rounded or separated.
          ...(d?.is_key ? { numeric: false } : {}),
          // A column the catalog publishes at a stated number of decimals is written at it; OWID's columns (no stated decimals) as they are.
          format: c === 'year' ? plainYear : c === 'month' ? monthName : d?.decimals != null ? (v: unknown) => formatAt(v, d.decimals as number) : formatNatural,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataColumnsKey, detail],
  );
  const downloadUrl = api.explorerDownloadUrl(dataset.id, countries, yearMin, yearMax, columns);
  const keyNames = meta.columns_detail.filter((c) => c.is_key).map((c) => c.label.toLowerCase());
  const excluded = dataset.excluded_incomplete_years;

  return (
    <div>
      <PageFilters>
        {meta.grain === 'country_year' ? (
          <MultiSelect
            label="Countries (leave empty to show all)"
            options={meta.countries.map((c) => ({ value: c, label: c }))}
            value={countries}
            onChange={(next) => {
              setCountries(next);
              setPage(1);
            }}
          />
        ) : (
          // Kept, not hidden, so the filter row keeps its shape across data sets.
          <div>
            <Text as="span" type="caption" tone="muted">Countries</Text>
            <p className="explorer-no-countries syn-caption">{COUNTRY_FILTER_NOTE[meta.grain]}</p>
          </div>
        )}
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
          options={meta.columns_detail.map((c) => ({ value: c.id, label: c.label }))}
          value={columns}
          onChange={(next) => {
            setColumns(next);
            setPage(1);
          }}
        />
      </PageFilters>

      {/* The jump target: the card, then the table, so the Dataset Preview link lands on both (SPEC.md §5.37.1). */}
      <section id="dataset-preview" aria-labelledby="dataset-preview-heading">
      <DatasetCard dataset={dataset} shownFrom={yearMin} />
      <h2 id="dataset-preview-heading" className="syn-title-sm">Dataset Preview</h2>
      {columns.length === 0 ? (
        <InlineAlert variant="default">Select at least one column to preview the data.</InlineAlert>
      ) : data.loading ? (
        <Spinner label="Loading…" />
      ) : data.error ? (
        <InlineAlert variant="error">{data.error}</InlineAlert>
      ) : data.data ? (
        <>
          <p className="syn-caption" style={{ color: 'var(--syn-color-text-muted)', margin: '4px 0 8px' }}>
            {data.data.total_rows.toLocaleString()} rows · page {page} of {totalPages}
          </p>
          <DataTable density="compact" maxVisibleRows={14} caption={`${dataset.title}, ${yearMin}–${yearMax}`} columns={dataColumns} rows={data.data.rows} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
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
              className="app-cta app-cta--secondary app-cta--s explorer-download"
            >
              Download data and attribution (.zip)
            </a>
          </div>
          {excluded.length > 0 ? (
            <p className="syn-caption" style={{ color: 'var(--syn-color-text-muted)', margin: '8px 0 0' }}>
              {writeYears(excluded)} left out: {dataset.source_label}&apos;s latest {excluded.length === 1 ? 'year fails' : 'years fail'} the completeness check.
            </p>
          ) : null}
        </>
      ) : null}

      </section>

      <h2 id="summary-stats" className="syn-title-sm" style={{ marginTop: 24 }}>Summary Statistics</h2>
      <p className="syn-caption" style={{ color: 'var(--syn-color-text-muted)', margin: '4px 0 8px' }}>
        One row per selected column, over the filtered rows.{keyNames.length ? ` The row keys (${keyNames.join(', ')}) are not summarised.` : ''}
      </p>
      {columns.length === 0 ? (
        <InlineAlert variant="default">Select at least one column to summarise the data.</InlineAlert>
      ) : summary.loading ? (
        <Spinner label="Loading…" />
      ) : summary.error ? (
        <InlineAlert variant="error">{summary.error}</InlineAlert>
      ) : summary.data ? (
        <DataTable density="compact" maxVisibleRows={14} caption="Summary statistics" columns={SUMMARY_COLUMNS} rows={summary.data.rows} />
      ) : null}
      <MethodNote anchor={methodsAnchor(dataset.methods_anchor)}>{dataset.method_note}</MethodNote>
    </div>
  );
}

// The pinned Data set select, then the chosen data set's content. Mounted only once the list is loaded, so a `?dataset=` in the URL is never judged against an empty list
// (which would drop it for the default). The select is in the page-wide filters (the analysis bar; the controls sheet on a phone), first of them, and sits here and not in
// the keyed content below, so it stays mounted and keeps its focus when the data set changes.
function DataExplorerBody({ datasets, rowReady, reduceMotion }: { datasets: ExplorerDataset[]; rowReady: boolean; reduceMotion: boolean }) {
  const ids = useMemo(() => datasets.map((d) => d.id), [datasets]);
  const [datasetId, setDatasetId] = useUrlChoice('dataset', ids, DEFAULT_DATASET);
  const dataset = datasets.find((d) => d.id === datasetId) ?? datasets[0];
  const options = useMemo(
    () => datasets.map((d) => ({ value: d.id, label: `${d.title} · ${d.source_label}`, disabled: !d.available })),
    [datasets],
  );
  const meta = useAsync(() => (dataset.available ? api.explorerMeta(dataset.id) : Promise.resolve(null)), [dataset.id, dataset.available]);
  // The deep-link jump also waits for the pinned row's first measurement: where it wraps, the offset is wrong until then.
  useJumpToHashOnLoad(rowReady && Boolean(meta.data), reduceMotion);

  return (
    <>
      {/* The phone's top bar names the data set (the title alone: the summary truncates to what fits beside the heading). */}
      <PageChrome title={PAGE_TITLE} purpose={PAGE_PURPOSE} summary={dataset.title} />
      <PageFilters>
        <div className="explorer-dataset-select">
          <Select label="Data set" options={options} value={dataset.id} onChange={setDatasetId} suppressSearch />
        </div>
      </PageFilters>
      {!dataset.available ? (
        <InlineAlert variant="warning">{dataset.title} is not available right now: {dataset.unavailable_reason ?? 'its source data has not been generated.'}</InlineAlert>
      ) : meta.loading ? (
        <Spinner label="Loading…" />
      ) : meta.error ? (
        <InlineAlert variant="error">{meta.error}</InlineAlert>
      ) : meta.data ? (
        <DataExplorerContent key={dataset.id} dataset={dataset} meta={meta.data} />
      ) : null}
    </>
  );
}

export default function DataExplorerPage() {
  const datasets = useAsync(() => api.explorerDatasets(), []);
  const reduceMotion = useReducedMotion();
  const { rowReady, onRowReady } = useStickyRowReady();

  return (
    <div>
      <StickyJumpLinks onReady={onRowReady} items={JUMP_ITEMS} />

      {datasets.data ? (
        <DataExplorerBody datasets={datasets.data.datasets} rowReady={rowReady} reduceMotion={reduceMotion} />
      ) : (
        <>
          {/* Until the list is here the body (which names the data set) is not mounted: this one chrome stands in, and is gone before the body's takes over. */}
          <PageChrome title={PAGE_TITLE} purpose={PAGE_PURPOSE} />
          {datasets.loading ? <Spinner label="Loading…" /> : datasets.error ? <InlineAlert variant="error">{datasets.error}</InlineAlert> : null}
        </>
      )}
    </div>
  );
}
