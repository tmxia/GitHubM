import { WifiOff, Wifi } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import i18n from "@/i18n";

export function NetworkStatusBanner() {
  const { isOnline, justRecovered } = useNetworkStatus();

  if (isOnline && !justRecovered) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2',
        'px-4 py-2 text-xs font-medium transition-all duration-300',
        isOnline
          ? 'bg-green-600 text-white'
          : 'bg-destructive text-destructive-foreground',
      ].join(' ')}
    >
      {isOnline ? (
        <>
          <Wifi className="w-3.5 h-3.5 shrink-0" />
          <span>{i18n.t('网络已恢复')}</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>{i18n.t('网络已断开，请检查网络连接')}</span>
        </>
      )}
    </div>
  );
}
