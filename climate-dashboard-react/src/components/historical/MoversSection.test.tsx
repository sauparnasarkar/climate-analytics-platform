import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TimeseriesSeries } from '../../api/types';
import { NEGATIVE_COLOR, POSITIVE_COLOR } from '../../constants';
import { MoversSection } from './MoversSection';

vi.mock('@syena/ds', async (orig) => ({
  ...(await orig<typeof import('@syena/ds')>()),
  Chart: (p: { series: Array<{ x: string[]; y: number[]; signed?: string; signLabels?: string[] }> }) => (
    <div data-testid="chart" data-x={JSON.stringify(p.series[0].x)} data-y={JSON.stringify(p.series[0].y)} data-signed={p.series[0].signed} data-sign-labels={JSON.stringify(p.series[0].signLabels)} />
  ),
}));

const SERIES: TimeseriesSeries[] = [
  { name: 'India', years: [1990, 2024], values: [500, 2500] },
  { name: 'China', years: [1990, 2024], values: [2000, 9000] },
  { name: 'Brazil', years: [1990, 2024], values: [200, 440] },
  { name: 'Peru', years: [1990, 2024], values: [20, 80] },
  { name: 'Germany', years: [1990, 2024], values: [1000, 570] },
  { name: 'United Kingdom', years: [1990, 2024], values: [600, 300] },
];
const mount = (p: Partial<React.ComponentProps<typeof MoversSection>> = {}) => render(<MoversSection series={SERIES} loading={false} error={null} countryCount={6} year={null} onYearChange={() => {}} {...p} />);

describe('MoversSection', () => {
  it('lists the three largest increases and the decreases, an increase in the bad colour and a decrease in the good one', () => {
    mount();
    const up = screen.getByRole('heading', { level: 3, name: 'Largest increases' }).parentElement!;
    expect(within(up).getAllByRole('listitem')).toHaveLength(3); // capped at three: India, China, Peru (Brazil's +120% is fourth)
    expect(within(up).queryByText('Brazil')).not.toBeInTheDocument();
    expect(within(up).getByText('India').nextElementSibling).toHaveStyle({ color: NEGATIVE_COLOR });
    const down = screen.getByRole('heading', { level: 3, name: 'Largest decreases' }).parentElement!;
    expect(within(down).getAllByRole('listitem')).toHaveLength(2);
    expect(within(down).getByText('United Kingdom')).toBeInTheDocument();
    expect(within(down).getByText('United Kingdom').nextElementSibling).toHaveStyle({ color: POSITIVE_COLOR });
    expect(within(down).getByText('United Kingdom').nextElementSibling).toHaveTextContent('−50.0%');
  });

  it('draws every country in the % change chart, signed so a rise reads as the bad end, titled with the real years', () => {
    mount();
    expect(screen.getByRole('heading', { level: 2, name: 'Top Movers, 1990 → 2024' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'CO₂ % Change by Country, 1990–2024' })).toBeInTheDocument();
    const chart = screen.getByTestId('chart');
    expect(chart).toHaveAttribute('data-signed', 'change');
    expect(chart).toHaveAttribute('data-sign-labels', JSON.stringify(['Decrease', 'Increase']));
    expect(JSON.parse(chart.getAttribute('data-x')!)).toEqual(['India', 'China', 'Peru', 'Brazil', 'Germany', 'United Kingdom']);
    expect(JSON.parse(chart.getAttribute('data-y')!)[0]).toBeCloseTo(400); // India: (2500 − 500) / 500
  });

  it('keeps both jump targets in the DOM whatever the data: no selection, loading, error and no baseline each say so', () => {
    for (const [props, text] of [
      [{ series: null, countryCount: 0 }, 'Select at least one country.'],
      [{ series: null, loading: true }, 'Loading…'],
      [{ series: null, error: 'Boom' }, 'Boom'],
      [{ series: [{ name: 'A', years: [2000, 2024], values: [1, 2] }] }, 'There is no 1990 baseline to compare with for the selected countries.'],
    ] as Array<[Partial<React.ComponentProps<typeof MoversSection>>, string]>) {
      const { unmount } = mount(props);
      expect(document.getElementById('top-movers')).not.toBeNull();
      expect(document.getElementById('percent-change')).not.toBeNull();
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
      expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('offers a Year control over the years after 1990 (latest first), shows the chosen year in both sections, and reports a change', () => {
    const years: SeriesYears = [{ name: 'India', years: [1990, 2000, 2024], values: [500, 1000, 2500] }, { name: 'UK', years: [1990, 2000, 2024], values: [600, 500, 300] }];
    const onYearChange = vi.fn();
    mount({ series: years, countryCount: 2, year: 2000, onYearChange });
    expect(screen.getByRole('heading', { level: 2, name: 'Top Movers, 1990 → 2000' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'CO₂ % Change by Country, 1990–2000' })).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Year' });
    expect(within(group).getByRole('combobox', { name: 'Year' })).toHaveTextContent('2000');
    fireEvent.click(within(group).getByRole('combobox', { name: 'Year' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['2024', '2000']);
    fireEvent.click(screen.getByRole('option', { name: '2024' }));
    expect(onYearChange).toHaveBeenCalledWith(2024);
  });
});
type SeriesYears = TimeseriesSeries[];
