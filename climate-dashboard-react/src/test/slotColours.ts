/** A fixed, valid colour per design-system slot, for tests that stub `useSeriesColour`: jsdom cannot resolve the theme's custom properties, so the
 * real hook returns nothing there. A test then checks which slot a key or accent took (`SLOT_HEX[n]`); the colours themselves are checked live. */
export const SLOT_HEX: Record<number, string> = { 1: '#000001', 2: '#000002', 3: '#000003', 4: '#000004', 5: '#000005', 6: '#000006', 7: '#000007', 8: '#000008' };
export const stubSeriesColour = (slot: number): string | null => SLOT_HEX[slot] ?? null;
