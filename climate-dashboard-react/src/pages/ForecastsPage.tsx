import { useEffect, useRef, useState } from 'react';
import { ChartCard, Select, DataTable, Accordion, InlineAlert, Spinner, useReducedMotion, type DataTableColumn, Chart } from '@syena/ds';
import type { AccordionItem } from '@syena/ds';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useCountries } from '../hooks/useCountries';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import type { EtsParameterRow, ForecastSummaryRow } from '../api/types';
import { humanize } from '../lib/humanize';
import { PageChrome } from '../layouts/PageChrome';
import { StickyJumpLinks, useStickyRowReady } from '../components/StickyJumpLinks';
import { useLayoutSettled } from '../hooks/useLayoutSettled';
import { MODELS } from '../lib/sources';

// A forecast is a series, not a verdict -- pure green (the previous hardcoded '#008000')
// carries sentiment meaning elsewhere in this app and also fell short of the 3:1 non-text
// minimum on the dark chart panel in both themes.
// Slot 5 of the categorical palette reads cleanly on every theme and needs no theme-specific
// literal here.

const SUMMARY_COLUMNS: DataTableColumn<ForecastSummaryRow>[] = [
  { key: 'country', header: 'Country' },
  { key: 'forecast_2030', header: '2030 Forecast (MtCO₂)' },
  { key: 'forecast_2035', header: '2035 Forecast' },
  { key: 'forecast_2040', header: '2040 Forecast' },
  { key: 'actual_2020', header: '2020 Actual' },
  { key: 'pct_change_2020_2040', header: '% Change 2020→2040' },
];

const ETS_COLUMNS: DataTableColumn<EtsParameterRow>[] = [
  { key: 'country', header: 'Country' },
  { key: 'alpha', header: 'α (level)' },
  { key: 'beta_star', header: 'β* (trend)' },
  { key: 'phi', header: 'φ (damping)' },
];

// Panel DOM id (Accordion's `${id}-accordion-panel` convention) -> accordion item id, for
// resolving a bookmarked hash-jump target to the panel it needs opened first (SPEC.md §5.19).
const PANEL_TO_ACCORDION_ID: Record<string, string> = {
  'model-comparison-accordion-panel': 'model-comparison',
  'ets-params-accordion-panel': 'ets-params',
  'feature-importance-accordion-panel': 'feature-importance',
};

function countryCount(n: number): string {
  return `${n} ${n === 1 ? 'Country' : 'Countries'}`;
}

