import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageChromeContext, PageFilters, type PageChromeContextValue } from './PageChrome';

afterEach(cleanup);

/** A context whose registration is recorded, to test what PageFilters asks of the shell. */
function recordingContext() {
  const unregister = vi.fn();
  const registerFilters = vi.fn(() => unregister);
  const value: PageChromeContextValue = { set: () => {}, registerFilters, slot: null };
  return { value, registerFilters, unregister };
}

describe('PageFilters registration', () => {
  it('registers once when it mounts and withdraws once when it unmounts', () => {
    const { value, registerFilters, unregister } = recordingContext();
    const { unmount } = render(<PageChromeContext.Provider value={value}><PageFilters><input aria-label="f" /></PageFilters></PageChromeContext.Provider>);
    expect(registerFilters).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();
    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('does not register again when the page re-renders (the shell\'s function is stable)', () => {
    const { value, registerFilters, unregister } = recordingContext();
    function Page() {
      const [n, setN] = useState(0);
      return <PageChromeContext.Provider value={value}><PageFilters><input aria-label="f" /></PageFilters><button onClick={() => setN(n + 1)}>rerender {n}</button></PageChromeContext.Provider>;
    }
    render(<Page />);
    fireEvent.click(screen.getByText(/rerender/));
    fireEvent.click(screen.getByText(/rerender/));
    expect(registerFilters).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();
  });

  it('two instances register and withdraw independently', () => {
    const { value, registerFilters, unregister } = recordingContext();
    function Page() {
      const [second, setSecond] = useState(true);
      return <PageChromeContext.Provider value={value}><PageFilters><i /></PageFilters>{second ? <PageFilters><b /></PageFilters> : null}<button onClick={() => setSecond(false)}>drop</button></PageChromeContext.Provider>;
    }
    render(<Page />);
    expect(registerFilters).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText('drop'));
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('outside a shell draws its children in place and registers nothing', () => {
    render(<PageFilters><input aria-label="in place" /></PageFilters>);
    expect(screen.getByLabelText('in place')).toBeInTheDocument();
  });
});
