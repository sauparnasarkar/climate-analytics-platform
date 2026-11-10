import { useSeriesColour } from '@syena/ds';
import type { PathwayName } from './pathways';

/**
 * The design-system categorical slot of every scenario and gas series (SPEC.md §5.34): one place, so a chart line, its key, its card accent and the
 * share bar are the same colour. Every series on these charts passes its slot; none is left to take its list position, which collides with a pinned one.
 *
 * The pathways are dashed, and only slots 1-4 are validated as thin dashed lines, so they sit in 2-4 and Observed keeps 1. The 5-year mean is a
 * plain solid line in slot 5, which the design system validates for that use. A slot's meaning holds within one chart, its key and its cards, not
 * across the site: CO₂ shares Observed's colour and CH₄ shares BAU's.
 */
export const OBSERVED_SLOT = 1;
export const ANCHOR_SLOT = OBSERVED_SLOT;
export const MEAN_5Y_SLOT = 5;
export const PATHWAY_SLOT: Record<PathwayName, number> = { BAU: 2, Moderate: 3, Aggressive: 4 };
export const GAS_SLOT: Record<string, number> = { co2: 1, ch4: 2, n2o: 3, fgas: 4 };

/** A gas the API adds that has no slot of its own takes the next one after the four, by its position, so it never shares a colour on the chart. */
export const gasSlot = (id: string, index: number): number => GAS_SLOT[id] ?? Object.keys(GAS_SLOT).length + 1 + index;

export const pathwaySlot = (name: string): number | undefined => (PATHWAY_SLOT as Record<string, number>)[name];

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * The colour of each slot as the chart draws it, for the theme in force (`useSeriesColour`, read once per slot in a fixed order, so it is a valid
 * hook call). Returns the colour of a slot, or undefined before the theme has mounted.
 */
export function useSlotColours(): (slot: number | undefined) => string | undefined {
  const colours = SLOTS.map((s) => useSeriesColour(s)); // eslint-disable-line react-hooks/rules-of-hooks -- a fixed list, the same calls every render
  return (slot) => (slot !== undefined && slot >= 1 && slot <= SLOTS.length ? colours[slot - 1] ?? undefined : undefined);
}