// Split out so the forecast fetch only ever starts once the expanded country list (and its
// featured-default seed) are already known — avoiding a wasted initial fetch for an
// undefined country before GET /api/countries resolves.
function ForecastsContent({ expanded, seedCountry }: { expanded: string[]; seedCountry: string }) {
  const [country, setCountry] = useState<string>(seedCountry);
  // Lifted so a jump-nav click can force a specific panel open before scrolling to it (SPEC.md
  // §5.19) -- a closed Accordion panel's content isn't even mounted, so scrolling there without
  // opening it first would land on nothing.
  const [openAccordionIds, setOpenAccordionIds] = useState<string[]>([]);
  const reduceMotion = useReducedMotion();

  const forecast = useAsync(() => api.forecast(country), [country]);
  const summary = useAsync(() => api.forecastSummary('expanded'), []);
  const modelComparison = useAsync(() => api.modelComparison(), []);
  const etsParams = useAsync(() => api.etsParameters(), []);
  const featureImportance = useAsync(() => api.featureImportance(), []);

  // A bookmarked/shared URL might target one of the 3 accordion-backed panels below -- those
  // don't exist in the DOM until their data has loaded AND the panel is open, unlike
  // #forecast-chart/#forecast-summary which are unconditionally in the DOM from first render.
  // Open the targeted panel (once its data is ready) before useJumpToHashOnLoad is allowed to fire.
  const hashAtMount = useRef(window.location.hash.slice(1));
  const targetAccordionId = PANEL_TO_ACCORDION_ID[hashAtMount.current];
  const allAccordionDataReady = Boolean(modelComparison.data && etsParams.data && featureImportance.data);

  useEffect(() => {
    if (targetAccordionId && allAccordionDataReady) {
      setOpenAccordionIds((ids) => (ids.includes(targetAccordionId) ? ids : [...ids, targetAccordionId]));
    }
  }, [targetAccordionId, allAccordionDataReady]);

  // The jump waits until the page has stopped growing: the panel opens over the design system's motion duration and the tables above it draw after the
  // first paint, and a jump measured before they have lands short of where the panel ends up.
  const targetOpen = Boolean(targetAccordionId && allAccordionDataReady && openAccordionIds.includes(targetAccordionId));
  const targetSettled = useLayoutSettled(targetOpen);
  const hashJumpReady = targetAccordionId ? targetOpen && targetSettled : true;
  // The deep-link jump also waits for the pinned row's first measurement: where it wraps, the offset is wrong until then.
  const { rowReady, onRowReady } = useStickyRowReady();
  useJumpToHashOnLoad(rowReady && hashJumpReady, reduceMotion);

  const accordionItems: AccordionItem[] = [];

  if (modelComparison.data) {
    const columns: DataTableColumn<Record<string, unknown>>[] = modelComparison.data.columns.map((c) => ({ key: c, header: humanize(c) }));
    accordionItems.push({
      id: 'model-comparison',
      title: 'Five-Model Comparison Table (MAE / RMSE)',
      content: <DataTable caption="Five-model comparison: mean absolute error and root mean squared error" columns={columns} rows={modelComparison.data.rows} />,
    });
  }

  if (etsParams.data) {
    accordionItems.push({
      id: 'ets-params',
      title: `ETS(A,Ad,N) Fitted Parameters — ${countryCount(etsParams.data.rows.length)}`,
      content: (
        <>
          <p className="syn-caption" style={{ marginBottom: 12 }}>
            <strong>α</strong> (level smoothing), <strong>β*</strong> (trend smoothing), and <strong>φ</strong> (damping)
            for each country's Holt's Damped Trend model, fit on 1990–2018.
          </p>
          <DataTable caption="ETS(A,Ad,N) fitted parameters by country" columns={ETS_COLUMNS} rows={etsParams.data.rows} />
        </>
      ),
    });
  }

  if (featureImportance.data) {
    const rows = featureImportance.data.rows;
    accordionItems.push({
      id: 'feature-importance',
      title: 'Random Forest Feature Importance (Pooled Model)',
      content: (
        <ChartCard source={MODELS} title="RF Pooled Feature Importances — Pooled Model" headingLevel={4}>
          <Chart
            height={280}
            orientation="h"
            xTitle="Importance (mean decrease in impurity)"
            yTitle="Feature"
            showLegend={false}
            ariaLabel={`Horizontal bar chart ranking ${rows.length} features by importance in the pooled Random Forest model, from ${rows[0]?.feature} (highest) to ${rows[rows.length - 1]?.feature} (lowest)`}
            series={[{ name: 'Importance', x: rows.map((r) => r.feature), y: rows.map((r) => r.importance), kind: 'bar' }]}
          />
        </ChartCard>
      ),
    });
  }

  // Opens an Accordion panel (if not already open) before the jump-nav click scrolls to it --
  // JumpLinks awaits this and then a double-rAF settle before measuring scroll position, so the
  // page doesn't need to know about that timing itself.
  const openPanel = (id: string) => () =>
    setOpenAccordionIds((ids) => (ids.includes(id) ? ids : [...ids, id]));

  // Stable labels (SPEC.md §5.19), distinct from each ChartCard's own (often dynamic) title.
  // The 3 accordion-backed items only appear once their data has actually loaded (matching
  // accordionItems' own conditional construction above) and target the panel's own DOM id
  // (`${id}-accordion-panel`, Accordion's existing convention), not the bare accordion item id.
  const jumpItems: JumpLinkItem[] = [
    { id: 'forecast-chart', label: 'Forecast Chart' },
    { id: 'forecast-summary', label: 'Forecast Summary' },
    ...(modelComparison.data
      ? [{ id: 'model-comparison-accordion-panel', label: 'Model Comparison', onBeforeJump: openPanel('model-comparison') }]
      : []),
    ...(etsParams.data
      ? [{ id: 'ets-params-accordion-panel', label: 'ETS Parameters', onBeforeJump: openPanel('ets-params') }]
      : []),
    ...(featureImportance.data
      ? [{ id: 'feature-importance-accordion-panel', label: 'Feature Importance', onBeforeJump: openPanel('feature-importance') }]
      : []),
  ];

  return (
    <div>
      <PageChrome
        title="ETS(A,Ad,N) Emissions Forecasts (2019–2043)"
        purpose="Forecasts from Holt's Damped Trend ETS(A,Ad,N) trained on 1990–2018, with 95% confidence intervals extending to 2043."
        summary={country}
        filters={<Select label={`Select a country (${expanded.length} available)`} options={expanded.map((c) => ({ value: c, label: c }))} value={country} onChange={setCountry} />}
      />
      <StickyJumpLinks onReady={onRowReady} items={jumpItems} />

      <div id="forecast-chart" style={{ margin: '16px 0' }}>
        {forecast.loading ? (
          <Spinner label="Loading…" />
        ) : forecast.error ? (
          <InlineAlert variant="error">{forecast.error}</InlineAlert>
        ) : forecast.data ? (
          <ChartCard source={MODELS} title={`ETS(A,Ad,N) Forecast — ${country}`} headingLevel={2}>
            <Chart
              height={340}
              xTitle="Year"
              yTitle="CO₂ (MtCO₂)"
              ariaLabel={`Line chart for ${country}: historical CO₂ emissions 1990 to 2018, holdout actuals 2019 to 2023, and ETS forecast with 95% confidence interval extending to 2043`}
              series={[
                { name: 'Historical (1990–2018)', x: forecast.data.hist_years, y: forecast.data.hist_co2, kind: 'line' },
                { name: 'Holdout actuals (2019–2023)', x: forecast.data.holdout_years, y: forecast.data.holdout_co2, kind: 'line' },
                { name: 'ETS Forecast', x: forecast.data.forecast_years, y: forecast.data.forecast_mean, kind: 'line', projected: true, slot: 5, band: { low: forecast.data.ci_lower, high: forecast.data.ci_upper, label: '95% interval' } },
              ]}
            />
          </ChartCard>
        ) : null}
      </div>

      <h2 id="forecast-summary" className="syn-title-sm">
        {summary.data ? `Forecast Summary — ${countryCount(summary.data.rows.length)}` : 'Forecast Summary'}
      </h2>
      {summary.loading ? (
        <Spinner label="Loading…" />
      ) : summary.error ? (
        <InlineAlert variant="error">{summary.error}</InlineAlert>
      ) : summary.data ? (
        <DataTable caption="Forecast summary by country" columns={SUMMARY_COLUMNS} rows={summary.data.rows} />
      ) : null}

      {accordionItems.length > 0 && (
        <div style={{ marginTop: 24 }}>
          {/* The jump links and bookmarked URLs name each panel by a stable id, which the design system's own panel ids (generated per page) cannot give. */}
          <Accordion
            multiple
            items={accordionItems.map((item) => ({ ...item, content: <div id={`${item.id}-accordion-panel`} tabIndex={-1}>{item.content}</div> }))}
            openIds={openAccordionIds}
            onOpenChange={setOpenAccordionIds}
          />
        </div>
      )}
    </div>
  );
}

export default function ForecastsPage() {
  const countries = useCountries();

  if (countries.loading) return <Spinner label="Loading…" />;
  if (countries.error) return <InlineAlert variant="error">{countries.error}</InlineAlert>;
  if (!countries.data) return null;

  return <ForecastsContent expanded={countries.data.expanded} seedCountry={countries.data.featured[0]} />;
}
