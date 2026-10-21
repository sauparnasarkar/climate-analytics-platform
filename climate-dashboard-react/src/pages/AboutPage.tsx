import { Link, Table } from '@syena/ds';
import { useCountries } from '../hooks/useCountries';
import { FOOTER_COPYRIGHT, PRODUCT_NAME } from '../navigation';
import { PageChrome } from '../layouts/PageChrome';

const DATA_SOURCE_ROWS = [
  { dataset: 'OWID CO₂ and GHG Emissions', url: 'https://github.com/owid/co2-data' },
  { dataset: 'Climate Watch Historical Emissions', url: 'https://climatewatchdata.org' },
];

export default function AboutPage() {
  const countries = useCountries();
  const methodologyRows = [
    { step: 'Dataset', detail: 'OWID CO₂ dataset, filtered to sovereign nations from 1990 onwards' },
    {
      // Unlike other pages, this renders the table immediately rather than blocking on
      // useCountries() with a top-level Spinner — everything else here is static, so only
      // this one cell should show a brief "Loading…" rather than delaying the whole page.
      step: 'Countries',
      detail: countries.data
        ? `Expanded: ${countries.data.expanded.length} countries (data-quality coverage + emissions-materiality selection). `
          + `Selected (Overview page comparison) defaults to these Featured countries: ${countries.data.featured.join(', ')}.`
        : countries.error
          ? countries.error
          : 'Loading…',
    },
    { step: 'Feature Engineering', detail: 'Lag features (1–3 yrs), 5-yr rolling mean, YoY % change, GHG intensity' },
    { step: 'Train / Test Split', detail: 'Temporal — train 1990–2018, test 2019–2023' },
    { step: 'Models', detail: "Naive Baseline · Linear Regression · Random Forest · ETS(A,Ad,N)" },
    { step: 'Forecasting', detail: "Holt's Damped Trend ETS(A,Ad,N) trained on 1990–2018, forecast to 2043 with 95% CI" },
    { step: 'Scenarios', detail: 'BAU · Moderate (−2%/yr) · Aggressive (−5%/yr) from 2025' },
  ];

  return (
    <div>
      <PageChrome title="About This Project" purpose="How the platform was built and where its data comes from." />
      <h2 className="syn-title-md" style={{ margin: '16px 0 8px' }}>{PRODUCT_NAME}</h2>
      <p className="syn-text-md" style={{ marginBottom: 24 }}>
        The backend and AI/ML processes for this dashboard began as a 7-week data science project.
        Since then this has been expanded to introduce this React Dashboard and a conversational AI Agent.
      </p>

      <h3 className="syn-title-sm" style={{ marginBottom: 8 }}>Methodology Summary</h3>
      <Table
        caption="Methodology summary"
        columns={[
          { key: 'step', header: 'Step' },
          { key: 'detail', header: 'Detail', wrap: true },
        ]}
        rows={methodologyRows}
        withBorder
      />

      <h3 className="syn-title-sm" style={{ margin: '24px 0 8px' }}>Data Sources</h3>
      <Table
        caption="Data sources"
        columns={[
          { key: 'dataset', header: 'Dataset' },
          { key: 'url', header: 'URL', wrap: true, render: (row) => <Link href={row.url} target="_blank" rel="noopener noreferrer">{row.url}</Link> },
        ]}
        rows={DATA_SOURCE_ROWS}
        withBorder
      />

      <p className="syn-caption" style={{ marginTop: 24, color: 'var(--syn-color-text-muted)' }}>
        <em>{FOOTER_COPYRIGHT}</em>
      </p>
    </div>
  );
}
