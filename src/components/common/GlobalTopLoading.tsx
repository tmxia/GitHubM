import { useGlobalLoadingStore } from '@/store/useGlobalLoadingStore';
import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

export function GlobalTopLoading() {
  const count = useGlobalLoadingStore((state) => state.count);
  if (count === 0) return null;

  return createPortal(
    <div
      className="fixed left-1/2 z-[9999] flex items-center justify-center rounded-full bg-background border border-border shadow-md pointer-events-none transition-all duration-300"
      style={{
        top: 0,
        width: '36px',
        height: '36px',
        transform: 'translate(-50%, 16px)', // 与下拉刷新一模一样的固定位置偏移
        opacity: 1,
      }}
    >
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
    </div>,
    document.body
  );
}
