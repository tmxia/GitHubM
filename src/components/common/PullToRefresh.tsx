import { useGlobalLoadingStore } from '@/store/useGlobalLoadingStore';
import { useRef, useState, useEffect, type ReactNode, forwardRef, useImperativeHandle } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
}

export interface PullToRefreshRef {
  trigger: (customAction?: () => Promise<void>) => Promise<void>;
}

const PullToRefresh = forwardRef<PullToRefreshRef, PullToRefreshProps>(({
  onRefresh,
  children,
  threshold = 70,
  disabled = false,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
   
  
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const distRef = useRef(0);

  useImperativeHandle(ref, () => ({
    trigger: async (customAction?: () => Promise<void>) => {
      if (refreshing || disabled) return;
      useGlobalLoadingStore.getState().start();
      useGlobalLoadingStore.getState().setProgress(1);
      try {
        if (customAction) {
          await customAction();
        }
        await onRefresh();
      } catch {} finally {
        setTimeout(() => {
          useGlobalLoadingStore.getState().stop();
          useGlobalLoadingStore.getState().setProgress(0);
        }, 300);
      }
    }
  }));

  useEffect(() => {
    document.body.style.overscrollBehaviorY = 'contain';

    const isAtTop = () => {
      const y = Math.max(
        window.scrollY || 0,
        window.pageYOffset || 0,
        document.documentElement.scrollTop || 0,
        document.body.scrollTop || 0,
      );
      return y <= 5;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (disabled || refreshing) return;
      if (!isAtTop()) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || disabled || refreshing) return;
      const dy = e.touches[0].clientY - startYRef.current;

      if (dy <= 0) {
        if (distRef.current > 0) {
          distRef.current = 0;
          useGlobalLoadingStore.getState().setProgress(0);
        }
        return;
      }

      const dist = Math.min(dy * 0.3, threshold * 1.2);
      if (dist > 5) {
        if (e.cancelable) e.preventDefault(); 
      }
      
      distRef.current = dist;
      const progress = Math.min(dist / threshold, 1);
      useGlobalLoadingStore.getState().setProgress(progress);
    };

    const handleTouchEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;

      const cur = distRef.current;
      if (cur >= threshold * 0.8) {
        useGlobalLoadingStore.getState().start();
        useGlobalLoadingStore.getState().setProgress(1);
        try {
          await onRefresh();
        } catch {}
        finally {
          setTimeout(() => {
            useGlobalLoadingStore.getState().stop();
            useGlobalLoadingStore.getState().setProgress(0);
            distRef.current = 0;
          }, 300);
        }
      } else {
        useGlobalLoadingStore.getState().setProgress(0);
        distRef.current = 0;
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.body.style.overscrollBehaviorY = '';
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [disabled, refreshing, threshold, onRefresh, pullProgress]);

  const indicatorOpacity = refreshing ? 1 : pullProgress;
  const translateY = refreshing ? 16 : Math.max(16, pullProgress * threshold * 0.8 + 16);

  return (
    <div ref={containerRef} className="relative w-full min-h-screen bg-background">
      

      <div className="relative z-10 w-full min-h-screen bg-background">
        {children}
      </div>
    </div>
  );
});

PullToRefresh.displayName = 'PullToRefresh';
export default PullToRefresh;
