import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KPI_STRIP_STYLES, KpiStrip } from './KpiStrip';

describe('KpiStrip', () => {
  it('writes each value in the design system figure role over a caption-role label, with no colour unless one is given', () => {
    render(<KpiStrip items={[{ value: '37,398', label: 'MtCO₂ in 2024' }, { value: '+66%', label: 'Change since 1990', color: 'rgb(1, 2, 3)' }, { value: '208', label: 'Countries', valueClassName: 'tone' }]} />);
    const plain = screen.getByText('37,398');
    expect(plain.className).toContain('syn-figure-md');
    expect(plain.getAttribute('style')).toBeNull();
    expect(screen.getByText('MtCO₂ in 2024').className).toContain('syn-caption');
    expect(screen.getByText('+66%').style.color).toBe('rgb(1, 2, 3)');
    expect(screen.getByText('208').className).toContain('tone');
  });

  it("spaces cells on the design system's space scale and sets no line height of its own above the phone width", () => {
    expect(KPI_STRIP_STYLES).toMatch(/padding: var\(--syn-space-4\) var\(--syn-space-4\) var\(--syn-space-4\) 0/);
    expect(KPI_STRIP_STYLES).not.toMatch(/\d+px \d+px \d+px/);
    const outsidePhone = KPI_STRIP_STYLES.split('@media')[0];
    expect(outsidePhone).not.toMatch(/line-height/);
  });
});
