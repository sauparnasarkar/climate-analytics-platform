import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { recordResponse, resetSavedData } from '../lib/savedCopy';
import { SavedDataNotice } from './SavedDataNotice';

afterEach(() => { cleanup(); resetSavedData(); });

const mount = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <SavedDataNotice />
    <Link to="/historical">Historical</Link>
    <Routes><Route path="*" element={<p>page</p>} /></Routes>
  </MemoryRouter>,
);

const year = new Date().getFullYear();

describe('SavedDataNotice', () => {
  it('says when the copy was saved and that the server was not reached, in amber, as a polite status', () => {
    mount('/overview');
    act(() => recordResponse('/api/overview', `${year}-01-14T09:00:00.000Z`));
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Showing saved data from 14 January. Couldn’t reach the server.');
  });

  it('adds the year when the copy was saved in another year', () => {
    mount('/overview');
    act(() => recordResponse('/api/overview', `${year - 1}-12-31T12:00:00.000Z`));
    expect(screen.getByRole('status')).toHaveTextContent(`Showing saved data from 31 December ${year - 1}.`);
  });

  it('shows nothing while every latest response is live', () => {
    mount('/overview');
    act(() => recordResponse('/api/overview', null));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mixed case: stays while any request’s latest response is a copy, and goes when the last one is live', () => {
    mount('/overview');
    act(() => { recordResponse('/api/a', `${year}-01-14T09:00:00.000Z`); recordResponse('/api/b', `${year}-01-12T09:00:00.000Z`); });
    act(() => recordResponse('/api/b', null));
    expect(screen.getByRole('status')).toHaveTextContent('from 14 January');
    act(() => recordResponse('/api/a', null));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is never shown on the Ask page, where a failure is an error with Try again', () => {
    mount('/ask');
    act(() => recordResponse('/api/correlation', `${year}-01-14T09:00:00.000Z`));
    expect(screen.queryByText(/saved data/)).toBeNull();
  });

  it('forgets what the last page was shown when the reader goes to another page', () => {
    mount('/overview');
    act(() => recordResponse('/api/overview', `${year}-01-14T09:00:00.000Z`));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => screen.getByRole('link', { name: 'Historical' }).click());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
