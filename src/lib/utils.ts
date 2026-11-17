import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function decodeBase64Content(b64: string): string {
  const raw = b64.replace(/\n/g, '');
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return raw;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {}
  try {
    return new TextDecoder('gbk', { fatal: true }).decode(bytes);
  } catch {}
  return new TextDecoder('iso-8859-1').decode(bytes);
}

export type Params = Partial<
  Record<keyof URLSearchParams, string | number | null | undefined>
>;

export function createQueryString(
  params: Params,
  searchParams: URLSearchParams
) {
  const newSearchParams = new URLSearchParams(searchParams?.toString());

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      newSearchParams.delete(key);
    } else {
      newSearchParams.set(key, String(value));
    }
  }

  return newSearchParams.toString();
}

export function formatDate(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: opts.month ?? "long",
    day: opts.day ?? "numeric",
    year: opts.year ?? "numeric",
    ...opts,
  }).format(new Date(date));
}

/** 原生桥（MainActivity.WebAppBridge）暴露的剪贴板写入口 */
interface ClipboardBridge {
  writeClipboard?: (text: string) => void;
}

function getAndroidClipboardBridge(): ClipboardBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { AndroidBridge?: unknown }).AndroidBridge;
  return bridge && typeof bridge === "object" ? (bridge as ClipboardBridge) : null;
}

/**
 * 兜底方案：隐藏 textarea + document.execCommand('copy')。
 * 只做最小干扰：复制后移除临时节点并恢复原有选区。
 */
function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;";
  document.body.appendChild(el);

  const selection = window.getSelection();
  const savedRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  let ok = false;
  try {
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(el);
    if (selection) {
      selection.removeAllRanges();
      if (savedRange) selection.addRange(savedRange);
    }
  }
  return ok;
}

/**
 * 复制文本到剪贴板。
 *
 * 调用链（任一成功即返回 true）：
 * 1. Android 原生桥 writeClipboard —— App 内是 file:// 页面，非安全上下文下
 *    navigator.clipboard 为 undefined，必须走原生（也是 App 内的主路径）；
 * 2. navigator.clipboard.writeText —— 浏览器 / 安全上下文；
 * 3. 隐藏 textarea + execCommand('copy') —— 老 WebView 兜底。
 *
 * execCommand 需要用户手势上下文，调用方应在点击回调里直接 await，
 * 中间不要插入网络请求或长延时。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const value = typeof text === "string" ? text : String(text ?? "");
  if (!value) return false;

  const bridge = getAndroidClipboardBridge();
  if (typeof bridge?.writeClipboard === "function") {
    try {
      bridge.writeClipboard(value);
      return true;
    } catch (err) {
      console.warn("[clipboard] 原生剪贴板写入失败，降级 Web API", err);
    }
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof window !== "undefined" &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}
  }

  return copyViaExecCommand(value);
}
