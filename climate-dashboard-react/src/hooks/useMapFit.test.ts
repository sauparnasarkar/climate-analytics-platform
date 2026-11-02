import { describe, expect, it } from 'vitest';
import { MIN_MAP_PX, NO_FIT, RIGHT_COLUMN_MIN_PX, fitMap, type FitInputs } from './useMapFit';

// A 2.3:1 picture; the card spends 320px of height and 48px of width on everything but the picture.
const BASE: FitInputs = { viewportW: 1440, viewportH: 789, stickyOffset: 190, gridWidth: 1120, chromeH: 320, chromeW: 48, aspect: 2.3 };

describe('fitMap', () => {
  it('makes the picture as wide as the window\'s height allows, and the card that much plus its chrome', () => {
    // (789 − 190 − 12 − 320) × 2.3 = 614
    expect(fitMap(BASE)).toEqual({ mapWidth: 614, cardWidth: 662 });
  });

  it('leaves the layout as it was where the height is not the limit', () => {
    expect(fitMap({ ...BASE, viewportH: 1400 })).toEqual(NO_FIT);
  });

  it('never makes the picture narrower than the minimum, so the card may scroll below it', () => {
    expect(fitMap({ ...BASE, viewportH: 500 }).mapWidth).toBe(MIN_MAP_PX);
  });

  it('keeps the right column its minimum: the card can take no more than the grid less the gap and that', () => {
    // a narrow grid: two thirds of it would crowd the right column, so the card stops short of that
    const narrow = fitMap({ ...BASE, viewportH: 1000, aspect: 4, gridWidth: 800 });
    expect(narrow.cardWidth).toBeLessThanOrEqual(800 - 16 - RIGHT_COLUMN_MIN_PX);
  });

  it('is off below 1024px (phone and tablet in portrait are unchanged)', () => {
    expect(fitMap({ ...BASE, viewportW: 1023, viewportH: 600 })).toEqual(NO_FIT);
    expect(fitMap({ ...BASE, viewportW: 820, viewportH: 600 })).toEqual(NO_FIT);
  });

  it('in the single column (up to 1400px wide) lets the picture use the whole column but still follows the height', () => {
    const fit = fitMap({ ...BASE, viewportW: 1366, gridWidth: 1280, viewportH: 800 });
    expect(fit.mapWidth).toBe(Math.round((800 - 190 - 12 - 320) * 2.3));
    expect(fit.cardWidth).toBe(fit.mapWidth! + 48);
  });

  it('is off before the picture has been measured', () => {
    expect(fitMap({ ...BASE, aspect: 0 })).toEqual(NO_FIT);
    expect(fitMap({ ...BASE, gridWidth: 0 })).toEqual(NO_FIT);
  });
});
