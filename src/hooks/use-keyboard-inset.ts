// 软键盘遮挡高度（Android WebView / iOS Safari）
// 通过 visualViewport 计算键盘弹出后被遮挡的视口高度，供聊天输入区上移。
// 说明：窗口 resize 在部分 WebView 下不触发或提前触发，visualViewport 更可靠。
import { useEffect, useState } from 'react';

/** 判定键盘已弹出的最小高度；低于该值多为地址栏/工具栏收缩引起的视口变化 */
const OPEN_THRESHOLD = 120;

/** 高度变化小于等于该值时视为抖动，不触发重渲染 */
const HYSTERESIS_PX = 1;

export interface KeyboardInsetState {
  /** 键盘遮挡的高度（px），未弹出时为 0 */
  keyboardInset: number;
  /** 键盘是否已弹出（keyboardInset 超过阈值） */
  isKeyboardOpen: boolean;
}

function readInset(): number {
  if (typeof window === 'undefined') return 0;
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  // 布局视口高度 -（可视视口高度 + 顶部偏移）= 底部被遮挡高度
  const inset = Math.round(window.innerHeight - (viewport.height + viewport.offsetTop));
  return inset > 0 ? inset : 0;
}

export function useKeyboardInset(): KeyboardInsetState {
  const [inset, setInset] = useState<number>(readInset);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = readInset();
        setInset(prev => (Math.abs(prev - next) <= HYSTERESIS_PX ? prev : next));
      });
    };

    // 挂载后同步一次，避免初始渲染与真实视口不一致
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return { keyboardInset: inset, isKeyboardOpen: inset > OPEN_THRESHOLD };
}
