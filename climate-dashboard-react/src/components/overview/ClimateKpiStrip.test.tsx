import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClimateSignal } from '../../lib/climateSignal';
import { ClimateKpiStrip } from './ClimateKpiStrip';

const SIGNAL: ClimateSignal = {
  points: [], fit: { slope: 0.5, ciLow: 0.4, ciHigh: 0.6, rSquared: null, unit: 'u', start: 1850, end: 2024, nYears: 175 }, line: { x0: 0, y0: 0, x1: 1, y1: 1 },
  temperature: { value: 1.45, year: 2025 }, concentration: { value: 427.4, year: 2025 },
  series: { concentration: [{ year: 1850, value: 286.8 }, { year: 2024, value: 424.6 }, { year: 2025, value: 427.4 }], temperature: [{ year: 2023, value: 1.5 }, { year: 2024, value: 1.62 }, { year: 2025, value: 1.45 }] },
  spliceYear: null, ppm1850: 286.8, omittedYears: [], vintageCaveat: null,
};
const SERIES = [{ year: 1990, value: 22184 }, { year: 2023, value: 37000 }, { year: 2024, value: 37406 }];
const emissions = (year: number, series = SERIES) => ({ year, total: series[series.length - 1].value, pctChange: 68.6, baselineYear: 1990, series });
const MEAN5 = [{ year: 2024, value: 1.39 }, { year: 2025, value: 1.35 }];

describe('ClimateKpiStrip at the aligned year', () => {
  it('shows every card at the earliest of the three latest years, the 5-year mean for that year, and an ⓘ only where a newer year exists', () => {
    render(<ClimateKpiStrip emissions={emissions(2024)} signal={SIGNAL} mean5y={{ value: 1.35, year: 2025 }} mean5ySeries={MEAN5} />);
    expect(screen.getByText('Atmospheric CO₂ · 2024')).toBeInTheDocument();
    expect(screen.getByText('424.6')).toBeInTheDocument();
    expect(screen.getByText('Temperature anomaly · 2024')).toBeInTheDocument();
    expect(screen.getByText('+1.62 °C')).toBeInTheDocument();
    expect(screen.getByText('5-year mean 1.39 °C')).toBeInTheDocument();
    // one ⓘ per card: the emissions cards have no newer data, so theirs stays the plain baseline button
    expect(screen.getByRole('button', { name: 'Baseline details: CO₂ emissions · 2024' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Newer data available/ })).not.toBeInTheDocument();
    const info = screen.getByRole('button', { name: 'Newer data and baseline details: Temperature anomaly · 2024' });
    expect(within(info.closest('article')!).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(info);
    const panel = within(info.closest('article')!).getByRole('region');
    expect(panel.firstElementChild).toHaveTextContent('2025 is available: +1.45 °C (Berkeley Earth). Shown for 2024 so all four cards refer to the same year.'); // the newer-data line first, then the baseline rows
    expect(panel).toHaveTextContent('Baseline1850–1900 average');
  });

  it('moves every card to 2025 when emissions gain that year, and the icons go', () => {
    const series = [...SERIES, { year: 2025, value: 37900 }];
    render(<ClimateKpiStrip emissions={emissions(2025, series)} signal={SIGNAL} mean5y={{ value: 1.35, year: 2025 }} mean5ySeries={MEAN5} />);
    expect(screen.getByText('CO₂ emissions · 2025')).toBeInTheDocument();
    expect(screen.getByText('427.4')).toBeInTheDocument();
    expect(screen.getByText('5-year mean 1.35 °C')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Newer data/ })).not.toBeInTheDocument();
  });
});

describe('ClimateKpiStrip emissions sparkline', () => {
  it('plots to the latest emissions year, says so in its caption, and marks the aligned year when emissions are the newer series', () => {
    const older = { ...SIGNAL, concentration: { value: 424.6, year: 2024 }, temperature: { value: 1.62, year: 2024 }, series: { concentration: SIGNAL.series.concentration.slice(0, 2), temperature: SIGNAL.series.temperature.slice(0, 2) } };
    const series = [...SERIES, { year: 2025, value: 37900 }];
    const { container } = render(<ClimateKpiStrip emissions={emissions(2025, series)} signal={older} mean5y={null} />);
    expect(screen.getByText('CO₂ emissions · 2024')).toBeInTheDocument();
    expect(screen.getByText('1990–2025')).toBeInTheDocument();
    expect(container.querySelector('article circle')).not.toBeNull(); // the marker dot at 2024
  });
});
