import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClimateSignal } from '../../lib/climateSignal';
import { RelationshipSection } from './RelationshipSection';

vi.mock('@syena/ds', async (importOriginal) => ({ ...(await importOriginal<object>()), Chart: () => null }));

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
  it('is a single column (the explanation card and the toggle moved to Climate Correlation), so no two-column grid can be pushed sideways by a wide child', () => {
    const { container } = render(<MemoryRouter><RelationshipSection signal={signal} emissionsSeries={series} /></MemoryRouter>);
    expect(container.querySelector('.overview-relationship-grid')).toBeNull();
    expect(container.querySelector('style')?.textContent ?? '').not.toMatch(/grid-template-columns/);
    expect(container.querySelector('section[id="relationship"]')).not.toBeNull();
  });
});
