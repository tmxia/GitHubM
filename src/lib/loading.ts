import { useGlobalLoadingStore } from '@/store/useGlobalLoadingStore';

/**
 * 全局统一的异步任务包裹器
 * 自动触发顶部悬浮圈，执行完毕后自动关闭
 */
export async function withLoading<T>(task: () => Promise<T>): Promise<T> {
  useGlobalLoadingStore.getState().start();
  try {
    return await task();
  } finally {
    useGlobalLoadingStore.getState().stop();
  }
}
