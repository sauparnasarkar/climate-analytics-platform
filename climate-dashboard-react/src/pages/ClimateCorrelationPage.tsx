import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { InlineAlert, JumpLinks, Spinner, useReducedMotion } from '@syena/ds';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { CausalChain } from '../components/module/CausalChain';
import { GasComposition } from '../components/module/GasComposition';
import { useStickyBarHeight } from '../hooks/useStickyBarHeight';
import { PageChrome } from '../layouts/PageChrome';
import { AnchorScroll, StickyAnchorRow } from '../components/StickyAnchorRow';
import { MethodNote } from '../components/MethodNote';
import { AllGasRelationship } from '../components/module/AllGasRelationship';
import { HeadlineRelationship } from '../components/module/HeadlineRelationship';
import { useAsync } from '../hooks/useAsync';
import { useClimateSignal } from '../hooks/useClimateSignal';
import { useElementHeight } from '../hooks/useElementHeight';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import { CAUSAL_CHAIN_ANCHOR, GLOBAL_RELATIONSHIP_ANCHOR, NOT_A_CLIMATE_MODEL } from '../lib/climateCopy';
import { ALL_GAS_START_YEAR, buildAllGas } from '../lib/allGas';
import { ALL_GAS_ANCHOR } from '../lib/allGas';
import { GAS_COMPOSITION_ANCHOR } from '../lib/gasComposition';
import { buildComposition } from '../lib/gasComposition';
import { buildHeadline } from '../lib/headline';
import { METHODS_ANCHORS } from '../lib/methodology';
import { latestWorldTotal } from '../lib/mapSeries';
import { CLIMATE_SERIES_START_YEAR } from '../constants';

/** The id of the closing method note, so the jump row can reach it. */
const METHOD_NOTE_ID = 'method';
const JUMP_ROW_PX = 52;
const JUMP_ROW_GAP_PX = 10;

const CHAIN_JUMP: JumpLinkItem = { id: CAUSAL_CHAIN_ANCHOR, label: 'Causal chain' };
const RELATIONSHIP_JUMP: JumpLinkItem = { id: GLOBAL_RELATIONSHIP_ANCHOR, label: 'Global relationship' };
const ALL_GAS_JUMP: JumpLinkItem = { id: ALL_GAS_ANCHOR, label: 'All-gas, 1970 on' };
const COMPOSITION_JUMP: JumpLinkItem = { id: GAS_COMPOSITION_ANCHOR, label: 'Gas composition' };
const METHOD_JUMP: JumpLinkItem = { id: METHOD_NOTE_ID, label: 'Method' };

/**
 * The Temperature & GHG Correlation module (Area 2, Phases 2.4 and 2.5). 7a: the causal chain and the headline
 * relationship. Descriptive throughout: correlation as context, never proof of cause. If the climate data is unavailable the module says so once and
 * shows no chain or relationship -- never zeros.
 */
