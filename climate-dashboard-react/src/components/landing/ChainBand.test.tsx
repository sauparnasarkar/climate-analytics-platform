import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ClimateSignal } from '../../lib/climateSignal';
import { buildAlignedChain } from '../../lib/alignedYear';
import { ChainBand } from './ChainBand';

const SIGNAL: ClimateSignal = {
  points: [], fit: { slope: 0.52, ciLow: 0.48, ciHigh: 0.56, rSquared: 0.9, unit: 'u', start: 1850, end: 2024, nYears: 175 }, line: { x0: 0, y0: 0, x1: 1, y1: 1 },
  temperature: { value: 1.617, year: 2024 }, concentration: { value: 424.6, year: 2024 },
  series: { concentration: [{ year: 1850, value: 286.8 }, { year: 1959, value: 315.9 }, { year: 2024, value: 424.6 }], temperature: [{ year: 2023, value: 1.5 }, { year: 2024, value: 1.617 }] },
  spliceYear: 1959, ppm1850: 286.8, omittedYears: [], vintageCaveat: 'Based on Berkeley Earth file vintage 2025-01-10; a possible ~0.1 °C discrepancy is not yet reconciled.',
};
const EMISSIONS = [{ year: 2023, value: 36800 }, { year: 2024, value: 37398.067 }];

function renderBand(signal: ClimateSignal = SIGNAL, emissions = EMISSIONS) {
  return render(<MemoryRouter><ChainBand signal={signal} chain={buildAlignedChain(signal, emissions)!} /></MemoryRouter>);
}

describe('ChainBand at the aligned year', () => {
  const NEWER = { ...SIGNAL, concentration: { value: 427.4, year: 2025 }, temperature: { value: 1.45, year: 2025 }, series: { concentration: [...SIGNAL.series.concentration, { year: 2025, value: 427.4 }], temperature: [...SIGNAL.series.temperature, { year: 2025, value: 1.45 }] } };

  it('says which year all four steps use', () => {
    renderBand();
    expect(screen.getByText(/All four steps for/).textContent).toBe('All four steps for 2024, the latest year every step has data.');
  });

  it('shows the aligned year\'s values, with an ⓘ on each series that has a newer year, and none on the others', () => {
    renderBand(NEWER);
    expect(screen.getByText('424.6')).toBeInTheDocument();
    expect(screen.getByText('+1.62 °C')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /emissions/ })).not.toBeInTheDocument();
    const conc = screen.getByRole('button', { name: 'Newer data available: concentration' });
    expect(conc).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(conc);
    expect(conc).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent('2025 is available: 427.4 ppm (NOAA GML). Shown for 2024 so all four steps refer to the same year.');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newer data available: temperature' })).toBeInTheDocument();
  });

  it('adds a computed record-year sentence only when the newer temperature differs markedly', () => {
    renderBand(NEWER);
    fireEvent.click(screen.getByRole('button', { name: 'Newer data available: temperature' }));
    expect(screen.getByRole('note').textContent).toContain('2025 is available: +1.45 °C (Berkeley Earth).');
    expect(screen.getByRole('note').textContent).toContain('2024 was a record year.');
  });

  it('has no ⓘ at all when no series is newer', () => {
    renderBand();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('moves to the next year when emissions gain one', () => {
    renderBand(NEWER, [...EMISSIONS, { year: 2025, value: 37900 }]);
    expect(screen.getByText(/All four steps for/).textContent).toContain('2025');
    expect(screen.getByText('427.4')).toBeInTheDocument();
    expect(screen.getByText('37,900')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ChainBand', () => {
  it('is one ordered row of the four steps, labelled by its heading, in the order of the causal chain', () => {
    renderBand();
    const section = screen.getByRole('region', { name: 'How emissions add up to warming' });
    const steps = within(section).getByRole('list').querySelectorAll(':scope > li');
    expect(section.querySelector('ol')).not.toBeNull();
    expect([...steps].map((li) => li.querySelector('.chain-band__label')?.textContent)).toEqual(['01 · Emissions', '02 · Concentration', '03 · Radiative forcing', '04 · Temperature anomaly']);
  });

  it('shows global accumulated totals from the data, each figure with its own year, in one short line', () => {
    renderBand();
    expect(screen.getByText('37,398')).toBeInTheDocument();
    expect(screen.getByText('2024, worldwide')).toBeInTheDocument();
    expect(screen.getByText('424.6')).toBeInTheDocument();
    expect(screen.getByText('2024, up 48% on 1850')).toBeInTheDocument(); // 424.6 / 286.8 = 1.48
    expect(screen.getByText('+1.62 °C')).toBeInTheDocument();
    expect(screen.getByText('2024, above 1850–1900')).toBeInTheDocument();
    expect(screen.getByText(/One country’s emissions in one year do not set that year’s temperature/)).toBeInTheDocument();
  });

  it('is compact: no sparklines, no splice or vintage notes (Climate Correlation owns them)', () => {
    const { container } = renderBand();
    expect(container.querySelectorAll('svg')).toHaveLength(0);
    expect(screen.queryByText(/Ice core to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/file vintage/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'See on the Overview →' })).not.toBeInTheDocument();
  });

  it('keeps radiative forcing copy-only: no number, no chart', () => {
    renderBand();
    const forcing = screen.getByText('03 · Radiative forcing').closest('li')!;
    expect(within(forcing).getByText('Traps more heat')).toBeInTheDocument();
    expect(within(forcing).getByText('Described, not calculated')).toBeInTheDocument();
    expect(forcing.querySelector('svg')).toBeNull();
    expect(forcing.textContent?.replace('03 ', '')).not.toMatch(/\d/); // apart from its "03" label, no figure at all
  });

  it('links to Climate Correlation, which owns the full chain', () => {
    renderBand();
    expect(screen.getByRole('link', { name: 'How this works → Climate Correlation' })).toHaveAttribute('href', '/climate-correlation');
  });

  it('omits "up x% on 1850" when the API did not supply the 1850 level', () => {
    renderBand({ ...SIGNAL, ppm1850: null });
    const cell = screen.getByText('02 · Concentration').closest('li')!;
    expect(within(cell).getByText('2024')).toBeInTheDocument();
  });
});
