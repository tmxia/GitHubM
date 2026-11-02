import { useRef } from 'react';
import { PullToRefreshRef } from '@/components/common/PullToRefresh';

export function usePullToRefresh() {
  const ref = useRef<PullToRefreshRef>(null);

  const trigger = async (customAction?: () => Promise<void>) => {
    if (!ref.current) return;
    await ref.current.trigger(customAction);
  };

  return { ref, trigger };
}