export default function ClimateCorrelationPage() {
  const climate = useClimateSignal();
  const fossil = useAsync(async () => api.correlationEmissionsTemperature({ variant: 'fossil' }), []);
  const allGasQuery = useAsync(async () => api.correlationEmissionsTemperature({ source: 'primap_ghg' }), []);
  const compositionQuery = useAsync(async () => api.correlationGhgComposition({ startYear: ALL_GAS_START_YEAR }), []);
  const world = useAsync(async () => api.worldMapSeries(CLIMATE_SERIES_START_YEAR), []);
  const reduceMotion = useReducedMotion();
  const [stickyRow, setStickyRow] = useState<HTMLElement | null>(null);
  const stickyHeight = useElementHeight(stickyRow);
  const barHeight = useStickyBarHeight();
  const jumpRowPx = stickyHeight ? Math.ceil(stickyHeight) + JUMP_ROW_GAP_PX : JUMP_ROW_PX;

  const signal = climate.signal;
  // The latest year that has data: an all-null final row is missing, not a world total of zero.
  const emissions = useMemo(() => (world.data ? latestWorldTotal(world.data) : null), [world.data]);
  const allGas = useMemo(() => buildAllGas(allGasQuery.data), [allGasQuery.data]);
  const composition = useMemo(() => buildComposition(compositionQuery.data), [compositionQuery.data]);
  const headline = useMemo(() => (signal ? buildHeadline(signal, fossil.data) : null), [signal, fossil.data]);

  // A deep link waits for the first measurement of the anchor row (its height depends on whether it wrapped) and for everything ABOVE its target to settle:
  // a section that loads late grows above the target and pushes it down, so jumping earlier lands short.
  // The chain waits for the climate signal. Everything below it also waits for the fossil comparison (it changes the headline's height) and the world total (it fills in the
  // chain's emissions figure); all-gas, composition and the method note, which sit lower still, wait for those two sections as well.
  const { hash } = useLocation();
  const headSettled = climate.done && !fossil.loading && !world.loading;
  const targetReady =
    hash === `#${ALL_GAS_ANCHOR}` || hash === `#${GAS_COMPOSITION_ANCHOR}` || hash === `#${METHOD_NOTE_ID}` ? headSettled && !allGasQuery.loading && !compositionQuery.loading
    : hash === `#${GLOBAL_RELATIONSHIP_ANCHOR}` ? headSettled
    : climate.done;
  useJumpToHashOnLoad(targetReady && stickyHeight !== null, reduceMotion);
  const jumpItems = [...(signal ? [CHAIN_JUMP, RELATIONSHIP_JUMP] : []), ...(allGas ? [ALL_GAS_JUMP] : []), ...(composition ? [COMPOSITION_JUMP] : []), METHOD_JUMP];

  const activeJumpId = useScrollSpy(jumpItems.map((i) => i.id), barHeight + jumpRowPx);

  return (
    <div className="climate-module">
      <style>{`.climate-module [id] { scroll-margin-top: ${barHeight + jumpRowPx}px; }`}</style>
      <PageChrome
        title="Climate Correlation"
        purpose="Emissions raise atmospheric CO₂, which traps heat and warms the planet. This reads that chain from observations: descriptive, with correlation shown as context, not as proof of cause."
      />
      <StickyAnchorRow innerRef={setStickyRow}>
        <div className="area2-anchor-line">
          <AnchorScroll>
            <JumpLinks items={jumpItems} activeId={activeJumpId} />
          </AnchorScroll>
        </div>
      </StickyAnchorRow>
      {!climate.settled ? (
        <Spinner label="Loading…" />
      ) : !signal || !headline ? (
        <InlineAlert variant="error">{`The climate data is unavailable right now, so the chain and the relationship are not shown. ${NOT_A_CLIMATE_MODEL}`}</InlineAlert>
      ) : (
        <>
          <CausalChain signal={signal} emissions={emissions} />
          <HeadlineRelationship signal={signal} headline={headline} hasAllGas={allGas !== null} />
        </>
      )}
      {/* The sections below load on their own requests: one failing leaves the others standing. Without the headline they sit under a heading of their own. */}
      {!headline && (allGas || composition) && <h2 className="syn-title-md" style={{ margin: '0 0 12px' }}>Global relationship</h2>}
      {allGas && <AllGasRelationship allGas={allGas} />}
      {composition && <GasComposition composition={composition} />}
      <MethodNote id={METHOD_NOTE_ID} anchor={METHODS_ANCHORS.correlation}>
        The slope regresses the Berkeley Earth temperature anomaly on cumulative total anthropogenic CO₂ (OWID / Global Carbon Project) with Newey–West intervals; it is an analogue of the IPCC&apos;s TCRE, not a climate model.
        Sources, baselines and the seven-step derivation are on Methods &amp; data.
      </MethodNote>
    </div>
  );
}
