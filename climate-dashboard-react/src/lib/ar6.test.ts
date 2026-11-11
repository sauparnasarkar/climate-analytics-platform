import { describe, expect, it } from 'vitest';
import { HEADLINE_PAIR, PAIR } from '../test/climateFixtures';
import { ar6FromResponse, ar6Label } from './ar6';

// Root SPEC.md §5.35 F: the AR6 range is read from the API (the pipeline's reference registry), never a constant in the front end.
describe('ar6FromResponse', () => {
  it('reads the range and edition the API serves beside the headline fit', () => {
    expect(ar6FromResponse(HEADLINE_PAIR as never)).toEqual({ best: 0.45, low: 0.27, high: 0.63, edition: 'IPCC AR6 WGI, 2021' });
  });

  it('is null when the API sends no range, or a malformed one, so nothing is compared with AR6', () => {
    expect(ar6FromResponse({ ...PAIR, fit_context: {} })).toBeNull();
    expect(ar6FromResponse(null)).toBeNull();
    const bad = (ref: unknown) => ar6FromResponse({ ...PAIR, fit_context: { ar6_reference: ref } });
    expect(bad({ best_estimate: 0.45 })).toBeNull();
    expect(bad({ best_estimate: 0.9, very_likely_range: [0.27, 0.63] })).toBeNull(); // best estimate outside its own range
    expect(bad({ best_estimate: '0.45', very_likely_range: [0.27, 0.63] })).toBeNull();
  });

  it('keeps an older output without an edition, labelled plainly', () => {
    const ref = ar6FromResponse({ ...PAIR, fit_context: { ar6_reference: { best_estimate: 0.45, very_likely_range: [0.27, 0.63] } } })!;
    expect(ref.edition).toBeNull();
    expect(ar6Label(ref)).toBe('IPCC AR6');
  });
});

describe('ar6Label', () => {
  it('shows the edition year, so a dated reference reads as dated', () => {
    expect(ar6Label({ best: 0.45, low: 0.27, high: 0.63, edition: 'IPCC AR6 WGI, 2021' })).toBe('IPCC AR6 (2021)');
  });
});
