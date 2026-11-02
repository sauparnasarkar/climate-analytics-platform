import { fmtAnomaly, type ClimateSignal, type YearValue } from './climateSignal';
import { fmtInt } from './landingData';
import type { WorldMapTimeSeries } from '../api/types';

// The causal chain shown side by side (Home's chain, Overview's "What is happening globally", Climate Correlation's chain) uses ONE year: the earliest of
// the three series' latest years, so it moves by itself when emissions (usually the slowest) gain a year. A series with a newer year keeps it in its own
// sparkline and says so behind an ⓘ note. Nothing here is typed in: every year and value is read from the series.

/** Where the aligned values are shown: the chain's steps (Home, Correlation) or the Overview's KPI cards. */
export type ChainNoun = 'steps' | 'cards';

export type ChainStepName = 'emissions' | 'concentration' | 'temperature';

export interface ChainStep {
  /** The value at the aligned year; when that series has none there (a gap), its own latest value and year, so the cell still says what it shows */
  value: number;
  year: number;
  /** Text for the ⓘ note, or null when the series has no newer year than the one shown */
  note: string | null;
}

export interface AlignedChain {
  year: number;
  emissions: ChainStep | null;
  concentration: ChainStep;
  temperature: ChainStep;
}

/** The earliest of the latest years; years that are missing do not hold it back. Null when none is given. */
export function alignedYear(latestYears: ReadonlyArray<number | null | undefined>): number | null {
  const years = latestYears.filter((y): y is number => y != null && Number.isFinite(y));
  return years.length === 0 ? null : Math.min(...years);
}

export function valueAt(series: ReadonlyArray<YearValue>, year: number): number | null {
  return series.find((p) => p.year === year)?.value ?? null;
}

/** The world total per year for the years that have data: a year whose every cell is null is missing, not zero. */
export function emissionsYearValues(series: WorldMapTimeSeries): YearValue[] {
  const out: YearValue[] = [];
  series.values.forEach((row, i) => {
    if (row.some((v) => v != null && Number.isFinite(v))) out.push({ year: series.years[i], value: row.reduce<number>((a, v) => a + (v ?? 0), 0) });
  });
  return out;
}

const RECORD_MIN_GAP_C = 0.1;

interface StepInput {
  series: ReadonlyArray<YearValue>;
  aligned: number;
  format: (v: number) => string;
  source: string;
  /** What the four things are called where this is shown: steps of the chain, or the Overview's cards */
  noun: ChainNoun;
  /** One extra sentence when the newer value differs markedly; computed from the series or null */
  context?: (newer: YearValue, atAligned: number) => string | null;
}

function step({ series, aligned, format, source, noun, context }: StepInput): ChainStep | null {
  const latest = series[series.length - 1];
  if (!latest) return null;
  const at = valueAt(series, aligned);
  if (at == null) return { value: latest.value, year: latest.year, note: null };
  const note = latest.year > aligned
    ? [`${latest.year} is available: ${format(latest.value)} (${source}). Shown for ${aligned} so all four ${noun} refer to the same year.`, context?.(latest, at)].filter(Boolean).join(' ')
    : null;
  return { value: at, year: aligned, note };
}

/** When the aligned year is the record in the series and the newer year is clearly cooler, say so, with the 5-year mean when it is available. */
function temperatureContext(series: ReadonlyArray<YearValue>, mean5y: ReadonlyArray<YearValue>, aligned: number) {
  return (newer: YearValue, atAligned: number): string | null => {
    if (atAligned - newer.value < RECORD_MIN_GAP_C) return null;
    if (series.some((p) => p.year !== aligned && p.value >= atAligned)) return null;
    const mean = valueAt(mean5y, newer.year);
    return `${aligned} was a record year${mean != null ? `; the 5-year mean to ${newer.year} is ${mean.toFixed(2)} °C` : ''}.`;
  };
}

/** The chain at the aligned year, or null when there is no climate signal. `emissions` is the world's annual total per year (Mt), possibly empty. */
export function buildAlignedChain(signal: ClimateSignal | null, emissions: ReadonlyArray<YearValue>, mean5y: ReadonlyArray<YearValue> = [], noun: ChainNoun = 'steps'): AlignedChain | null {
  if (!signal) return null;
  const year = alignedYear([emissions[emissions.length - 1]?.year, signal.concentration.year, signal.temperature.year]);
  if (year == null) return null;
  const concentration = step({ series: signal.series.concentration, aligned: year, format: (v) => `${v.toFixed(1)} ppm`, source: 'NOAA GML', noun });
  const temperature = step({ series: signal.series.temperature, aligned: year, format: fmtAnomaly, source: 'Berkeley Earth', noun, context: temperatureContext(signal.series.temperature, mean5y, year) });
  if (!concentration || !temperature) return null;
  return { year, emissions: step({ series: emissions, aligned: year, format: (v) => `${fmtInt(v)} MtCO₂`, source: 'OWID', noun }), concentration, temperature };
}
