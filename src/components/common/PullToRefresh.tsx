import { useRef, useState, useEffect, type ReactNode, forwardRef, useImperativeHandle } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
}

export interface PullToRefreshRef {
  trigger: () => Promise<void>;
}

const PullToRefresh = forwardRef<PullToRefreshRef, PullToRefreshProps>(({
  onRefresh,
  children,
  threshold = 70,
  disabled = false,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0); 
  
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const distRef = useRef(0);

  useImperativeHandle(ref, () => ({
    trigger: async () => {
      if (refreshing || disabled) return;
      setRefreshing(true);
      setPullProgress(1);
      try {
        await onRefresh();
      } catch {} finally {
        setTimeout(() => {
          setRefreshing(false);
          setPullProgress(0);
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
          setPullProgress(0);
        }
        return;
      }

      const dist = Math.min(dy * 0.3, threshold * 1.2);
      if (dist > 5) {
        if (e.cancelable) e.preventDefault(); 
      }
      
      distRef.current = dist;
      const progress = Math.min(dist / threshold, 1);
      if (Math.abs(progress - pullProgress) > 0.02) {
        setPullProgress(progress);
      }
    };

    const handleTouchEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;

      const cur = distRef.current;
      if (cur >= threshold * 0.8) {
        setRefreshing(true);
        setPullProgress(1);
        try {
          await onRefresh();
        } catch {}
        finally {
          setTimeout(() => {
            setRefreshing(false);
            setPullProgress(0);
            distRef.current = 0;
          }, 300);
        }
      } else {
        setPullProgress(0);
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
      <div
        className="fixed left-1/2 z-50 flex items-center justify-center rounded-full bg-background border border-border shadow-md transition-all duration-300 pointer-events-none"
        style={{
          top: 0,
          width: '36px',
          height: '36px',
          opacity: indicatorOpacity,
          transform: `translate(-50%, ${translateY}px) scale(${refreshing ? 1 : 0.8 + pullProgress * 0.2})`,
          visibility: indicatorOpacity > 0.05 ? 'visible' : 'hidden',
        }}
      >
        {refreshing ? (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        ) : (
          <svg
            className="w-5 h-5 text-primary transition-transform"
            style={{ transform: `rotate(${pullProgress * 360}deg)` }}
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
      </div>

      <div className="relative z-10 w-full min-h-screen bg-background">
        {children}
      </div>
    </div>
  );
});

PullToRefresh.displayName = 'PullToRefresh';
export default PullToRefresh;
