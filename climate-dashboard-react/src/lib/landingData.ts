import type { MoverRow, WorldMapTimeSeries } from '../api/types';
import { pickHeadlineFacts } from './overviewHeadline';

/** Thousands-separated integer, e.g. 12,289. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Signed one-decimal percent with a true minus sign, e.g. +452.5% / −45.7%. */
export function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
}

/** Signed integer with a true minus sign, e.g. +9,806. */
export function fmtSigned(n: number): string {
  return `${n >= 0 ? '+' : '−'}${fmtInt(Math.abs(n))}`;
}

export type StoryKind = 'largest-rise' | 'fastest-growth' | 'steepest-decline';

export interface Story {
  kind: StoryKind;
  country: string;
  /** The headline figure, pre-formatted (e.g. "+9,806" MtCO₂, "+452.5%", "−45.7%"). */
  headline: string;
  /** Direction of the change, for colouring (a decline is the favourable one). */
  sentiment: 'increase' | 'decrease';
  /** Emissions at the first/last year, when the API has them. */
  from: number | null;
  to: number | null;
  /** Per-year series (aligned to WorldMapTimeSeries.years; null = no data that year). */
  series: Array<number | null>;
}

/**
 * The landing page's "stories": who added the most, who grew fastest, who cut the most, among the
 * headline movers. Uses the *same* selection rules as the Overview's headline sentence
 * (`pickHeadlineFacts`), so the two can never name different countries for the same claim. A card
 * is omitted when its claim isn't true of the data (no rise / no decline at all).
 */
export function pickStories(headlineMovers: MoverRow[], map: WorldMapTimeSeries): Story[] {
  const facts = pickHeadlineFacts(headlineMovers);
  if (!facts) return [];
  const byCountry = new Map(headlineMovers.map((m) => [m.country, m]));
  const seriesOf = (country: string): Array<number | null> => {
    const k = map.countries.indexOf(country);
    return k < 0 ? [] : map.years.map((_, i) => map.values[i]?.[k] ?? null);
  };
  const make = (kind: StoryKind, country: string, headline: string, sentiment: Story['sentiment']): Story => {
    const m = byCountry.get(country);
    return { kind, country, headline, sentiment, from: m?.co2_1990 ?? null, to: m?.co2_latest ?? null, series: seriesOf(country) };
  };

  const stories: Story[] = [];
  if (facts.absGrower.absoluteChange > 0) {
    stories.push(make('largest-rise', facts.absGrower.country, fmtSigned(facts.absGrower.absoluteChange), 'increase'));
  }
  if (facts.pctGrower.pctChange > 0) {
    stories.push(make('fastest-growth', facts.pctGrower.country, fmtPct(facts.pctGrower.pctChange), 'increase'));
  }
  const steepest = facts.decliners[0];
  if (steepest) stories.push(make('steepest-decline', steepest.country, fmtPct(steepest.pctChange), 'decrease'));
  return stories;
}

