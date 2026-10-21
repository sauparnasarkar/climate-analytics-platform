import { describe, expect, it } from 'vitest';
import { formatNatural, formatSummaryValue, isNumberColumn } from './explorerFigures';

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

describe('formatSummaryValue', () => {
  it('writes whole numbers with separators and fractions to four significant figures, without trailing zeros', () => {
    expect(formatSummaryValue('co2', '7508', 'count')).toBe('7,508');
    expect(formatSummaryValue('co2', '137.54446710175813', 'mean')).toBe('137.5');
    expect(formatSummaryValue('co2', '5.022941951088416', 'mean')).toBe('5.023');
    expect(formatSummaryValue('co2', '0.7142499999999999', '25%')).toBe('0.714');
    expect(formatSummaryValue('co2', '1.5', 'std')).toBe('1.5');
    expect(formatSummaryValue('gdp', '489406555401.88043', 'mean')).toBe('489,406,555,402');
    expect(formatSummaryValue('total_ghg', '-0.003', 'min')).toBe('−0.003');
  });
  it('keeps a year plain where the statistic is a position in the data, and still counts and spreads like numbers', () => {
    expect(formatSummaryValue('year', '1990', 'min')).toBe('1990');
    expect(formatSummaryValue('year', '2007.5', 'mean')).toBe('2007.5');
    expect(formatSummaryValue('year', '7630', 'count')).toBe('7,630');
    expect(formatSummaryValue('year', '10.100166832057344', 'std')).toBe('10.1');
  });
  it('leaves text and blanks alone', () => {
    expect(formatSummaryValue('country', 'Afghanistan', 'top')).toBe('Afghanistan');
    expect(formatSummaryValue('co2', '', 'top')).toBe('');
    expect(formatSummaryValue('co2', null, 'top')).toBe('');
  });
});

describe('isNumberColumn', () => {
  it('is true when every value that is there is a number, as a number or as text, and false for names or nothing', () => {
    expect(isNumberColumn(['7508', '137.5', '', null, 0])).toBe(true);
    expect(isNumberColumn(['7630', 'Afghanistan'])).toBe(false);
    expect(isNumberColumn(['', null])).toBe(false);
  });
});
