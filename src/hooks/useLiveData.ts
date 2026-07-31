import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  /** How often to re-fetch, in ms. Default 10s. */
  intervalMs?: number;
  /** Pause polling entirely when false. Default true. */
  enabled?: boolean;
}

interface LiveData<T> {
  data: T | null;
  /** True only during the very first load (drives the full-screen spinner). */
  loading: boolean;
  /** True during a background poll after data is already on screen. */
  refreshing: boolean;
  error: string;
  lastUpdated: Date | null;
  /** Force an immediate re-fetch (e.g. a manual Refresh button). */
  refresh: () => void;
}

// Keeps a list/stat view "live": loads once, then re-fetches on an interval so
// new patients / reports / payments / appointments appear without a manual
// refresh. Background polls don't flash the spinner, only the first load does.
// Polling pauses while the tab is hidden and fires once when it regains focus.
export function useLiveData<T>(fetcher: () => Promise<T>, options: Options = {}): LiveData<T> {
  const { intervalMs = 10000, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Keep the latest fetcher without making `load` depend on its identity, so an
  // inline `() => listX()` fetcher doesn't restart the interval every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const loadedOnce = useRef(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return; // don't stack a poll on top of a slow request
    inFlight.current = true;
    if (loadedOnce.current) setRefreshing(true);
    setError('');
    try {
      const result = await fetcherRef.current();
      setData(result);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      loadedOnce.current = true;
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();

    const id = setInterval(() => {
      if (!document.hidden) load();
    }, intervalMs);

    // Catch up the moment the operator switches back to the tab.
    const onVisibility = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, load]);

  return { data, loading, refreshing, error, lastUpdated, refresh: load };
}
