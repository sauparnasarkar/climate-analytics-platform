import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Globe, Icon, InlineAlert, Slider } from '@syena/ds';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useStableViewportHeight, useViewportHeight } from '../hooks/useViewportHeight';
import { useInView } from '../hooks/useInView';
import { useYearAnimation } from '../hooks/useYearAnimation';
import { RankRace } from '../components/landing/RankRace';
import { CLIMATE_BANNER_STYLES, ClimateSignalBanner } from '../components/landing/ClimateSignalBanner';
import { CAROUSEL_STYLES, HeroCarousel, type PageAnchor } from '../components/landing/HeroCarousel';
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { ctaClass } from '../components/landing/cta';
import { buildClimateSignal } from '../lib/climateSignal';
import { sliceMapSeries, worldTotals } from '../lib/mapSeries';
import { ChainBand } from '../components/landing/ChainBand';
import { KPI_STRIP_STYLES, KpiStrip } from '../components/landing/KpiStrip';
import {
  FORECAST_END_YEAR, MAX_SELECTED_COUNTRIES, NEGATIVE_COLOR, POSITIVE_COLOR, SCENARIO_END_YEAR, SCENARIO_START_YEAR,
} from '../constants';
import { fmtInt, fmtPct, GLOBE_LABEL_COUNT, growthPhrase, latestTopShare, phoneGlobeMax, pickStories, RACE_SIZE, sparklinePath, topEmitterLabels, type Story } from '../lib/landingData';
import { worldTotalsFrom } from '../lib/cumulative';
import { NAV_ITEMS } from '../navigation';
import type { OverviewResponse, WorldMapTimeSeries } from '../api/types';

// Landing page (SPEC.md §5.25). Every number and year on it is computed from the API's
// own responses (/overview, /overview/world-map-series) -- nothing is typed in -- so a weekly data
// refresh that moves the latest year or country counts updates the page with no code change.

// The landing globe is ambient (requirements §2.6): it turns once, continuously, while the year
// advances one at a time from GLOBE_START_YEAR to the latest, blending colours between years so the change reads as smooth
// rather than stepped. ~350 ms a year, ~19 s for the whole pass (it was 700 ms / ~38 s). (the earlier decade-by-decade steps are replaced.)
// The legend, controls, slider and total stay visible throughout; the top emitters stay named while it plays.
const GLOBE_START_YEAR = 1970;
const GLOBE_STEP_MS = 350;
// One full turn of the globe, in seconds, while it turns on its own (owner decision, 2026-10-19: 30 s; the design system's default is 60).
const GLOBE_TURN_SECONDS = 30;
const GLOBE_STEP_YEARS = 1;
// The rest of the landing page (stories, rank race, KPIs) still reads from 1990, the project's baseline year.
const BASELINE_YEAR = 1990;

// How long the page waits, once the overview and map are ready, for the optional climate-signal data before settling on
// the existing hero alone (api/client.ts's fetch has no timeout, so a stalled request must not hold the page back).
const CLIMATE_WAIT_MS = 3000;

// Same starter the agent page offers, so this card promises something the agent demonstrably does.
const AGENT_EXAMPLE = 'How has India’s emissions grown compared to other countries?';

// The hero above the fold on a laptop: the landing header, the carousel's control row and the least height the hero is given.
const HEADER_PX = 68;
const CAROUSEL_ROW_PX = 59;
// The hero follows the screen but stays within a band, so a laptop shows the banner, its control row and the top of the next section:
// the viewport less the header, the control row and a peek of the next section, kept between these two heights.
const HERO_MIN_PX = 504;
const HERO_MAX_PX = 560;
const PEEK_PX = 140;
// What the globe slide holds besides the picture (the legend, the one row of controls -- zoom, reset, table, Pause and the year slider -- and the panel's padding), measured.
const GLOBE_SLIDE_EXTRA_PX = 102;
// The smallest globe on a laptop, where the hero is short.
const GLOBE_MIN_PX = 220;
// On a phone both banners are this tall (the picture takes what the text, figures and button leave), so the page does not move when the slide changes.
const HERO_PHONE_PX = 560;
// On a tablet the globe stops here, so the next section shows under the hero.
const TABLET_GLOBE_MAX_PX = 380;

