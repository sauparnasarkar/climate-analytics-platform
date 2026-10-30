import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Any request that succeeds fills the panel, even one that Try again has since overtaken; only the latest one's failure is reported.
  const mounted = useRef(true);
  const latest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (data) return undefined;
    latest.current = attempt;
    const slow = window.setTimeout(() => { if (mounted.current && latest.current === attempt) setStatus((s) => (s === 'loading' ? 'slow' : s)); }, SLOW_MS);
    load().then(
      (loaded) => { if (mounted.current) setData(loaded); },
      () => { if (mounted.current && latest.current === attempt) setStatus('error'); },
    );
    return () => { window.clearTimeout(slow); };
  }, [data, attempt]);

  return data ? { status: 'ready', data } : { status, data: null, retry };
}
