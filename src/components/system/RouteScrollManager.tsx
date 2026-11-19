import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export default function RouteScrollManager() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();
  const key = pathname + search;

  const scrollPositions = useRef<Map<string, number>>(new Map());

  useEffect(() => {

    if (navType === 'POP') {
      const saved = scrollPositions.current.get(key);
      if (saved !== undefined) {
        let attempts = 0;

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

      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    return () => {
      scrollPositions.current.set(key, window.scrollY);
    };
  }, [key, navType]);

  return null;
}
