import { describe, expect, it } from 'vitest';
import { formatAt, formatNatural, formatStat, monthName } from './explorerFigures';

describe('formatNatural', () => {
  it('writes a number with separators and a true minus, with the decimals it has and never padded', () => {
    expect(formatNatural(0.1)).toBe('0.1');
    expect(formatNatural(10.98)).toBe('10.98');
    expect(formatNatural(13065984000)).toBe('13,065,984,000');
    expect(formatNatural(-0.003)).toBe('−0.003');
    expect(formatNatural(0)).toBe('0');
  });
  it('leaves text as it is and a missing value empty', () => {
    expect(formatNatural('Afghanistan')).toBe('Afghanistan');
    expect(formatNatural(null)).toBe('');
  });
  it('never writes a minus before a zero it has rounded to', () => {
    expect(formatNatural(-0.0000001)).toBe('0');
  });
});

describe('formatStat', () => {
  it('writes whole numbers with separators and fractions to four significant figures, without trailing zeros', () => {
    expect(formatStat(7508)).toBe('7,508');
    expect(formatStat(137.54446710175813)).toBe('137.5');
    expect(formatStat(5.022941951088416)).toBe('5.023');
    expect(formatStat(0.7142499999999999)).toBe('0.714');
    expect(formatStat(1.5)).toBe('1.5');
    expect(formatStat(489406555401.88043)).toBe('489,406,555,402');
    expect(formatStat(-0.003)).toBe('−0.003');
    expect(formatStat(0)).toBe('0');
  });
  it('leaves a missing value empty', () => {
    expect(formatStat(null)).toBe('');
    expect(formatStat(undefined)).toBe('');
    expect(formatStat(Number.NaN)).toBe('');
    expect(formatStat('12')).toBe('');
  });
});

describe('monthName', () => {
  it('names months 1 to 12 and shows anything else as it is', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(12)).toBe('December');
    expect(monthName(13)).toBe('13');
    expect(monthName(null)).toBe('');
  });
});

describe('formatAt', () => {
  it('writes a number to the decimals its column is published at, never padded', () => {
    expect(formatAt(22646.308827, 0)).toBe('22,646');
    expect(formatAt(5476.435128, 1)).toBe('5,476.4');
    expect(formatAt(1.3099, 2)).toBe('1.31');
    expect(formatAt(0.5, 2)).toBe('0.5');
    expect(formatAt(-0.0004, 2)).toBe('0');
  });
  it('leaves text as it is and a missing value empty', () => {
    expect(formatAt('Afghanistan', 2)).toBe('Afghanistan');
    expect(formatAt(null, 2)).toBe('');
  });
});
