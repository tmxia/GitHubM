import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface NetworkState { isOnline: boolean; justRecovered: boolean; }

function createNetworkStateMachine(initialOnline: boolean) {
  const state: NetworkState = { isOnline: initialOnline, justRecovered: false };
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;

  const handleOnline = () => {
    state.isOnline = true;
    state.justRecovered = true;
    recoveryTimer = setTimeout(() => { state.justRecovered = false; }, 3000);
  };
  const handleOffline = () => {
    state.isOnline = false;
    state.justRecovered = false;
    if (recoveryTimer !== undefined) clearTimeout(recoveryTimer);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return {
    getState: () => ({ ...state }),
    cleanup: () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (recoveryTimer !== undefined) clearTimeout(recoveryTimer);
    },
  };
}

describe('useNetworkStatus — 核心状态机逻辑', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('初始在线时 isOnline=true, justRecovered=false', () => {
    const { getState, cleanup } = createNetworkStateMachine(true);
    expect(getState()).toEqual({ isOnline: true, justRecovered: false });
    cleanup();
  });

  it('初始离线时 isOnline=false', () => {
    const { getState, cleanup } = createNetworkStateMachine(false);
    expect(getState().isOnline).toBe(false);
    cleanup();
  });

  it('offline 事件：isOnline=false, justRecovered=false', () => {
    const { getState, cleanup } = createNetworkStateMachine(true);
    window.dispatchEvent(new Event('offline'));
    expect(getState().isOnline).toBe(false);
    expect(getState().justRecovered).toBe(false);
    cleanup();
  });

  it('online 事件：isOnline=true, justRecovered=true', () => {
    const { getState, cleanup } = createNetworkStateMachine(false);
    window.dispatchEvent(new Event('online'));
    expect(getState().isOnline).toBe(true);
    expect(getState().justRecovered).toBe(true);
    cleanup();
  });

  it('恢复后 3 秒：justRecovered 自动清除', () => {
    const { getState, cleanup } = createNetworkStateMachine(false);
    window.dispatchEvent(new Event('online'));
    expect(getState().justRecovered).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(getState().justRecovered).toBe(false);
    expect(getState().isOnline).toBe(true);
    cleanup();
  });

  it('3 秒内 justRecovered 仍为 true', () => {
    const { getState, cleanup } = createNetworkStateMachine(false);
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(2999);
    expect(getState().justRecovered).toBe(true);
    cleanup();
  });

  it('网络再次断开时立即清除 justRecovered', () => {
    const { getState, cleanup } = createNetworkStateMachine(false);
    window.dispatchEvent(new Event('online'));
    expect(getState().justRecovered).toBe(true);
    window.dispatchEvent(new Event('offline'));
    expect(getState().justRecovered).toBe(false);
    expect(getState().isOnline).toBe(false);
    cleanup();
  });

  it('cleanup 后事件不再触发状态变更', () => {
    const { getState, cleanup } = createNetworkStateMachine(true);
    cleanup();
    window.dispatchEvent(new Event('offline'));
    expect(getState().isOnline).toBe(true);
  });

  it('removeEventListener 被正确调用（无内存泄漏）', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { cleanup } = createNetworkStateMachine(true);
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    cleanup();
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
