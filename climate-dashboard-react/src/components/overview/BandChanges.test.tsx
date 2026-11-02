import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BandMove } from '../../lib/mapBands';
import { BandChanges } from './BandChanges';

const MOVES: BandMove[] = [
  { iso: 'CHN', name: 'China', from: 6, to: 7, steps: 1, value: 12000 },
  { iso: 'RUS', name: 'Russia', from: 7, to: 6, steps: -1, value: 1700 },
];

describe('BandChanges', () => {
  it('lists each country with its band swatches, the bands crossed and the range change, up first', () => {
    render(<BandChanges mode="absolute" baselineYear={1990} year={2024} moves={MOVES} />);
    const section = screen.getByRole('region', { name: 'Changed band since 1990' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('China');
    expect(rows[0]).toHaveTextContent('↑1');
    expect(rows[0]).toHaveTextContent('1k–2.5k → 2.5k+');
    expect(rows[1]).toHaveTextContent('Russia');
    expect(rows[1]).toHaveTextContent('↓1');
    expect(rows[1]).toHaveTextContent('2.5k+ → 1k–2.5k');
    // the swatches are the band tokens of the bands moved between
    const swatches = [...rows[0].querySelectorAll('span[aria-hidden="true"]')].map((e) => (e as HTMLElement).style.background).filter(Boolean);
    expect(swatches).toEqual(['var(--syn-data-band-7)', 'var(--syn-data-band-8)']);
  });

  it('states the direction in words for a screen reader, and colours up and down differently', () => {
    render(<BandChanges mode="absolute" baselineYear={1990} year={2024} moves={MOVES} />);
    expect(screen.getByText('up 1 band')).toBeInTheDocument();
    expect(screen.getByText('down 1 band')).toBeInTheDocument();
    const [up, down] = [screen.getByText('↑1'), screen.getByText('↓1')].map((e) => (e.parentElement as HTMLElement).style.color);
    expect(up).not.toBe('');
    expect(up).not.toBe(down);
  });

  it('uses the cumulative labels in cumulative mode', () => {
    render(<BandChanges mode="cumulative" baselineYear={1990} year={2024} moves={[{ iso: 'IND', name: 'India', from: 2, to: 4, steps: 2, value: 66000 }]} />);
    expect(screen.getByText('1k–5k → 20k–50k')).toBeInTheDocument();
  });

  it('asks for a later year at the baseline, with no list', () => {
    render(<BandChanges mode="absolute" baselineYear={1990} year={1990} moves={[]} />);
    expect(screen.getByText('Pick a later year to see which countries changed band since 1990.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('says so when no country moved in a later year', () => {
    render(<BandChanges mode="absolute" baselineYear={1990} year={1991} moves={[]} />);
    expect(screen.getByText('No country has moved to a different band since 1990.')).toBeInTheDocument();
  });
});
