import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * 路由级滚动位置记忆：
 * 1. 记录每个页面离开时的滚动高度。
 * 2. 返回(POP)时，智能等待异步数据渲染完(页面高度足够)后，平滑滚回原位置。
 * 3. 进入新页面(PUSH)时，自动置顶。
 */
export default function RouteScrollManager() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();
  const key = pathname + search;

  // 使用 useRef 存滚动位置，避免触发组件重渲染
  const scrollPositions = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // 如果用户是点返回/前进 (POP)
    if (navType === 'POP') {
      const saved = scrollPositions.current.get(key);
      if (saved !== undefined) {
        let attempts = 0;
        // 核心兼容：因为页面是异步加载数据的，DOM 高度可能还没撑开
        // 轮询检查页面实际高度，足够时才滚动
        const tryScroll = () => {
          if (document.documentElement.scrollHeight > saved || attempts > 20) {
            window.scrollTo({ top: saved, behavior: 'instant' });
          } else {
            attempts++;
            requestAnimationFrame(tryScroll);
          }
        };
        tryScroll();
      }
    } else {
      // 如果是新进入页面 (PUSH/REPLACE)，强制回到顶部
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    // 离开当前页面时，记录当前的滚动高度
    return () => {
      scrollPositions.current.set(key, window.scrollY);
    };
  }, [key, navType]);

  return null;
}
