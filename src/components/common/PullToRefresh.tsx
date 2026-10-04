
import { useRef, useState, useEffect, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
}

export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 70,
  disabled = false,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isAtTop = () => {
      // 兼容多种滚动容器：window / documentElement / body
      // 容差 5px，避免轻微滚动（或恢复滚动位置时差几像素）导致无法触发
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
        if (pullDistanceRef.current > 0) setPullDistance(0);
        return;
      }

      const dist = Math.min(dy * 0.5, threshold * 1.5);
      setPullDistance(dist);

      if (dist > 8) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;

      const cur = pullDistanceRef.current;
      if (cur >= threshold) {
        setRefreshing(true);
        setPullDistance(threshold);
        try {
          await onRefresh();
        } catch {
          /* 忽略错误，由调用方自行 toast */
        } finally {
          setRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [disabled, refreshing, threshold, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = pullDistance > 0 || refreshing;

  return (
    <div ref={containerRef} className="relative">
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center overflow-hidden pointer-events-none"
        style={{
          height: refreshing ? threshold : pullDistance,
          opacity: showIndicator ? 1 : 0,
          transition: pullingRef.current ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
        }}
      >
        <RefreshCw
          className={`w-5 h-5 text-primary ${refreshing ? 'animate-spin' : ''}`}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
          }}
        />
      </div>

      <div
        style={{
          transform: `translateY(${showIndicator ? (refreshing ? threshold : pullDistance) : 0}px)`,
          transition: pullingRef.current ? 'none' : 'transform 0.25s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}
