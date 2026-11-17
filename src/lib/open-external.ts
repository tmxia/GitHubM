// 外部链接统一打开入口（普通浏览器 / Android WebView 兼容）
//
// ── 修复记录（避免以后再踩同样的坑）─────────────────────────────
// 0) 【真实根因】MainActivity.setupWebChromeClient 里开了 setSupportMultipleWindows(true)，
//    于是 window.open 由 WebChromeClient.onCreateWindow 接管，而它取地址的方式是：
//        val url = view?.hitTestResult?.extra
//    命中空值时执行：transport?.webView = null; resultMsg?.sendToTarget(); return true
//    即：弹出一个空窗口并「假装成功」，不抛异常。
//    hitTestResult 只反映「上一次触摸落点是不是 <a>」。用户点的是 <button>
//    （如提交历史卡片的「打开」按钮），落点不是链接 → extra 恒为 null → 静默失败。
//    ⇒ 在 App 内，从按钮发起的 window.open 永远打不开，且无法从 JS 侧感知。
//    ⇒ 唯一被原生明确支持的出口是「主文档导航」：location.href 会进入
//      shouldOverrideUrlLoading，那里对非本地 URL 做 ACTION_VIEW 且 return true，
//      WebView 不会真的离开当前页。
// 1) 「window.open 在 App 内本来就是有效的」这句话是错的，别再用它当结论。
//    <a target="_blank"> 之所以能跳，是因为 hitTestResult 命中了 <a>，与 JS 调用姿势无关。
// 2) 曾经把 window.open 存成变量后裸调用：
//        const raw = window.open; raw(url, '_blank');
//    window.open 是 WebIDL 方法，脱离 window 调用会抛 TypeError: Illegal invocation。
//    → 必须用 rawWindowOpen.call(window, ...) 或 bind(window) 之后再调用。
// 3) 'noopener' 按规范会让 window.open 恒返回 null，所以返回值不能作为成功判据。
//    而本轮这个 bug 恰恰是「不抛异常 = 判定成功」的判据失效导致的，两种判据都不可靠，
//    因此 App 内不再依赖 window.open 的成功性。
//
// ── 策略 ───────────────────────────────────────────────────
// 1) 原生桥若暴露 openExternal，优先调用（直接跳系统浏览器）。
// 2) App 内（存在 AndroidBridge）且目标是 http(s) 外链：改为主文档导航 location.href，
//    交给 shouldOverrideUrlLoading → ACTION_VIEW（github.com 会先试 github:// 唤起 GitHub App）。
//    目标是 App 自身页面（appassets.androidplatform.net / localhost / 127.0.0.1 / file://）时跳过，
//    避免把应用导航到开发服务器。
// 3) 普通浏览器：保持 window.open(url, '_blank', 'noopener,noreferrer') 新标签页语义。
// 4) 仅当调用本身抛异常（或环境不存在 window.open）时，才退化为 location.href 导航。
//
// 本模块被 import 时自动安装全局兜底（幂等）。注意：必须由入口文件（main.tsx）
// 在首屏渲染前 import，否则历史代码里的 <a target="_blank"> 兜底不会生效。

const SAFE_PROTOCOL = /^(https?:\/\/|mailto:|tel:)/i;
const HTTP_PROTOCOL = /^https?:\/\//i;

// App 自身页面所在的主机名：这些地址不能交给系统浏览器，必须在 WebView 内部消化
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

/** 是否运行在带原生桥的 Android WebView 容器中 */
export function isNativeWebView(): boolean {
  return typeof window !== 'undefined' && getBridge() !== null;
}

/** 是否指向 App 自身资源（web 资源包 / 本地开发服务器） */
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

// 保存原生实现，避免安装全局补丁后调用自身形成递归
const rawWindowOpen: typeof window.open | undefined =
  typeof window !== 'undefined' && typeof window.open === 'function' ? window.open : undefined;

/**
 * App 内打开外部链接的唯一可靠方式：把 URL 交给主文档导航，
 * 由原生 shouldOverrideUrlLoading 用 ACTION_VIEW / github:// 转交系统。
 *
 * 只处理 http(s)：mailto:/tel: 不在原生拦截的覆盖范围内，交给下方 window.open 尝试。
 */
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

/**
 * 以正确的 receiver 调用原生 window.open。
 *
 * 返回值只表示「调用是否成功发出」，不表示窗口真的开了 ——
 * 带 'noopener' 时规范要求返回 null，App 内 onCreateWindow 取不到 URL 时也会「假装成功」。
 */
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

/**
 * 打开外部链接。
 * 非 http(s)/mailto/tel 协议会被忽略，避免 javascript: 之类的注入。
 */
export function openExternalUrl(rawUrl?: string | null): void {
  const url = (rawUrl || '').trim();
  if (!url || !isSafeUrl(url)) return;

  // 1) 原生桥：直接交给系统浏览器（需要 MainActivity 侧实现 openExternal）
  const bridge = getBridge();
  if (typeof bridge?.openExternal === 'function') {
    try {
      bridge.openExternal(url);
      return;
    } catch (err) {
      console.warn('[open-external] 原生桥打开失败，降级为 WebView 导航', err);
    }
  }

  // 2) App 内：window.open 必然落进 onCreateWindow 的空窗口分支，只能走主文档导航
  if (navigateInWebView(url)) return;

  // 3) 普通浏览器：新窗口 / 新标签页，与历史行为一致
  if (callWindowOpen(url, '_blank', 'noopener,noreferrer')) return;

  // 4) 仅在调用本身失败时退化（浏览器 window.open 缺失、被改写抛错等）
  window.location.href = url;
}

let installed = false;

/**
 * 安装全局兜底（幂等）：
 * 1) 代理 window.open：App 内对 http(s) 外链改走主文档导航，其余环境等价转发原生行为。
 * 2) 捕获阶段拦截 <a target="_blank"> 点击，交给 openExternalUrl 统一处理。
 */
export function installExternalLinkFix(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  // 桥未注入时不要置位 installed，否则后续重试会被永久跳过
  if (!isNativeWebView()) return;
  installed = true;

  const patchedOpen = ((url?: string | URL, target?: string, features?: string): Window | null => {
    const href = typeof url === 'string' ? url.trim() : url ? String(url).trim() : '';

    // App 内对 http(s) 外链改走主文档导航，绕开 onCreateWindow 的静默失败
    if (href && isSafeUrl(href) && navigateInWebView(href)) return null;

    try {
      // 必须带 receiver，否则 Illegal invocation
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

// 自安装：放在模块末尾，保证 installExternalLinkFix 已定义
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installExternalLinkFix(), { once: true });
  } else {
    installExternalLinkFix();
  }
}
