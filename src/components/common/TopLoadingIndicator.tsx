import { useGlobalLoadingStore } from '@/store/useGlobalLoadingStore';
import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

export function TopLoadingIndicator() {
  const count = useGlobalLoadingStore((state) => state.count);
  const progress = useGlobalLoadingStore((state) => state.progress);

  // 只要满足：有请求在进行 (count > 0) 或者 下拉进度达标 (progress >= 1) 就显示
  const isRefreshing = count > 0 || progress >= 1;
  const opacity = isRefreshing ? 1 : progress;
  const translateY = isRefreshing ? 16 : Math.max(16, progress * 56 + 16);

  if (opacity <= 0.05) return null;

  return createPortal(
    <div
      className="fixed left-1/2 z-[9999] flex items-center justify-center rounded-full bg-background border border-border shadow-md pointer-events-none transition-all duration-300"
      style={{
        top: 0,
        width: '36px',
        height: '36px',
        opacity: opacity,
        transform: `translate(-50%, ${translateY}px) scale(${isRefreshing ? 1 : 0.8 + progress * 0.2})`,
        visibility: opacity > 0.05 ? 'visible' : 'hidden',
      }}
    >
      {isRefreshing ? (
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      ) : (
        <svg
          className="w-5 h-5 text-primary transition-transform"
          style={{ transform: `rotate(${progress * 360}deg)` }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      )}
    </div>,
    document.body
  );
}