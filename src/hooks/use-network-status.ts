import { useState, useEffect } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  justRecovered: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [justRecovered, setJustRecovered] = useState(false);

  useEffect(() => {
    let recoveryTimer: ReturnType<typeof setTimeout>;

    const handleOnline = () => {
      setIsOnline(true);
      setJustRecovered(true);
      recoveryTimer = setTimeout(() => setJustRecovered(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustRecovered(false);
      clearTimeout(recoveryTimer);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(recoveryTimer);
    };
  }, []);

  return { isOnline, justRecovered };
}
