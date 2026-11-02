import { useRef } from 'react';
import { PullToRefreshRef } from '@/components/common/PullToRefresh';

export function usePullToRefresh() {
  const ref = useRef<PullToRefreshRef>(null);

  /**
   * 触发下拉刷新悬浮圈
   * @param customAction 可选：在下拉刷新期间执行的自定义任务（如保存接口）
   */
  const trigger = async (customAction?: () => Promise<void>) => {
    if (!ref.current) return;
    await ref.current.trigger(customAction);
  };

  return { ref, trigger };
}
