import { create } from 'zustand';

interface GlobalLoadingState {
  count: number;
  progress: number; // 0 到 1，用于下拉手势
  start: () => void;
  stop: () => void;
  setProgress: (val: number) => void;
}

export const useGlobalLoadingStore = create<GlobalLoadingState>((set) => ({
  count: 0,
  progress: 0,
  start: () => set((state) => ({ count: state.count + 1 })),
  stop: () => set((state) => ({ count: Math.max(0, state.count - 1) })),
  setProgress: (val) => set({ progress: val }),
}));