/** SVG path for a sparkline in a `width`×`height` box. Null points break the line; a flat series draws mid-height. */
export function sparklinePath(values: Array<number | null>, width = 300, height = 64, pad = 4): string {
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) return '';
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const span = hi - lo;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  let pen = false;
  return values
    .map((v, i) => {
      if (v == null) { pen = false; return ''; }
      const y = span === 0 ? height / 2 : height - pad - ((v - lo) / span) * (height - 2 * pad);
      const cmd = pen ? 'L' : 'M';
      pen = true;
      return `${cmd}${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');
}

export const RACE_SIZE = 10;

export interface RaceModel {
  years: number[];
  /** Every country that is in the top RACE_SIZE in *any* year, sorted by name -- a stable row set so a
   * country keeps its DOM node (and can animate) as its rank changes. */
  countries: string[];
  /** values[yearIdx][countryIdx]; missing data counts as 0. */
  values: number[][];
  /** Largest value anywhere in the race -- the fixed bar scale. */
  maxValue: number;
}

export function buildRaceModel(map: WorldMapTimeSeries): RaceModel {
  const set = new Set<string>();
  map.years.forEach((_, i) => {
    map.countries
      .map((c, k) => [c, map.values[i]?.[k] ?? 0] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, RACE_SIZE)
      .forEach(([c]) => set.add(c));
  });
  const countries = Array.from(set).sort();
  const idx = countries.map((c) => map.countries.indexOf(c));
  const values = map.years.map((_, i) => idx.map((k) => map.values[i]?.[k] ?? 0));
  const maxValue = Math.max(0, ...values.flat());
  return { years: map.years, countries, values, maxValue };
}

export interface RaceRow {
  country: string;
  value: number;
  /** 0-based rank among the race's countries this year. */
  rank: number;
  /** Whether the row is in this year's top RACE_SIZE (others are parked off-screen). */
  inTop: boolean;
}

export interface RaceFrame {
  year: number;
  /** In the model's stable country order (not rank order). */
  rows: RaceRow[];
  /** Sum of this year's top RACE_SIZE. */
  topTotal: number;
}

export function raceFrame(model: RaceModel, yearIdx: number): RaceFrame {
  const i = Math.max(0, Math.min(model.years.length - 1, yearIdx));
  const vals = model.values[i] ?? [];
  const order = vals.map((v, k) => [v, k] as const).sort((a, b) => b[0] - a[0]);
  const rankOf = new Map(order.map(([, k], r) => [k, r]));
  const rows = model.countries.map((country, k) => {
    const rank = rankOf.get(k) ?? model.countries.length;
    return { country, value: vals[k] ?? 0, rank, inTop: rank < RACE_SIZE };
  });
  const topTotal = rows.filter((r) => r.inTop).reduce((s, r) => s + r.value, 0);
  return { year: model.years[i], rows, topTotal };
}

/** The top RACE_SIZE's share of the year's world total, as a whole percent; null if the total is unusable. */
export function raceShare(topTotal: number, worldTotal: number | undefined): number | null {
  return worldTotal && worldTotal > 0 ? Math.round((topTotal / worldTotal) * 100) : null;
}

/** The top RACE_SIZE's share of the world total in the series' final year, on the ANNUAL basis the hero's second banner states ("N% of 2024 emissions"). The ranking race
 * below it is ranked on cumulative CO₂ (its heading says "since 1750"), so the two top-ten shares differ on purpose. Null if unusable. */
export function latestTopShare(map: WorldMapTimeSeries, worldTotals: ReadonlyArray<number>): number | null {
  const last = map.years.length - 1;
  if (last < 0) return null;
  return raceShare(raceFrame(buildRaceModel(map), last).topTotal, worldTotals[last]);
}

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};
const joinNames = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);

/** What the race shows, said in a sentence from the model itself: who leads (and whether throughout), who climbed furthest, who enters the top RACE_SIZE and who slips
 * back, first year against last. Null when nothing is worth saying. Every name and rank is read from the data, never typed. */
export function raceStory(model: RaceModel): string | null {
  if (model.years.length < 2) return null;
  const first = raceFrame(model, 0);
  const last = raceFrame(model, model.years.length - 1);
  const rankFirst = new Map(first.rows.map((r) => [r.country, r]));
  const leaderOf = (frame: RaceFrame) => frame.rows.find((r) => r.rank === 0)?.country;
  const leader = leaderOf(last);
  if (!leader) return null;
  const throughout = model.years.every((_, i) => leaderOf(raceFrame(model, i)) === leader);
  const leaderBefore = rankFirst.get(leader)!;
  // A leader that was not first at the start says where it came from, so it is not told twice as a climber.
  const lead = throughout ? `${leader} leads throughout` : `${leader} leads in ${last.year}${leaderBefore.rank > 0 ? `, up from ${ordinal(leaderBefore.rank + 1)} in ${first.year}` : ''}`;
  const parts: string[] = [];

  const inLast = last.rows.filter((r) => r.inTop).sort((a, b) => a.rank - b.rank);
  const climbers = inLast.flatMap((r) => {
    const before = rankFirst.get(r.country)!;
    return r.country !== leader && before.inTop && before.rank - r.rank > 0 ? [{ country: r.country, from: before.rank, to: r.rank, by: before.rank - r.rank }] : [];
  }).sort((a, b) => b.by - a.by);
  if (climbers[0]) parts.push(`${climbers[0].country} climbs from ${ordinal(climbers[0].from + 1)} in ${first.year} to ${ordinal(climbers[0].to + 1)}`);

  const entrants = inLast.filter((r) => !rankFirst.get(r.country)!.inTop && r.country !== leader).map((r) => r.country);
  if (entrants.length > 0) parts.push(`${joinNames(entrants.slice(0, 2))} ${entrants.slice(0, 2).length > 1 ? 'enter' : 'enters'} the top ${RACE_SIZE}`);

  const slipper = first.rows.filter((r) => r.inTop).flatMap((r) => {
    const after = last.rows.find((x) => x.country === r.country)!;
    return after.rank > r.rank ? [{ country: r.country, by: after.rank - r.rank, out: !after.inTop }] : [];
  }).sort((a, b) => Number(b.out) - Number(a.out) || b.by - a.by)[0]; // leaving the top ten is the bigger story, then the biggest fall
  if (slipper) parts.push(slipper.out ? `${slipper.country} drops out of the top ${RACE_SIZE}` : `${slipper.country} slips back`);

  return `${lead}${parts.length > 0 ? `; ${joinNames(parts)}` : ''}.`;
}

/** Wording for a percent change since the baseline year, after "have": direction-aware, with a plain-language fraction where it is exact enough.
 * Exactly +100% is "doubled" (not "more than doubled"); a rise rounding to 0% or a fall are never worded as growth. */
export function growthPhrase(pctChange: number): string {
  const whole = Math.round(Math.abs(pctChange));
  if (whole === 0) return 'barely changed';
  if (pctChange < 0) return `fallen by ${whole}%`;
  if (Math.abs(pctChange - 100) < 0.05) return 'doubled';
  if (pctChange > 100) return 'more than doubled';
  if (pctChange >= 200 / 3) return 'grown by more than two-thirds';
  return `grown by ${whole}%`;
}

/** Space above the canvas inside the Globe's panel (its 12 px padding). */
export const PHONE_GLOBE_PAD_PX = 12;
/** Space the browser's own toolbar can take at the bottom of a phone screen (Safari's floating bar is about 80 px), kept clear so the slide's last button is not under it. */
export const PHONE_GLOBE_PILL_ZONE_PX = 80;
/** Height from the canvas's bottom to the bottom of the slide (caption, legend, controls, year slider, figures, button) when it has not been measured. */
export const PHONE_GLOBE_BELOW_PX = 122;
/** A phone globe is never smaller than this, however short the screen. */
export const PHONE_GLOBE_MIN_PX = 160;
/** The design's cap: at most this share of the screen height. */
export const PHONE_GLOBE_MAX_SHARE = 0.62;
/** ...and at most this share of the screen width (307 of 390), so the legend and controls keep their place under it. */
export const PHONE_GLOBE_WIDTH_SHARE = 0.787;

/** The largest a phone's globe may be (px): what fits between where its column starts on the page (`top`, 0 if not yet measured) and the stable viewport's bottom,
 * less the panel padding, everything that sits under the canvas on the slide (`below`: caption, legend, controls, figures and the button, measured because the legend wraps more on a narrow phone) and the toolbar's zone,
 * so the slide's last button sits clear of the browser's toolbar at rest, and no lower than `bottom` (the page's y where the hero ends, so a tall screen does not make this banner taller than the other) -- never above the design's 62% of the height or the laptop-sized `ceiling`, never below the minimum. */
export function phoneGlobeMax({ viewportHeight, top, ceiling, below = PHONE_GLOBE_BELOW_PX, width = Infinity, bottom = Infinity }: { viewportHeight: number; top: number; ceiling: number; below?: number; width?: number; bottom?: number }): number {
  const fit = top > 0 ? Math.min(viewportHeight - PHONE_GLOBE_PILL_ZONE_PX, bottom) - top - PHONE_GLOBE_PAD_PX - below : Infinity;
  return Math.max(PHONE_GLOBE_MIN_PX, Math.min(ceiling, Math.round(viewportHeight * PHONE_GLOBE_MAX_SHARE), Math.round(width * PHONE_GLOBE_WIDTH_SHARE), fit));
}

/** How many countries the globe names on a desktop or tablet: the ten largest emitters of the year in view, ranked on the same annual values the globe colours by, so a label and a colour
 * agree. The design system's globe has no collision handling (a label sits at its country's centre; only the facing side is drawn), so names near each other, such as East Asia's
 * and the Gulf's, can overlap; whether that is acceptable is judged on the preview, and a fix would be a design-system change (drop the lower-ranked of two colliding labels). */
export const GLOBE_LABEL_COUNT = 10;
/** On a phone the globe is about 210 px across, so only the five largest are named. */
export const GLOBE_LABEL_COUNT_PHONE = 5;

/** The largest emitters of one year, largest first, as the globe's labels: the name and the value. Aggregates and countries without a value are skipped. */
export function topEmitterLabels(map: WorldMapTimeSeries, yearIdx: number, count: number): Array<{ id: string; text: string }> {
  const row = map.values[yearIdx];
  if (!row) return [];
  return map.iso_codes
    .flatMap((id, i) => (row[i] != null && row[i]! > 0 && !id.startsWith('OWID') ? [{ id, name: map.countries[i], value: row[i]! }] : []))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map(({ id, name, value }) => ({ id, text: `${name} ${fmtInt(value)}` }));
}
