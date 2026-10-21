import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClimateSignal } from '../../lib/climateSignal';
import { RelationshipSection } from './RelationshipSection';

vi.mock('@syena/ds', async (importOriginal) => ({ ...(await importOriginal<object>()), Chart: () => null }));
vi.mock('../landing/ClimateScatter', () => ({ ClimateScatter: () => null, ScatterLegend: () => null }));

const signal: ClimateSignal = {
  points: [{ year: 1990, gt: 1, temp: 0.4, era: 'recent' } as never, { year: 2000, gt: 2, temp: 0.5, era: 'recent' } as never],
  fit: { slope: 0.5, ciLow: 0.4, ciHigh: 0.6, rSquared: 0.9, unit: '°C per 1,000 GtCO₂', start: 1990, end: 2000, nYears: 2 },
  line: { x0: 1, y0: 0.4, x1: 2, y1: 0.5 },
  temperature: { value: 1.2, year: 2024 },
  concentration: { value: 420.1, year: 2024 },
  series: { concentration: [{ year: 2024, value: 420.1 }], temperature: [{ year: 1990, value: 0.4 }, { year: 2024, value: 1.2 }] },
  spliceYear: null, ppm1850: null, omittedYears: [], vintageCaveat: null,
};
const series = [{ year: 1990, value: 22000 }, { year: 2000, value: 25000 }];

describe('RelationshipSection layout', () => {
  it('lets its columns shrink below their content width at every width, so a wide child cannot push the page sideways', () => {
    const { container } = render(<MemoryRouter><RelationshipSection signal={signal} emissionsSeries={series} /></MemoryRouter>);
    const grid = container.querySelector('.overview-relationship-grid') as HTMLElement;
    // A bare 1fr is minmax(auto, 1fr): the column grows to its content's minimum width and overflows a narrow container.
    expect(grid.style.gridTemplateColumns).toBe('minmax(0, 2fr) minmax(0, 1fr)');
    const css = container.querySelector('style')!.textContent!;
    const narrow = /\.overview-relationship-grid\s*\{\s*grid-template-columns:\s*([^;]+?)\s*(?:!important)?\s*;/.exec(css);
    expect(narrow?.[1]).toBe('minmax(0, 1fr)');
  });
});
