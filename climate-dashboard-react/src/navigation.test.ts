import { describe, expect, it } from 'vitest';
import { FOOTER_COPYRIGHT, LANDING_TITLE, NAV_ITEMS, PRODUCT_NAME, RAIL_PRODUCT_NAME, TAGLINE, TAGLINE_HEADING } from './navigation';

describe('navigation', () => {
  it('names the product the same everywhere, and keeps the tagline out of the rail', () => {
    expect(PRODUCT_NAME).toBe('Degrees of Carbon');
    expect(RAIL_PRODUCT_NAME).toBe(PRODUCT_NAME);
    expect(LANDING_TITLE).toBe('Degrees of Carbon: how emissions add up to warming');
    expect(FOOTER_COPYRIGHT).toBe('Degrees of Carbon · A Syena project · Sauparna Sarkar');
    expect(TAGLINE).toBe('How emissions add up to warming.');
    expect(TAGLINE_HEADING).toBe('How emissions add up to warming');
    expect(RAIL_PRODUCT_NAME).not.toContain(TAGLINE);
  });

  it('puts no badge on a rail item: a badge wraps the label in the expanded rail', () => {
    expect(NAV_ITEMS.filter((item) => item.badge)).toEqual([]);
  });
});
