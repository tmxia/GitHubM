import { toast } from 'sonner';
import { useGlobalLoadingStore } from '@/store/useGlobalLoadingStore';
import { TopLoadingIndicator } from '@/components/common/TopLoadingIndicator';
if (typeof (Object as any).hasOwn !== "function") {
  (Object as any).hasOwn = (obj: object, prop: PropertyKey) =>
    Object.prototype.hasOwnProperty.call(obj, prop);
}

if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
  const cr = (typeof crypto !== "undefined" ? crypto : {}) as Crypto;
  (cr as any).randomUUID = (): string => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
}

import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";

(async () => {
  try {
    const enabled = localStorage.getItem("notify_artifact_download") !== "false";
    const bridge = (window as unknown as {
      AndroidBridge?: { setDownloadNotify?: (v: boolean) => void };
    }).AndroidBridge;
    bridge?.setDownloadNotify?.(enabled);
  } catch {}

const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const method = (args[1]?.method || 'GET').toUpperCase();
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  if (isWrite) useGlobalLoadingStore.getState().start();

  try {
    return await originalFetch(...args);
  } finally {
    if (isWrite) useGlobalLoadingStore.getState().stop();
  }
};

const originalToastSuccess = toast.success;
const originalToastError = toast.error;
const originalToastInfo = toast.info;
const originalToastWarning = toast.warning;

const checkToastEnabled = () => {
  try { return localStorage.getItem('app_toast_enabled') !== 'false'; } catch { return true; }
};

toast.success = (...args: any[]) => {
  if (checkToastEnabled()) return originalToastSuccess(...args as [any]);
  return 0;
};
toast.error = (...args: any[]) => {
  if (checkToastEnabled()) return originalToastError(...args as [any]);
  return 0;
};
toast.info = (...args: any[]) => {
  if (checkToastEnabled()) return originalToastInfo(...args as [any]);
  return 0;
};
toast.warning = (...args: any[]) => {
  if (checkToastEnabled()) return originalToastWarning(...args as [any]);
  return 0;
};

createRoot(document.getElementById("root")!).render(
    <AppWrapper>
      <ThemeProvider>
        <>
      <TopLoadingIndicator />
      <App />
    </>
      </ThemeProvider>
    </AppWrapper>
  );
})();
