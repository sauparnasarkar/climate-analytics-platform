import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { METHODS_ANCHORS, methodsHref } from '../lib/methodology';
import { MethodNote } from './MethodNote';

describe('MethodNote', () => {
  it('says its two lines and deep-links to its section of Methods & data', () => {
    render(<MemoryRouter><MethodNote anchor={METHODS_ANCHORS.forecasting}>Fitted on 1990–2018.</MethodNote></MemoryRouter>);
    expect(screen.getByText(/Fitted on 1990–2018\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Method →' })).toHaveAttribute('href', '/about#forecasting');
  });

  it('builds every section\'s href from one constant', () => {
    expect(Object.values(METHODS_ANCHORS).map(methodsHref)).toEqual(['/about#project', '/about#sources', '/about#baselines', '/about#forecasting', '/about#correlation', '/about#scenarios', '/about#limits']);
  });
});
