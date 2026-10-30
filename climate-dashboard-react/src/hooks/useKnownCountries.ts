import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { CountriesResponse } from '../api/types';

// The country list the Settings panel needs, fetched once per page load and kept: the panel opens at once on a list that is already
// there, instead of starting a request at that moment. A request that has not answered after SLOW_MS is said to be slow, with a way to
// try again, rather than leaving "Loading…" up for as long as it takes.

const SLOW_MS = 8000;

let cached: CountriesResponse | null = null;
let inflight: Promise<CountriesResponse> | null = null;

function load(): Promise<CountriesResponse> {
  if (cached) return Promise.resolve(cached);
  inflight ??= api.listCountries().then(
    (data) => { cached = data; inflight = null; return data; },
    (error: unknown) => { inflight = null; throw error; },
  );
  return inflight;
}

/** Starts the request without waiting for it; a failure is left for the panel to report when it is opened. */
export function prefetchCountries(): void {
  load().catch(() => {});
}

/** For tests: forget what was fetched. */
export function resetKnownCountries(): void {
  cached = null;
  inflight = null;
}

export type KnownCountries =
  | { status: 'ready'; data: CountriesResponse }
  | { status: 'loading' | 'slow' | 'error'; data: null; retry: () => void };

export function useKnownCountries(): KnownCountries {
  const [data, setData] = useState<CountriesResponse | null>(cached);
  const [status, setStatus] = useState<'loading' | 'slow' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { inflight = null; setStatus('loading'); setAttempt((n) => n + 1); }, []);

  useEffect(() => {
    if (data) return undefined;
    let cancelled = false;
    const slow = window.setTimeout(() => { if (!cancelled) setStatus((s) => (s === 'loading' ? 'slow' : s)); }, SLOW_MS);
    load().then(
      (loaded) => { if (!cancelled) setData(loaded); },
      () => { if (!cancelled) setStatus('error'); },
    );
    return () => { cancelled = true; window.clearTimeout(slow); };
  }, [data, attempt]);

  return data ? { status: 'ready', data } : { status, data: null, retry };
}
