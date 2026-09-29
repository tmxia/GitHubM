import { useEffect, useState } from 'react';
import { getRepo } from '@/services/github';

interface RepoPermissions {
  canPush: boolean;
  canAdmin: boolean;
  loading: boolean;
}

export function useRepoPermissions(owner?: string, repo?: string): RepoPermissions {
  const [canPush, setCanPush] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!owner || !repo) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getRepo(owner, repo);
        if (cancelled) return;
        const p = data.permissions;
        setCanPush(!!(p?.push || p?.admin));
        setCanAdmin(!!p?.admin);
      } catch {
        if (!cancelled) {
          setCanPush(false);
          setCanAdmin(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo]);

  return { canPush, canAdmin, loading };
}
