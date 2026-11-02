import { useGlobalLoadingStore } from '@/store/useGlobalLoadingStore';
import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

export function GlobalTopLoading() {
  const count = useGlobalLoadingStore((state) => state.count);
  if (count === 0) return null;

  return createPortal(
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center justify-center w-10 h-10 rounded-full bg-background border border-border shadow-md pointer-events-none animate-in fade-in slide-in-from-top-4">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
    </div>,
    document.body
  );
}