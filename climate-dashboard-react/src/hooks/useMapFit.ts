import { useEffect, useState } from 'react';

/** The map card is sized to the screen from this width up (below it, the map simply fills its column and the page scrolls, as on a phone or a tablet in portrait). */
export const FIT_MIN_VIEWPORT_PX = 1024;
/** The page's two-column hero is only used above this viewport width (the grid's own breakpoint); below it the card spans the page. */
export const TWO_COLUMN_MIN_VIEWPORT_PX = 1401;
/** The narrowest the map is made on purpose: below this the card may scroll. */
export const MIN_MAP_PX = 560;
/** The right column keeps at least this much beside the card. */
export const RIGHT_COLUMN_MIN_PX = 340;
const GRID_GAP_PX = 16;
/** Room kept under the card, so its foot is not flush with the bottom edge. */
const BOTTOM_ROOM_PX = 12;

export interface MapFit {
  /** The map's width in px when the screen's height is what limits it; null when the column's width does (the map then fills it, as before) */
  mapWidth: number | null;
  /** The card's width in px with that map (the left grid track); null with `mapWidth` */
  cardWidth: number | null;
}

export const NO_FIT: MapFit = { mapWidth: null, cardWidth: null };

export interface FitInputs {
  viewportW: number;
  viewportH: number;
  /** The bars pinned to the top of the page: the shell's bar and the jump row under it */
  stickyOffset: number;
  gridWidth: number;
  /** The card's height less the picture's, and its width less the picture's: what the card spends on everything else */
  chromeH: number;
  chromeW: number;
  /** The picture's width over its height */
  aspect: number;
}

/**
 * Height-driven size for the Overview's map: the picture is as wide as the screen's height allows (the card, with its header, controls and legend, fits between the pinned
 * bars and the bottom of the window), no wider than its column and no narrower than MIN_MAP_PX (below which the card may scroll). Returns NO_FIT where the height is not the
 * limit, so the layout stays as it was.
 */
export function fitMap({ viewportW, viewportH, stickyOffset, gridWidth, chromeH, chromeW, aspect }: FitInputs): MapFit {
  if (viewportW < FIT_MIN_VIEWPORT_PX || !(aspect > 0) || !(gridWidth > 0)) return NO_FIT;
  const twoColumn = viewportW >= TWO_COLUMN_MIN_VIEWPORT_PX;
  const maxCard = twoColumn ? gridWidth - GRID_GAP_PX - RIGHT_COLUMN_MIN_PX : gridWidth;
  const maxMap = maxCard - chromeW;
  const heightMap = (viewportH - stickyOffset - BOTTOM_ROOM_PX - chromeH) * aspect;
  // Where the column would give the map at least this much, the screen's height is not what limits it.
  const natural = twoColumn ? ((gridWidth - GRID_GAP_PX) * 2) / 3 - chromeW : gridWidth - chromeW;
  const mapWidth = Math.round(Math.min(maxMap, Math.max(Math.min(MIN_MAP_PX, maxMap), heightMap)));
  if (mapWidth >= natural - 1) return NO_FIT;
  return { mapWidth, cardWidth: mapWidth + chromeW };
}

/**
 * Measures the Overview's map card and returns how wide to make its picture so the whole card fits the window (see `fitMap`). Recomputed on resize and when the card's
 * parts change size; settles in a step or two (the legend can change its number of rows with the width, so a result that would flip back and forth keeps the smaller map).
 */
export function useMapFit(grid: HTMLElement | null, stickyOffset: number): MapFit {
  const [fit, setFit] = useState<MapFit>(NO_FIT);
  useEffect(() => {
    if (!grid || typeof ResizeObserver === 'undefined') return undefined;
    const history: number[] = [];
    const measure = () => {
      const card = grid.querySelector<HTMLElement>('.overview-map-card');
      const canvas = card?.querySelector<HTMLCanvasElement>('canvas');
      const cardBox = card?.getBoundingClientRect();
      const box = canvas?.getBoundingClientRect();
      // The table view hides the picture: keep what was last worked out.
      if (!card || !canvas || !cardBox || !box || box.height < 1 || box.width < 1) return;
      const next = fitMap({
        viewportW: window.innerWidth, viewportH: window.innerHeight, stickyOffset, gridWidth: grid.getBoundingClientRect().width,
        chromeH: cardBox.height - box.height, chromeW: cardBox.width - box.width, aspect: box.width / box.height,
      });
      // A→B→A: the legend changed its rows with the width and the sizes chase each other; stop at the smaller.
      const w = next.mapWidth ?? -1;
      history.push(w);
      if (history.length > 3) history.shift();
      if (history.length === 3 && history[0] === history[2] && history[0] !== history[1]) {
        const keep = history[0] === -1 ? history[1] : history[1] === -1 ? history[0] : Math.min(history[0], history[1]);
        setFit(keep === -1 ? NO_FIT : { mapWidth: keep, cardWidth: keep + (cardBox.width - box.width) });
        return;
      }
      setFit((prev) => (prev.mapWidth === next.mapWidth && prev.cardWidth === next.cardWidth ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    const card = grid.querySelector('.overview-map-card');
    if (card) ro.observe(card);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [grid, stickyOffset]);
  return fit;
}
