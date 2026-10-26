import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeadingEmitters } from './LeadingEmitters';

const LEADERS = [
  { iso: 'CHN', name: 'China', value: 12289, sharePct: 31.8 },
  { iso: 'JPN', name: 'Japan', value: 962, sharePct: 2.5 },
];

describe('LeadingEmitters rows', () => {
  it('gives every row the same fixed columns, so the figures line up and do not change width as the years play', () => {
    const { container } = render(<LeadingEmitters year={2024} mode="absolute" leaders={LEADERS} cumulativeFrom={null} />);
    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows).toHaveLength(2);
    const columns = rows.map((r) => r.style.gridTemplateColumns);
    expect(columns[0]).toBe(columns[1]);
    expect(columns[0]).not.toMatch(/auto|max-content|min-content/);
  });

  it('keeps a figure and its unit on one line, right-aligned', () => {
    const { container } = render(<LeadingEmitters year={2024} mode="absolute" leaders={LEADERS} cumulativeFrom={null} />);
    const figure = container.querySelector('li span:nth-child(3)') as HTMLElement;
    expect(figure).toHaveTextContent('12,289 Mt');
    expect(figure.style.whiteSpace).toBe('nowrap');
    expect(figure.style.textAlign).toBe('right');
  });
});
