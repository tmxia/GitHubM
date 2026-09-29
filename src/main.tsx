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

  createRoot(document.getElementById("root")!).render(
    <AppWrapper>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AppWrapper>
  );
})();
