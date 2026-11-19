import { create } from 'zustand';
import type { GitHubRateLimit } from '@/types/types';
import { getRateLimit } from '@/services/github';

interface RateLimitState {
  /** 当前限流配额，null 表示尚未加载 */
  rate: GitHubRateLimit | null;
  /** 是否正在手动/自动刷新 */
  refreshing: boolean;
  setRate: (rate: GitHubRateLimit | null) => void;
  refresh: () => Promise<void>;
  clear: () => void;
}

/**
 * 限流配额独立 store：该数据每 60s 轮询刷新，若挂在 AuthContext 上，
 * 每次刷新都会牵动全部 useAuth 消费者重渲染。拆分后只有订阅本 store 的
 * 侧边栏/顶栏/设置页会随限流更新而重渲染。
 */
export const useRateLimitStore = create<RateLimitState>()((set) => ({
  rate: null,
  refreshing: false,
  setRate: (rate) => set({ rate }),
  refresh: async () => {
    set({ refreshing: true });
    try {
      const { rate } = await getRateLimit();
      set({ rate });
    } catch {
      // 刷新失败保留上一次配额，不清空
    } finally {
      set({ refreshing: false });
    }
  },
  clear: () => set({ rate: null, refreshing: false }),
}));
