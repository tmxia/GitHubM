// 外部链接统一打开入口（普通浏览器 / Android WebView 兼容）
//
// 背景：项目内「打开」类操作此前直接使用 window.open(url, '_blank', 'noopener,noreferrer')。
// - Android WebView 中 target="_blank" / window.open 依赖 WebChromeClient.onCreateWindow，
//   未实现该回调时点击会被静默丢弃，表现就是「点了没反应」。
// - 'noopener' 在规范上会让 window.open 一律返回 null，所以不能用返回值判断浏览器里是否成功。
//
// 策略：
// 1) 原生桥提供 openExternal 时优先调用（直接跳系统浏览器）。
// 2) 普通浏览器：保留原生新标签页行为，不做任何干预。
// 3) Android WebView：window.open 返回 null 时退化为 location 导航，
//    交给 WebViewClient.shouldOverrideUrlLoading 处理（未实现时至少能内嵌打开）。
//
// 本模块在被 import 时自动安装全局兜底（幂等），因此历史代码里的
// window.open(..., 'noopener,noreferrer') 与 <a target="_blank"> 无需逐个改写。
// 注意：必须由入口文件（main.tsx）在首屏渲染前 import，否则补丁不会生效。

const SAFE_PROTOCOL = /^(https?:\/\/|mailto:|tel:)/i;

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

/** 是否运行在带原生桥的 Android WebView 容器中 */
export function isNativeWebView(): boolean {
  return typeof window !== 'undefined' && getBridge() !== null;
}

// 保存原生实现，避免安装全局补丁后调用自身形成递归
const rawWindowOpen: typeof window.open | undefined =
  typeof window !== 'undefined' && typeof window.open === 'function' ? window.open : undefined;

function openInNewTab(url: string): Window | null {
  if (!rawWindowOpen) return null;
  try {
    return rawWindowOpen(url, '_blank');
  } catch {
    return null;
  }
}

function clearOpener(win: Window | null): void {
  if (!win) return;
  try {
    win.opener = null;
  } catch {
    // 跨域窗口设置 opener 可能抛错，忽略
  }
}

/**
 * 打开外部链接。
 * 非 http(s)/mailto/tel 协议会被忽略，避免 javascript: 之类的注入。
 */
export function openExternalUrl(rawUrl?: string | null): void {
  const url = (rawUrl || '').trim();
  if (!url || !isSafeUrl(url)) return;

  const bridge = getBridge();
  if (bridge?.openExternal) {
    try {
      bridge.openExternal(url);
      return;
    } catch (err) {
      console.warn('[openExternalUrl] 原生桥打开失败，降级处理', err);
    }
  }

  if (!isNativeWebView()) {
    const win = openInNewTab(url);
    if (win) {
      clearOpener(win);
      return;
    }
    window.location.href = url;
    return;
  }

  // Android WebView：onCreateWindow 未实现时 window.open 返回 null，退化为导航
  const win = openInNewTab(url);
  if (win) {
    clearOpener(win);
    return;
  }
  window.location.href = url;
}

let installed = false;

/**
 * 安装全局兜底（幂等）：
 * 1) WebView 中 window.open 返回 null 时退化为 location 导航。
 * 2) 捕获阶段拦截 <a target="_blank"> 点击，避免被 WebView 静默丢弃。
 * 普通浏览器中不做任何改写，保持原生新标签页行为。
 */
export function installExternalLinkFix(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  // 桥未注入时不要置位 installed，否则后续重试会被永久跳过
  if (!isNativeWebView() || !rawWindowOpen) return;
  installed = true;

  const patchedOpen = ((url?: string | URL, target?: string, features?: string): Window | null => {
    const href = typeof url === 'string' ? url.trim() : url ? String(url).trim() : '';
    const win = rawWindowOpen(url as string, target, features);
    if (win) return win;
    if (href && isSafeUrl(href)) {
      window.location.href = href;
    }
    return null;
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

// 自安装：放在模块末尾，保证 installExternalLinkFix 已定义
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installExternalLinkFix(), { once: true });
  } else {
    installExternalLinkFix();
  }
}