const STYLES = `
.landing { --landing-header: ${HEADER_PX}px; --carousel-row: ${CAROUSEL_ROW_PX}px; --hero-h: clamp(${HERO_MIN_PX}px, calc(100svh - ${HEADER_PX + CAROUSEL_ROW_PX + PEEK_PX}px), ${HERO_MAX_PX}px); --hero-h-phone: ${HERO_PHONE_PX}px; --landing-pad-x: clamp(20px, 5.5vw, 80px); --landing-pad-y: clamp(48px, 6vw, 88px); }
.landing [id$="-heading"] { scroll-margin-top: 84px; }
.landing-slide h1 { text-wrap: balance; }
.landing-h2 { font-size: clamp(1.75rem, 3.2vw, 2.75rem); line-height: 1.1; font-weight: 600; }
/* Both banners of the carousel share one layout, so nothing moves when the slide changes: a text column and a picture column in the same proportion,
   both starting at the same top edge. The lines are the one visible colour of the KPI strip (the divider tokens are lighter than the tinted light-theme background). */
.landing-slide { --climate-banner-line: var(--syn-color-border-emphasis); --climate-banner-line: color-mix(in srgb, var(--syn-color-text-muted) 55%, transparent); }
.landing-slide { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: clamp(32px, 4vw, 56px); align-items: start; padding: clamp(16px, 3vh, 48px) var(--landing-pad-x); }
.landing-hero__text { min-width: 0; display: flex; flex-direction: column; gap: clamp(12px, 2.2vh, 24px); }
.landing-hero__globe { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
/* The globe's own panel fills its column, as the chart's does on the other banner; the picture stays centred in it. */
.landing-hero__globe > figure { width: 100%; container-type: inline-size; }
/* The year and total sit at the card's own left edge (where the legend's name starts), not on the picture's corner, so they stay clear of the sphere and the labels: the picture is centred in the card, so the caption is moved back by the space beside it. */
.landing-globe-caption { transform: translateX(min(0px, calc((var(--globe-size) - 100cqw) / 2))); }
.landing-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.landing-race { display: flex; gap: clamp(32px, 5vw, 80px); align-items: flex-start; }
.landing-race__text { flex: 0 0 min(380px, 34%); }
.landing-race__chart { flex: 1 1 0; min-width: 0; }
@media (min-width: 1101px) {
  .landing-slide { height: 100%; box-sizing: border-box; grid-template-rows: minmax(0, 1fr); padding-top: 24px; padding-bottom: 12px; }
  .climate-banner__chart { align-self: stretch; min-height: 0; }
  /* The text column is as tall as the picture beside it, its parts spread down it, so the buttons end on the picture's bottom edge and no gap opens under the figures. */
  .climate-banner__text, .landing-hero__text { align-self: stretch; justify-content: space-between; }
  /* The figures keep their own height (the strip's rules hug them); what is left of the column goes into the gaps between eyebrow, headline, paragraph and figures. */
  .climate-banner__text .landing-kpi-strip, .landing-hero__text .landing-kpi-strip { flex: 0 0 auto; }
  .climate-banner .climate-scatter { flex: 1 1 0; min-height: 160px; aspect-ratio: auto; max-height: none; }
}
@media (max-width: 1100px) {
  .landing-slide { grid-template-columns: 1fr; }
  .landing-race { flex-direction: column; align-items: stretch; }
  .landing-race__text { flex: none; }
  .landing-grid3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* Tablets: the chart is a band, not a page-high picture, so the next section shows under the hero. */
@media (min-width: 641px) and (max-width: 1100px) {
  .climate-banner .climate-scatter { aspect-ratio: auto; height: 220px; max-height: none; }
}
@media (max-width: 640px) {
  /* One fixed hero height for both banners: the picture takes what the text, figures and button leave. */
  .landing-slide { height: 100%; box-sizing: border-box; grid-template-rows: auto minmax(0, 1fr) auto auto; align-items: stretch; }
    .landing-grid3 { grid-template-columns: 1fr; }
  /* The hero banner on phones: the three KPIs stay in one row, the buttons are full-width and stacked. */
  .landing-hero { gap: 10px; padding-top: 8px; padding-bottom: 8px; }
  /* Tighter vertical rhythm so the globe, its caption and the legend fit above the pill. */
  .landing-hero__text { gap: 8px !important; }
  .landing-hero__globe { gap: 6px; }
  .landing-hero__eyebrow-count { display: none; } /* one line on a phone */
  .landing-hero__text > p { display: none; } /* as in the design frame: the two figure cards below carry the same facts */
  /* Same order as the climate banner: copy, figures, picture, then the buttons (placed after the globe in the markup on a phone, so focus order matches). */
  /* Picture first: the year readout is the globe's caption on one line, then two figure cards, then the buttons. */
  /* The year and total are on the picture's top-left corner, in three short lines (the figures step down with the globe but keep a legible floor). */
  .landing-globe-year { font-size: 20px !important; line-height: 1.1 !important; }
  .landing-globe-total, .landing-globe-all { font-size: 11px !important; line-height: 1.3 !important; }
  .landing-hero__cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .landing-hero__cards > div { padding: 6px 12px; border: 1px solid var(--climate-banner-line); border-radius: 8px; min-width: 0; }
  .landing-hero__card-value { font-size: 1.375rem; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--syn-color-text-primary); }
  .landing-hero__cards .syn-caption { color: var(--syn-color-text-muted); font-size: 12px; line-height: 1.3; }
  .climate-banner .climate-scatter { aspect-ratio: auto; height: auto; flex: 1 1 0; min-height: 90px; max-height: none; }
  .climate-banner__chart { min-height: 0; }
  .landing-hero__ctas { flex-direction: column; align-items: stretch !important; gap: 8px !important; }
  .landing-hero__ctas > a { justify-content: center; }
  .landing-hero__ctas > a.landing-hero__forecasts { display: none; } /* as on Banner 1 and in the design frame: one button; Forecasts is in the menu */
}
`;

