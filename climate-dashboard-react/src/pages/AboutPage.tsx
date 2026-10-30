import { useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { JumpLinks, Table, useReducedMotion } from '@syena/ds';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { AnchorScroll, StickyAnchorRow } from '../components/StickyAnchorRow';
import { DerivationAccordion } from '../components/module/DerivationAccordion';
import { AboutProject } from '../components/methods/AboutProject';
import { BaselinesSection } from '../components/methods/BaselinesSection';
import { SourcesSection } from '../components/methods/SourcesSection';
import { useAsync } from '../hooks/useAsync';
import { useClimateSignal } from '../hooks/useClimateSignal';
import { useCountries } from '../hooks/useCountries';
import { useElementHeight } from '../hooks/useElementHeight';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useStickyBarHeight } from '../hooks/useStickyBarHeight';
import { PageChrome } from '../layouts/PageChrome';
import { READING_MEASURE } from '../lib/readingMeasure';
import { FORCING_CONCEPT_ONLY, NOT_A_CLIMATE_MODEL, NO_COUNTRY_ATTRIBUTION, SCENARIO_LABEL } from '../lib/climateCopy';
import { buildDerivation } from '../lib/derivation';
import { METHODS_ANCHORS, owidCumulativeFrom } from '../lib/methodology';
import { SCENARIO_END_YEAR, SCENARIO_START_YEAR } from '../constants';

