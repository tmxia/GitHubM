import { useGlobalLoadingStore } from '@/store/useGlobalLoadingStore';

export async function withLoading<T>(task: () => Promise<T>): Promise<T> {
  useGlobalLoadingStore.getState().start();
  try {
    return await task();
  } finally {
    useGlobalLoadingStore.getState().stop();
  }
}
