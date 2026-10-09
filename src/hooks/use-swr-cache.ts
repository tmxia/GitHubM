


import { useCallback, useEffect, useRef, useState } from 'react';
import { pageCache } from '@/lib/page-cache';

interface SWROptions {
  ttl?: number;
  enabled?: boolean;
}

export function useSWRCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SWROptions = {},
) {
  const { ttl, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setRefreshing(true);
    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current) return;
      setData(result);
      setError(null);
      pageCache.set(key, result, ttl);
    } catch (e) {
      if (mountedRef.current) setError(e);
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [key, ttl, enabled]);

  useEffect(() => {
    mountedRef.current = true;

    
    const fresh = pageCache.get<T>(key);
    if (fresh !== null) {
      setData(fresh);
      setLoading(false);
      return () => { mountedRef.current = false; };
    }

    
    const stale = pageCache.getStale<T>(key);
    if (stale) {
      setData(stale.data);
      setLoading(false);
      refresh();
      return () => { mountedRef.current = false; };
    }

    
    refresh();
    return () => { mountedRef.current = false; };
  }, [key, refresh]);

  return { data, loading, refreshing, error, refresh };
}
