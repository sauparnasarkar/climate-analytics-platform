import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Figure, SynThemeProvider, Text, resolveToken } from '@syena/ds';

describe('the design system is available', () => {
  it('renders its components and reads its tokens', () => {
    render(
      <SynThemeProvider theme="night" storageKey={null}>
        <Text>Hello</Text>
        <Figure value={1234.5} decimals={1} unit="Mt" />
      </SynThemeProvider>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText(/1,234\.5/)).toBeInTheDocument();
    expect(typeof resolveToken).toBe('function');
  });
});