// The sections under the hero, in page order, as the carousel's "On this page" links (the chain band is there only with the climate signal).
const PAGE_ANCHORS: PageAnchor[] = [
  { href: '#chain-heading', label: 'Chain reaction' },
  { href: '#stories-heading', label: 'Three stories' },
  { href: '#race-heading', label: 'Top 10 emitters' },
  { href: '#features-heading', label: 'Explore the data' },
];

const cardStyle = {
  padding: 28, borderRadius: 16, background: 'var(--syn-color-surface-raised)',
  border: '1px solid var(--syn-color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 12,
} as const;

const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

// Own component so the ~5s year-steps re-render only the hero, never the stories/race/feature cards.
function Hero({ overview, map, globe, worldAnnualMt, active = true, onHold }: { overview: OverviewResponse; map: WorldMapTimeSeries; globe: WorldMapTimeSeries; worldAnnualMt: ReadonlyArray<number>; active?: boolean; onHold?: (holding: boolean) => void }) {
  // `map` is the 1990-based view the KPIs and "change since" use; `globe` is the longer 1970 series the animation plays.
  const baselineYear = map.years[0];
  const minYear = globe.years[0];
  const maxYear = globe.years[globe.years.length - 1];
  // Autoplay begins when the globe scrolls into view, not on page load (e.g. below the fold on a phone).
  const globeRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const globeInView = useInView(globeRef);
  const { currentYear, isPlaying, toggle, seek } = useYearAnimation({ minYear, maxYear, intervalMs: GLOBE_STEP_MS, stepYears: GLOBE_STEP_YEARS, startWhenVisible: globeRef, enabled: active });
  // The carousel stays on this banner while the years play through; it moves on (after its usual dwell) once they finish or are paused.
  useEffect(() => {
    onHold?.(active && isPlaying);
    return () => onHold?.(false);
  }, [active, isPlaying, onHold]);
  const yearIdx = currentYear - minYear;
  // The globe takes the values of the year in view, by country code; a country with no value (or none above zero) is drawn as no data.
  const valuesForYear = useMemo(
    () => Object.fromEntries(globe.iso_codes.flatMap((code, i) => { const v = globe.values[yearIdx]?.[i]; return v == null || v <= 0 ? [] : [[code, v]]; })) as Record<string, number>,
    [globe, yearIdx],
  );
  const all = overview.all_countries;
  // Size the globe so the slide plus the carousel controls fit above the fold on a laptop: the viewport minus the 68 px
  // header, ~64 px of carousel controls, the section's own padding, the legend and globe controls under the canvas, and the
  // Pause/year-slider row.
  const viewportHeight = useViewportHeight();
  // On a phone the globe takes at most ~62% of the screen height so Play and the slider stay with it.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const roomy = useMediaQuery('(min-width: 1101px)');
  const tablet = useMediaQuery('(min-width: 641px) and (max-width: 1100px)');
  // On a laptop the picture takes what the hero leaves it, so the carousel's control row stays in view: the hero is the viewport less the header and the row (at least the minimum), less the slide's own padding and the other parts of the panel.
  const heroHeight = Math.min(HERO_MAX_PX, Math.max(HERO_MIN_PX, viewportHeight - HEADER_PX - CAROUSEL_ROW_PX - PEEK_PX));
  const slidePad = roomy ? 18 : Math.min(48, Math.max(16, viewportHeight * 0.03));
  const laptopMax = roomy ? Math.max(GLOBE_MIN_PX, Math.min(600, Math.floor(heroHeight - GLOBE_SLIDE_EXTRA_PX - 2 * slidePad))) : Math.max(300, Math.min(tablet ? TABLET_GLOBE_MAX_PX : 600, viewportHeight - 68 - 64 - 56 - 100 - 52));
  // ...and sized to what fits: from where the globe starts on the page down to the stable (toolbars-shown) viewport's bottom, less room for its
  // caption, the legend and the pill, so those sit clear of the pill at rest instead of under it.
  const stableViewportHeight = useStableViewportHeight();
  const [globeTop, setGlobeTop] = useState(0);
  const [belowCanvas, setBelowCanvas] = useState<number | undefined>(undefined);
  const [sectionWidth, setSectionWidth] = useState(Infinity);
  const [sectionTop, setSectionTop] = useState(0);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = globeRef.current?.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return; // 0-size while its slide is hidden: keep the last values
      setGlobeTop(Math.round(r.top + window.scrollY));
      setSectionWidth(section.clientWidth);
      setSectionTop(Math.round(section.getBoundingClientRect().top + window.scrollY));
      // Everything under the canvas down to the slide's end (the Globe's caption, legend and controls, the year row, the figures and the button), measured because the legend wraps more on a narrow phone.
      const fig = globeRef.current?.querySelector('figure');
      if (fig?.firstElementChild) setBelowCanvas(Math.round(section.getBoundingClientRect().bottom - fig.firstElementChild.getBoundingClientRect().bottom));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(section);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [isPhone]);
  const globeMax = isPhone ? phoneGlobeMax({ viewportHeight: stableViewportHeight, top: globeTop, ceiling: laptopMax, below: belowCanvas, width: sectionWidth, bottom: sectionTop > 0 ? sectionTop + HERO_PHONE_PX : undefined }) : laptopMax;
  const totals = useMemo(() => worldTotals(globe), [globe]);
  // Same top-10 share as the ranking-race heading (one shared computation, so the two change together).
  // Of the World total (international aviation and shipping included), like every other share on the site; none if that total is unavailable.
  const topShare = useMemo(() => latestTopShare(map, worldAnnualMt), [map, worldAnnualMt]);
  const yearTotal = totals[yearIdx];
  const globeLabels = useMemo(() => topEmitterLabels(globe, yearIdx, GLOBE_LABEL_COUNT), [globe, yearIdx]);
  // The current year and world total. On wide screens it overlays the globe's top-left corner; on a phone the globe is
  // small and centred, so the overlay would sit on the dark disc (dark text on a dark ocean) -- there it is shown
  // above the globe instead (CSS below swaps which copy is displayed; the hidden one is display:none, so it is not
  // in the accessibility tree twice).
  // `onPanel`: drawn inside the globe's dark data panel (the phone caption), so in the panel's text colours rather than the page's.
  const globeHeading = (onPanel: boolean) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="landing-globe-year" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', color: onPanel ? 'var(--syn-data-ink-light)' : 'var(--syn-color-text-primary)' }}>{currentYear}</span>
        {yearTotal != null && (
          // Two short lines rather than one long one: the overlay sits in the globe box's top-left corner, and
          // "22,899 MtCO₂ · all countries" at this size ran into the disc's edge.
          <>
            <span className="syn-text-lg landing-globe-total" style={{ color: onPanel ? 'var(--syn-data-text)' : 'var(--syn-color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(yearTotal)} MtCO₂</span>
            <span className="syn-caption landing-globe-all" style={{ color: onPanel ? 'var(--syn-data-text)' : 'var(--syn-color-text-secondary)' }}>all countries</span>
          </>
        )}
      </div>
  );

  // On a phone the buttons follow the globe in the markup as well as on screen, so focus and reading order match what is seen.
  const ctas = (
    // Laid out like Banner 1's (the climate signal): the button, then Forecasts as a plain text link with an arrow, centred on the button's row.
    <div className="landing-hero__ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Link to="/overview" className={ctaClass('primary')} style={{ textDecoration: 'none' }}>
        Explore the data
      </Link>
      <Link to="/forecasts" className="landing-hero__forecasts" style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Forecasts to {FORECAST_END_YEAR} →</Link>
    </div>
  );

  // Named for what they move (the years), so they are not read as the carousel's own Pause/Play beside them.
  const yearControls = (
    // In the data panel (dark in both themes), so the readings use its own text colour, not the page's accent.
    <div style={{ display: 'contents', color: 'var(--syn-data-text)', ['--syn-color-accent-text' as string]: 'var(--syn-data-text)' }}>
      {isPhone
        ? <Button variant="ghost" icon={isPlaying ? 'pause' : 'play'} aria-label={isPlaying ? 'Pause years' : 'Play years'} onClick={toggle} />
        : <Button variant="ghost" onClick={toggle}>{isPlaying ? 'Pause years' : 'Play years'}</Button>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Slider label="Year" labelHidden min={minYear} max={maxYear} step={1} value={currentYear} onChange={seek} showValue={false} showRangeLabels={false} />
      </div>
    </div>
  );

  return (
    <section ref={sectionRef} aria-labelledby="landing-title" className="landing-slide landing-hero">
      <div className="landing-hero__text">
        <div className="syn-caption" style={{ letterSpacing: '0.08em', lineHeight: 1.5, textTransform: 'uppercase', color: 'var(--syn-color-accent-text, inherit)' }}>
          Our World in Data CO₂ · {minYear}–{maxYear}<span className="landing-hero__eyebrow-count"> · {all.countries_count} countries</span>
        </div>
        <h1 id="landing-title" style={{ margin: 0, fontSize: 'clamp(1.75rem, min(4.6vw, 6.8vh), 3.75rem)', lineHeight: 1.05, fontWeight: 700 }}>
          Where the world’s CO₂ comes from
        </h1>
        <p className="syn-text-lg" style={{ margin: 0, fontSize: 'clamp(1rem, 1.4vw, 1.125rem)', color: 'var(--syn-color-text-muted)' }}>
          Global CO₂ emissions have {growthPhrase(all.pct_change_since_1990)} since {baselineYear}
          {topShare != null ? `, and the ${RACE_SIZE} largest emitters now account for ${topShare}% of the total.` : '.'}
        </p>
        {/* The figures, then the buttons: the same order as Banner 1 (the climate signal). */}
        {!isPhone && (
          <KpiStrip
            items={[
              { value: fmtInt(all.latest_co2_total), label: `MtCO₂ in ${all.latest_year}, all countries` },
              { value: fmtPct(all.pct_change_since_1990), label: `Change since ${baselineYear}`, color: all.pct_change_since_1990 >= 0 ? NEGATIVE_COLOR : POSITIVE_COLOR },
              { value: String(overview.expanded_countries.countries_count), label: 'Countries in the Expanded set' },
            ]}
          />
        )}
        {!isPhone && ctas}
      </div>

      <div className="landing-hero__globe" ref={globeRef} style={{ ['--globe-size' as string]: `${globeMax}px` }}>
        {/* The year and total are the globe's caption: on the picture's top-left corner on a wide screen, under it and above its legend on a phone. */}
        <Globe
          values={valuesForYear}
          valueLabel="CO₂ (MtCO₂)"
          unit="MtCO₂"
          ariaLabel={`Globe of CO₂ emissions by country in ${currentYear}, log-scaled colour from pale yellow (lowest) to deep red (highest)`}
          // The globe turns whenever it is on screen (and its banner is the showing one: a hidden slide still intersects the viewport), playing or paused (owner decision, 2026-10-06; Pause stops the years, not the turning).
          // Under Reduce Motion it does not turn.
          autoRotate={active && globeInView}
          turnPeriod={GLOBE_TURN_SECONDS}
          size={globeMax}
          compact={!isPhone}
          dense={isPhone}
          // The largest emitters are named throughout, while the years step as well as when they are paused (owner decision, 2026-10-20).
          labels={globeLabels}
          caption={<div className="landing-globe-caption" aria-live="off">{globeHeading(true)}</div>}
          // Pause and the year slider are in the panel, in the zoom row, and the keys' hint is left to a screen reader (a touch screen has no use for it drawn).
          controls={yearControls}
          hintVisibility="sr-only"
        />
        {/* The year is announced only when playback is paused or the slider is moved by hand (which pauses), never while it plays: the caption below changes every frame and is deliberately not a live region. */}
        <span role="status" style={VISUALLY_HIDDEN}>{!isPlaying && yearTotal != null ? `${currentYear}: ${fmtInt(yearTotal)} MtCO₂, all countries` : ''}</span>
      </div>
      {isPhone && (
        <div className="landing-hero__cards">
          <div><div className="landing-hero__card-value" style={{ color: all.pct_change_since_1990 >= 0 ? NEGATIVE_COLOR : POSITIVE_COLOR }}>{fmtPct(all.pct_change_since_1990)}</div><div className="syn-caption">{`Global CO₂ since ${baselineYear}`}</div></div>
          {topShare != null && <div><div className="landing-hero__card-value">{topShare}%</div><div className="syn-caption">{`From the top ${RACE_SIZE} emitters, ${all.latest_year}`}</div></div>}
        </div>
      )}
      {isPhone && ctas}
    </section>
  );
}

// `to`/`cta` take the story's country: the first two links deep-link (?country= / ?countries=, see
// useCountrySelection) so the card's promise -- "Open China's profile" -- is what actually opens.
// The last has no country parameter: the Overview's % Change chart covers the *selected* countries,
// and one country isn't a comparison.
const STORY_COPY: Record<Story['kind'], { kicker: string; text: (n: number, since: number) => string; cta: (c: string) => string; to: (c: string) => string }> = {
  'largest-rise': { kicker: 'largest absolute rise', text: (n, since) => `MtCO₂ added since ${since}, the largest increase of any top-${n} emitter.`, cta: (c) => `Open ${c}’s profile`, to: (c) => `/country-profile?country=${encodeURIComponent(c)}` },
  'fastest-growth': { kicker: 'fastest growth', text: (n, since) => `The fastest percentage growth among the top-${n} emitters since ${since}.`, cta: (c) => `See ${c} in Historical Trends`, to: (c) => `/historical?countries=${encodeURIComponent(c)}` },
  'steepest-decline': { kicker: 'steepest decline', text: (n, since) => `The steepest cut among the top-${n} emitters since ${since}.`, cta: () => 'See % change on the Overview', to: () => '/overview#pct-change' },
};

function StoryCard({ story, topN, firstYear, lastYear }: { story: Story; topN: number; firstYear: number; lastYear: number }) {
  const copy = STORY_COPY[story.kind];
  const color = story.sentiment === 'increase' ? NEGATIVE_COLOR : POSITIVE_COLOR;
  const path = sparklinePath(story.series);
  return (
    <article style={{ ...cardStyle, padding: 32, gap: 16 }}>
      <div className="syn-caption" style={{ letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--syn-color-text-muted)' }}>
        {story.country} · {copy.kicker}
      </div>
      <div style={{ fontSize: 'clamp(2rem, 3.4vw, 3rem)', fontWeight: 600, lineHeight: 1.15, color, fontVariantNumeric: 'tabular-nums' }}>{story.headline}</div>
      <div className="syn-text-lg">{copy.text(topN, firstYear)}</div>
      {path && (
        <svg width="100%" height="64" viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label={`${story.country} CO₂ emissions, ${firstYear} to ${lastYear}`}>
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {story.from != null && story.to != null && (
        <div className="syn-caption" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--syn-color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          <span>{firstYear} · {fmtInt(story.from)}</span>
          <span>{lastYear} · {fmtInt(story.to)}</span>
        </div>
      )}
      <Link to={copy.to(story.country)} style={{ fontWeight: 600, color: 'var(--syn-color-accent-text, inherit)' }}>{copy.cta(story.country)} →</Link>
    </article>
  );
}

function Stories({ overview, map }: { overview: OverviewResponse; map: WorldMapTimeSeries }) {
  const stories = useMemo(() => pickStories(overview.headline_movers, map), [overview.headline_movers, map]);
  if (stories.length === 0) return null;
  const firstYear = map.years[0];
  const lastYear = map.years[map.years.length - 1];
  const topN = overview.headline_movers.length;
  return (
    <section aria-labelledby="stories-heading" style={{ padding: 'var(--landing-pad-y) var(--landing-pad-x)', background: 'var(--syn-color-surface-raised)', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 id="stories-heading" className="landing-h2" style={{ margin: 0 }}>
          {stories.length === 3 ? 'Three' : stories.length === 2 ? 'Two' : 'One'} {stories.length === 1 ? 'story' : 'stories'} in {map.years.length} years of data
        </h2>
        <p className="syn-text-lg" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }}>
          Among the {topN} largest emitters of {lastYear}, {firstYear} → {lastYear}.
        </p>
      </div>
      <div className="landing-grid3">
        {stories.map((s) => <StoryCard key={s.kind} story={s} topN={topN} firstYear={firstYear} lastYear={lastYear} />)}
      </div>
    </section>
  );
}

function featureText(id: string, overview: OverviewResponse, map: WorldMapTimeSeries): string {
  const first = map.years[0];
  const last = map.years[map.years.length - 1];
  const expanded = overview.expanded_countries.countries_count;
  switch (id) {
    case 'overview': return `World map, the three-tier summary and a ${MAX_SELECTED_COUNTRIES}-country picker driving the By Country and % Change charts.`;
    case 'historical': return `Compare up to ${MAX_SELECTED_COUNTRIES} countries across ${first}–${last}, with gas composition by decade.`;
    case 'country-profile': return 'Total, per-capita and year-on-year CO₂ for one country, with key statistics.';
    case 'data-explorer': return 'Browse and filter the underlying dataset, with summary statistics.';
    case 'climate-correlation': return 'Emissions, atmospheric CO₂ and global temperature side by side: how they move together over time, shown as context rather than a climate model.';
    case 'forecasts': return `ETS(A,Ad,N) forecasts to ${FORECAST_END_YEAR} for all ${expanded} Expanded countries, with 95% confidence bands, benchmarked against Linear Regression and Random Forest.`;
    case 'scenarios': return `BAU, Moderate and Aggressive pathways to ${SCENARIO_END_YEAR}, with cumulative ${SCENARIO_START_YEAR}–${SCENARIO_END_YEAR} totals.`;
    default: return '';
  }
}

function Features({ overview, map }: { overview: OverviewResponse; map: WorldMapTimeSeries }) {
  // The About page isn't a feature; every other nav entry is.
  const items = NAV_ITEMS.filter((item) => item.group);
  return (
    <section aria-labelledby="features-heading" style={{ padding: 'var(--landing-pad-y) var(--landing-pad-x)', background: 'var(--syn-color-surface-raised)', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <h2 id="features-heading" className="landing-h2" style={{ margin: 0 }}>Everything you need to read the trend</h2>
      <div className="landing-grid3">
        {items.map((item) => (
          <Link key={item.id} to={item.path} style={{ ...cardStyle, background: 'var(--syn-color-surface-base)', color: 'inherit', textDecoration: 'none' }}>
            <div className="syn-caption" style={{ letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--syn-color-text-muted)' }}>{item.group}</div>
            <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>{item.label}</div>
            <div className="syn-text-lg">{featureText(item.id, overview, map)}</div>
          </Link>
        ))}
      </div>
      <Link to="/ask" style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 20, background: 'var(--syn-color-surface-base)', color: 'inherit', textDecoration: 'none' }}>
        <Icon name="sparkle" size="large" />
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>Ask the Agent</div>
          <div className="syn-text-lg">“{AGENT_EXAMPLE}” — answered with charts from the same API the dashboard uses.</div>
        </div>
        <span style={{ fontWeight: 600, color: 'var(--syn-color-accent-text, inherit)' }}>Ask a question →</span>
      </Link>
    </section>
  );
}

function BuiltOn() {
  return (
    <section aria-label="Built on" style={{ padding: '40px var(--landing-pad-x)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 48px', borderTop: '1px solid var(--syn-color-border-subtle)', borderBottom: '1px solid var(--syn-color-border-subtle)' }}>
      <div className="syn-caption" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--syn-color-text-muted)' }}>Built on</div>
      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 40px', listStyle: 'none', margin: 0, padding: 0 }}>
        {['Our World in Data · CO₂', 'Linear Regression', 'Random Forest', 'ETS(A,Ad,N)', 'MCP agent tools'].map((t) => <li key={t} className="syn-text-lg">{t}</li>)}
      </ul>
    </section>
  );
}

function ClosingCta({ expandedCount }: { expandedCount: number }) {
  return (
    <section aria-labelledby="cta-heading" style={{ padding: 'var(--landing-pad-y) var(--landing-pad-x)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 24 }}>
      <h2 id="cta-heading" className="landing-h2" style={{ margin: 0, maxWidth: 900 }}>Pick a country. See where it’s heading.</h2>
      <p className="syn-text-lg" style={{ margin: 0, maxWidth: 600, color: 'var(--syn-color-text-muted)' }}>
        Start on the Overview, drill into any of the {expandedCount} Expanded countries, and compare forecasts to {FORECAST_END_YEAR} and scenarios to {SCENARIO_END_YEAR}.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/overview" className={ctaClass('primary')} style={{ textDecoration: 'none' }}>Open the Overview</Link>
        <Link to="/about" className={ctaClass('secondary')} style={{ textDecoration: 'none' }}>Methods &amp; data</Link>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const overview = useAsync(() => api.overview(), []);
  // One request, for the globe's longer range; the 1990-based view the rest of the page uses is sliced from it.
  const globeQuery = useAsync(() => api.worldMapSeries(GLOBE_START_YEAR), []);
  const globe = globeQuery.data;
  const map = useMemo(() => (globe ? sliceMapSeries(globe, BASELINE_YEAR) : null), [globe]);
  // The World total per year (Mt) the "N% of the world's CO₂" shares divide by: from the remainder the share endpoint publishes beside any series (one country keeps it small).
  // Aligned to the map's years; a year without a total is NaN, so its share is left out rather than shown against the sum of the countries.
  const worldQuery = useAsync(() => api.correlationCountryShare({ countries: ['USA'], startYear: BASELINE_YEAR }), []);
  const worldAnnualMt = useMemo(() => {
    const totals = worldTotalsFrom(worldQuery.data);
    return map ? map.years.map((y) => totals?.annualMt.get(y) ?? NaN) : [];
  }, [worldQuery.data, map]);
  // The climate-signal banner (Area 2) is additive: if any of its three series is missing or fails to load, the page is
  // the existing hero on its own -- never a banner with zeros or gaps. Waited for (settled either way) before the hero
  // mounts, so the hero never remounts -- and the globe never restarts -- when the carousel appears.
  const climate = useAsync(async () => {
    const [pair, temperature, concentration] = await Promise.all([
      api.correlationEmissionsTemperature(),
      api.correlationTemperature({ baseline: '1850_1900' }),
      api.correlationConcentration(),
    ]);
    return buildClimateSignal(pair, temperature, concentration);
  }, []);
  const coreReady = Boolean(overview.data && globe);
  const [climateGaveUp, setClimateGaveUp] = useState(false);
  useEffect(() => {
    if (!coreReady || !climate.loading) return;
    const id = setTimeout(() => setClimateGaveUp(true), CLIMATE_WAIT_MS);
    return () => clearTimeout(id);
  }, [coreReady, climate.loading]);
  const error = overview.error ?? globeQuery.error;
  const ready = coreReady && (!climate.loading || climateGaveUp);
  // Once given up on, a late answer is ignored for good: adding the carousel then would remount the hero and restart the globe.
  const signal = climateGaveUp ? null : climate.data;

  return (
    <div className="landing">
      <style>{STYLES + KPI_STRIP_STYLES + CAROUSEL_STYLES + CLIMATE_BANNER_STYLES}</style>
      {ready ? (
        <>
          {signal ? (
            <HeroCarousel
              anchors={PAGE_ANCHORS}
              slides={[
                { id: 'climate-signal', label: 'Climate signal', render: () => <ClimateSignalBanner signal={signal} headingId="climate-signal-title" /> },
                { id: 'where-co2-comes-from', label: 'Where CO₂ comes from', render: (active, hold) => <Hero overview={overview.data!} map={map!} globe={globe!} worldAnnualMt={worldAnnualMt} active={active} onHold={hold} /> },
              ]}
            />
          ) : (
            <Hero overview={overview.data!} map={map!} globe={globe!} worldAnnualMt={worldAnnualMt} />
          )}
          {signal && (
            <ChainBand
              signal={signal}
              emissions={{
                year: overview.data!.all_countries.latest_year,
                total: overview.data!.all_countries.latest_co2_total,
                // Annual world totals over the globe's whole range, from the same series the globe plays.
                series: worldTotals(globe!).map((value, i) => ({ year: globe!.years[i], value })),
              }}
            />
          )}
          <Stories overview={overview.data!} map={map!} />
          <RankRace series={map!} worldTotals={worldAnnualMt} expandedCount={overview.data!.expanded_countries.countries_count} />
          <Features overview={overview.data!} map={map!} />
          <BuiltOn />
          <ClosingCta expandedCount={overview.data!.expanded_countries.countries_count} />
        </>
      ) : (
        // The headline and the way in stay put while (or if) the data can't load -- the page is
        // never blank, and the CTAs still reach the dashboard.
        <section aria-labelledby="landing-title" style={{ padding: 'clamp(32px, 4vw, 56px) var(--landing-pad-x)', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800 }}>
          <h1 id="landing-title" style={{ margin: 0, fontSize: 'clamp(2.25rem, 4.6vw, 3.75rem)', lineHeight: 1.05, fontWeight: 700 }}>
            Where the world’s CO₂ comes from
          </h1>
          {error ? (
            <InlineAlert variant="error">{error}</InlineAlert>
          ) : (
            <p className="syn-text-lg" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }} role="status">Loading the latest data…</p>
          )}
          <div>
            <Link to="/overview" className={ctaClass('primary')} style={{ textDecoration: 'none' }}>Explore the data</Link>
          </div>
        </section>
      )}
    </div>
  );
}
