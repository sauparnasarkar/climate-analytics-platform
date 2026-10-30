import { api } from '../../api/client';
import type { CorrelationEmissionsTemperatureResponse } from '../../api/correlationTypes';
import { useAsync } from '../../hooks/useAsync';
import { AR6_TCRE } from '../../lib/climateCopy';
import { countWord, headlineFacts } from '../../lib/aboutProject';
import { READING_MEASURE } from '../../lib/readingMeasure';
import { BASELINE_YEAR } from '../../constants';
import { PRODUCT_NAME } from '../../navigation';

const prose = { margin: 0, maxWidth: READING_MEASURE } as const;

/**
 * Methods & data §1. Every figure is read from the API at render time (the headline fit, the overview's country counts, a forecast's last year, the
 * scenarios); the IPCC 0.45 °C is the one fixed reference. A figure that is not available (loading, failed, unusable) takes its clause or paragraph
 * with it: nothing stale, zero or placeholder is ever shown.
 */
export function AboutProject({ headline, featured }: { headline: CorrelationEmissionsTemperatureResponse | null; featured: string | undefined }) {
  const overview = useAsync(() => api.overview(), []);
  const scenarios = useAsync(() => api.scenarioTimeseries('global'), []);
  const forecast = useAsync(async () => (featured ? api.forecast(featured) : null), [featured]);

  const facts = headlineFacts(headline);
  const all = overview.data?.all_countries?.countries_count;
  const expanded = overview.data?.expanded_countries?.countries_count;
  const allCountries = Number.isInteger(all) && all! > 0 ? all! : null;
  const expandedCountries = Number.isInteger(expanded) && expanded! > 0 ? expanded! : null;
  const years = forecast.data?.forecast_years ?? [];
  const lastYear = years.length > 0 ? years[years.length - 1] : null;
  const forecastEnd = typeof lastYear === 'number' && Number.isInteger(lastYear) ? lastYear : null;
  const pathways = countWord(scenarios.data?.scenarios?.length);

  const forecasts = ['compare emission forecasts', forecastEnd !== null ? `to ${forecastEnd}` : '', expandedCountries !== null ? `for ${expandedCountries} countries` : ''].filter(Boolean).join(' ');
  const temperature = pathways !== null ? `what ${pathways} pathways would imply for temperature` : '';

  return (
    <>
      <p className="syn-text-md" style={prose}>
        {PRODUCT_NAME} shows how emissions add up to warming. It follows the chain from the CO₂ each country emits, to the CO₂ that builds up in the atmosphere, to the rise in
        global temperature, using published observations rather than a climate model.
      </p>
      {facts.slope !== null && (
        <p className="syn-text-md" style={prose}>
          {facts.years !== null ? `Across ${facts.years} years of records, warming` : 'Warming'} has tracked the total CO₂ emitted: about {facts.slope} °C for every 1,000 billion tonnes
          {facts.comparison !== null ? `, ${facts.comparison} the IPCC’s best estimate of ${AR6_TCRE.best} °C` : ''}.
        </p>
      )}
      <p className="syn-text-md" style={{ ...prose }}>With it you can:</p>
      <ul className="syn-text-md" style={{ ...prose, paddingLeft: 20, listStyle: 'disc', lineHeight: 1.7 }}>
        <li>see who emits, how that has changed since {BASELINE_YEAR}, and who emitted the stock{allCountries !== null ? `, across ${allCountries} countries` : ''};</li>
        <li>follow emissions through atmospheric concentration to temperature, and see how closely they move together;</li>
        <li>{forecasts}{temperature ? `, and ${temperature}` : ''};</li>
        <li>ask questions in plain language and get answers drawn from the same data.</li>
      </ul>
      <p className="syn-text-md" style={prose}>
        Every figure is computed from open sources by a documented, repeatable pipeline, and the forecasts are tested against years held back from training.
      </p>
      {/* The width is set on a wrapper in the body size, so this smaller muted line wraps where the paragraphs above do (100ch is a width in its own font). */}
      <div className="syn-text-md" style={prose}>
        <p className="syn-caption" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }}>
          <strong>Coming next:</strong> what drives emissions, sector by sector, and scenarios you can adjust yourself to see how each choice changes the warming.
        </p>
      </div>
    </>
  );
}