const JUMP_ROW_PX = 52;
const JUMP_ROW_GAP_PX = 10;

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: METHODS_ANCHORS.project, label: 'About the project' },
  { id: METHODS_ANCHORS.sources, label: 'Data sources' },
  { id: METHODS_ANCHORS.baselines, label: 'Baselines by view' },
  { id: METHODS_ANCHORS.forecasting, label: 'Emissions forecasting' },
  { id: METHODS_ANCHORS.correlation, label: 'Climate correlation' },
  { id: METHODS_ANCHORS.scenarios, label: 'Scenarios & implied temperature' },
  { id: METHODS_ANCHORS.limits, label: 'What this platform does not do' },
];
const JUMP_ITEMS: JumpLinkItem[] = SECTIONS.map((s, i) => ({ id: s.id, label: `${i + 1} · ${s.label}` }));

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
      <span className="syn-caption" style={{ color: 'var(--syn-color-text-muted)', letterSpacing: '0.06em' }}>{String(n).padStart(2, '0')}</span>
      <h2 id={`${id}-heading`} className="syn-title-md" style={{ margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

// Body text stops at a comfortable line length however wide the page; tables and cards keep the full width they need.
const prose = { margin: 0, maxWidth: READING_MEASURE } as const;

/**
 * Methods & data (route /about): how every number on the platform is made, and where the data comes from. The one place the method is written; the other
 * pages carry a two-line note and a "Method →" link here. Every figure is read from the API; only the descriptions of the app's own rules are fixed copy.
 */
export default function AboutPage() {
  const countries = useCountries();
  const climate = useClimateSignal();
  const metaQuery = useAsync(async () => api.correlationMeta(), []);
  const derivation = useMemo(() => buildDerivation(climate.headline), [climate.headline]);
  const meta = metaQuery.data;

  const methodologyRows = [
    {
      // Renders immediately rather than blocking on useCountries(): only this cell shows a brief "Loading…".
      step: 'Countries',
      detail: countries.data
        ? `Expanded: ${countries.data.expanded.length} countries (data-quality coverage + emissions-materiality selection). `
          + `The default selection is the ${countries.data.featured.length} Featured countries, unless you set your own in Settings. Featured: ${countries.data.featured.join(', ')}.`
        : countries.error
          ? countries.error
          : 'Loading…',
    },
    { step: 'Data', detail: 'OWID annual CO₂ per country, 1990 onward (the machine-learning window)' },
    { step: 'Features', detail: 'Lag features (1–3 yrs), 5-yr rolling mean, YoY % change, GHG intensity' },
    { step: 'Split', detail: 'Temporal: train 1990–2018, test 2019–2023' },
    { step: 'Models compared', detail: 'Naive Baseline · Linear Regression · Random Forest · ETS(A,Ad,N)' },
    { step: 'Forecast', detail: "Holt's Damped Trend ETS(A,Ad,N) trained on 1990–2018, forecast to 2043 with 95% CI" },
  ];

  const reduceMotion = useReducedMotion();
  const [stickyRow, setStickyRow] = useState<HTMLElement | null>(null);
  const stickyHeight = useElementHeight(stickyRow);
  const barHeight = useStickyBarHeight();
  const jumpRowPx = stickyHeight ? Math.ceil(stickyHeight) + JUMP_ROW_GAP_PX : JUMP_ROW_PX;
  // A deep link from another page waits for the sticky row's height and for everything above its target to settle. The sources section grows when /meta
  // answers (the table) and again when the concentration request answers (the splice card) and the headline does (the cumulative-totals card), so every
  // target below it waits for those three (not the temperature requests, which change nothing here); the sections after forecasting also wait for the countries cell.
  const { hash } = useLocation();
  const sourcesSettled = !metaQuery.loading && climate.notesDone;
  const targetSettled =
    hash === '' || hash === `#${METHODS_ANCHORS.project}` ? true
    : hash === `#${METHODS_ANCHORS.sources}` ? !metaQuery.loading
    : hash === `#${METHODS_ANCHORS.baselines}` || hash === `#${METHODS_ANCHORS.forecasting}` ? sourcesSettled
    : sourcesSettled && !countries.loading;
  useJumpToHashOnLoad(targetSettled && stickyHeight !== null, reduceMotion);
  const activeId = useScrollSpy(JUMP_ITEMS.map((i) => i.id), barHeight + jumpRowPx);

  return (
    <div>
      <style>{`.methods-page [id] { scroll-margin-top: ${barHeight + jumpRowPx}px; }`}</style>
      <div className="methods-page">
        <PageChrome title="Methods & data" purpose="How every number on the platform is made, and where its data comes from." ownsPurpose />
        <StickyAnchorRow innerRef={setStickyRow}>
          <div className="area2-anchor-line">
            <AnchorScroll>
              <JumpLinks items={JUMP_ITEMS} activeId={activeId} />
            </AnchorScroll>
          </div>
        </StickyAnchorRow>

        <Section id={METHODS_ANCHORS.project} n={1} title="About the project">
          <AboutProject headline={climate.headline} featured={countries.data?.featured[0]} />
        </Section>

        <Section id={METHODS_ANCHORS.sources} n={2} title="Data sources">
          <SourcesSection
            meta={meta}
            metaFailed={metaQuery.error !== null}
            splice={climate.splice}
            cumulativeFrom={owidCumulativeFrom(meta)}
            anthropogenicFrom={derivation?.regression.start ?? null}
          />
        </Section>

        <Section id={METHODS_ANCHORS.baselines} n={3} title="Baselines by view">
          <BaselinesSection meta={meta} />
        </Section>

        <Section id={METHODS_ANCHORS.forecasting} n={4} title="Emissions forecasting">
          <Table caption="Emissions forecasting method" columns={[{ key: 'step', header: 'Step' }, { key: 'detail', header: 'Detail', wrap: true }]} rows={methodologyRows} withBorder />
          <p className="syn-text-md" style={prose}>Model comparison and fitted parameters are results, not method: they are on the Forecasts page.</p>
        </Section>

        <Section id={METHODS_ANCHORS.correlation} n={5} title="Climate correlation">
          <p className="syn-text-md" style={prose}>
            The headline slope relates the global temperature anomaly to cumulative CO₂. It is a simplified, data-driven analogue of the IPCC&apos;s TCRE, not a climate model.
            The recent all-gas relationship (PRIMAP-hist, from 1970) uses the same method over a shorter window and is not a TCRE estimate.
          </p>
          {derivation && <DerivationAccordion derivation={derivation} />}
        </Section>

        <Section id={METHODS_ANCHORS.scenarios} n={6} title="Scenarios & implied temperature">
          <p className="syn-text-md" style={prose}>
            Three pathways run from {SCENARIO_START_YEAR} to {SCENARIO_END_YEAR}: business as usual (each country&apos;s ETS trend, fitted on all observed years), Moderate (−2% a year) and Aggressive (−5% a year).
            Implied temperature = the observed 5-year-mean anchor + the long-run slope × the emissions still to come. The covered countries follow each pathway; the rest of the world is held at its latest share, and
            land-use emissions at their latest level. {SCENARIO_LABEL}.
          </p>
        </Section>

        <Section id={METHODS_ANCHORS.limits} n={7} title="What this platform does not do">
          <ul className="syn-text-md" style={{ ...prose, paddingLeft: 20, lineHeight: 1.7 }}>
            <li>{NOT_A_CLIMATE_MODEL}</li>
            <li>Correlation is shown as context, not as proof of cause.</li>
            <li>{NO_COUNTRY_ATTRIBUTION}</li>
            <li>{FORCING_CONCEPT_ONLY}</li>
            <li>Scenario temperatures are illustrative translations of the pathways, not projections.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
