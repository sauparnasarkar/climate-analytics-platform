import { useCallback, useEffect, useState } from 'react';
import { JumpLinks } from '@syena/ds';
import type { JumpLinkItem } from '@syena/ds';

import { useElementHeight } from '../hooks/useElementHeight';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useStickyBarHeight } from '../hooks/useStickyBarHeight';
import { AnchorScroll, StickyAnchorRow } from './StickyAnchorRow';

const JUMP_ROW_PX = 52; // the row's height plus a gap on one line, until it has been measured
const JUMP_ROW_GAP_PX = 10;

/** The page's jump links, pinned under the app header while the page scrolls (as on Overview and Climate Correlation), with the current section underlined as the reader scrolls.
 * Also makes jump targets (every id but the shared #content) clear the header and this row (`scroll-margin-top`), for as long as the page is mounted. */
/** Whether the pinned row has been measured, for gating a deep link's one-shot jump: until then the offset is a one-line guess, wrong where the row wraps. Pass `onReady` to StickyJumpLinks. */
export function useStickyRowReady() {
  const [rowReady, setRowReady] = useState(false);
  const onRowReady = useCallback(() => setRowReady(true), []);
  return { rowReady, onRowReady };
}

export function StickyJumpLinks({ items, onReady }: { items: JumpLinkItem[]; onReady?: () => void }) {
  const [row, setRow] = useState<HTMLElement | null>(null);
  const rowHeight = useElementHeight(row);
  const barHeight = useStickyBarHeight();
  const offset = barHeight + (rowHeight ? Math.ceil(rowHeight) + JUMP_ROW_GAP_PX : JUMP_ROW_PX);
  useEffect(() => { if (rowHeight !== null) onReady?.(); }, [rowHeight, onReady]);
  const activeId = useScrollSpy(items.map((i) => i.id), offset);
  return (
    <StickyAnchorRow innerRef={setRow}>
      {/* Not #content: BackToTop and the skip link land there. */}
      <style>{`[id]:not(#content) { scroll-margin-top: ${offset}px; }`}</style>
      <div className="area2-anchor-line">
        <AnchorScroll>
          <JumpLinks items={items} activeId={activeId} />
        </AnchorScroll>
      </div>
    </StickyAnchorRow>
  );
}
