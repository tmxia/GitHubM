

const SAFE_PROTOCOL = /^(https?:\/\/|mailto:|tel:)/i;
const HTTP_PROTOCOL = /^https?:\/\//i;

const APP_INTERNAL_HOSTS = ['appassets.androidplatform.net', 'localhost', '127.0.0.1'];

interface NativeBridge {
  openExternal?: (url: string) => void;
}

function getBridge(): NativeBridge | null {
  const candidate = (window as unknown as { AndroidBridge?: unknown }).AndroidBridge;
  return candidate && typeof candidate === 'object' ? (candidate as NativeBridge) : null;
}

function isSafeUrl(url: string): boolean {
  return SAFE_PROTOCOL.test(url);
}

export function isNativeWebView(): boolean {
  return typeof window !== 'undefined' && getBridge() !== null;
}

function isAppInternalUrl(url: string): boolean {
  if (/^file:\/\//i.test(url)) return true;
  try {
    const base = typeof window !== 'undefined' ? window.location.href : undefined;
    const { hostname } = new URL(url, base);
    return APP_INTERNAL_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

const rawWindowOpen: typeof window.open | undefined =
  typeof window !== 'undefined' && typeof window.open === 'function' ? window.open : undefined;

function navigateInWebView(url: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!isNativeWebView()) return false;
  if (!HTTP_PROTOCOL.test(url)) return false;
  if (isAppInternalUrl(url)) return false;
  try {
    window.location.href = url;
    return true;
  } catch (err) {
    console.warn('[open-external] WebView 导航失败', err);
    return false;
  }
}

function callWindowOpen(url: string, target = '_blank', features?: string): boolean {
  if (!rawWindowOpen) return false;
  try {
    rawWindowOpen.call(window, url, target, features);
    return true;
  } catch (err) {
    console.warn('[open-external] window.open 调用失败', err);
    return false;
  }
}

export function openExternalUrl(rawUrl?: string | null): void {
  const url = (rawUrl || '').trim();
  if (!url || !isSafeUrl(url)) return;

  const bridge = getBridge();
  if (typeof bridge?.openExternal === 'function') {
    try {
      bridge.openExternal(url);
      return;
    } catch (err) {
      console.warn('[open-external] 原生桥打开失败，降级为 WebView 导航', err);
    }
  }

  if (navigateInWebView(url)) return;

  if (callWindowOpen(url, '_blank', 'noopener,noreferrer')) return;

  window.location.href = url;
}

let installed = false;

export function installExternalLinkFix(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;

  if (!isNativeWebView()) return;
  installed = true;

  const patchedOpen = ((url?: string | URL, target?: string, features?: string): Window | null => {
    const href = typeof url === 'string' ? url.trim() : url ? String(url).trim() : '';

    if (href && isSafeUrl(href) && navigateInWebView(href)) return null;

    try {

      return rawWindowOpen ? rawWindowOpen.call(window, url as string, target, features) : null;
    } catch (err) {
      console.warn('[open-external] 代理 window.open 调用失败，降级导航', err);
      if (href && isSafeUrl(href)) {
        window.location.href = href;
      }
      return null;
    }
  }) as typeof window.open;

  try {
    window.open = patchedOpen;
  } catch {
    // 少数环境禁止改写 window.open，忽略
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      const anchor = target.closest('a[target="_blank"]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = (anchor.getAttribute('href') || '').trim();
      if (!href || !isSafeUrl(href)) return;
      event.preventDefault();
      event.stopPropagation();
      openExternalUrl(href);
    },
    true
  );
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installExternalLinkFix(), { once: true });
  } else {
    installExternalLinkFix();
  }
}
