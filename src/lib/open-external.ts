// 外部链接统一打开入口（普通浏览器 / Android WebView 兼容）
//
// ── 修复记录（避免以后再踩同样的坑）─────────────────────────────
// 1) 历史写法 window.open(url, '_blank', 'noopener,noreferrer') 在 App 内本来就是有效的，
//    任何重构都必须先复现这条路径，而不是用「返回值是否为 null」猜成功与否。
// 2) 曾经把 window.open 存成变量后裸调用：
//        const raw = window.open; raw(url, '_blank');
//    window.open 是 WebIDL 方法，脱离 window 调用会抛 TypeError: Illegal invocation。
//    异常被 catch 吞掉 → 代码退化成 location.href → WebView 拦截顶层跳转 → 表现为「点了没反应」。
//    → 必须用 rawWindowOpen.call(window, ...) 或 bind(window) 之后再调用。
// 3) 'noopener' 按规范会让 window.open 恒返回 null，所以返回值不能作为成功判据，
//    只能用「调用是否抛异常」判断，否则会把成功的打开误判为失败并触发错误的降级。
// 4) 【「提交历史」卡片「打开」按钮点击无反应 · 根因】
//    MainActivity 设置了 setSupportMultipleWindows(true)，window.open 由
//    WebChromeClient.onCreateWindow 接管，而它只能用 view.hitTestResult.extra 取目标 URL
//    —— 只有「手指正好点在 <a> 链接上」时该值才非空。
//    从 <button> 的 onClick 里发起的 programmatic window.open 取不到 URL，于是走进
//        transport?.webView = null; resultMsg?.sendToTarget(); return true
//    这条分支：弹出一个空窗口，既不抛异常也没打开任何页面 —— 本模块既无法感知失败，
//    也就永远不会降级，最终表现就是「点了没反应」。
//    另外原生桥 AndroidBridge 从未实现 openExternal，策略 1 一直是空转，问题因此被长期掩盖。
//    → App 内 WebView 改为直接做主文档导航：WebViewClient.shouldOverrideUrlLoading 会把外链
//      用 startActivity(ACTION_VIEW) 交给系统（github.com 还会转成 github:// 唤起 GitHub App），
//      并 return true 表示已处理，WebView 不会真的离开当前页面。
//
// ── 策略 ───────────────────────────────────────────────────
// 1) Android WebView：优先 window.location.href 做主文档导航，交给原生 shouldOverrideUrlLoading。
//    例外：目标指向 App 自身页面（appassets / localhost / file:）时不这么做，
//    否则会把应用导航到开发服务器而无法返回。
// 2) 原生桥若将来补上 openExternal 实现，则作为第二选择调用。
// 3) 普通浏览器：window.open(url, '_blank', 'noopener,noreferrer')，与历史行为一致。
// 4) 以上都不可用（含调用抛异常）时才退化为 location.href 导航。
//
// 本模块被 import 时自动安装全局兜底（幂等）。注意：必须由入口文件（main.tsx）
// 在首屏渲染前 import，否则历史代码里的 <a target="_blank"> 兜底不会生效。

const SAFE_PROTOCOL = /^(https?:\/\/|mailto:|tel:)/i;

/** App 自身页面的特征：Capacitor appassets 虚拟域、本地端口、打包产物 file: */
const APP_ORIGIN_HINTS = ['appassets.androidplatform.net', '://localhost', '://127.0.0.1', 'file:///'];

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

/** 目标是否为 App 自身页面（这类 URL 不能用 location.href，会把应用导航走） */
function targetsAppOrigin(url: string): boolean {
  const lower = url.toLowerCase();
  return APP_ORIGIN_HINTS.some((hint) => lower.includes(hint));
}

/** 是否运行在带原生桥的 Android WebView 容器中 */
export function isNativeWebView(): boolean {
  return typeof window !== 'undefined' && getBridge() !== null;
}

// 保存原生实现，避免安装全局补丁后调用自身形成递归
const rawWindowOpen: typeof window.open | undefined =
  typeof window !== 'undefined' && typeof window.open === 'function' ? window.open : undefined;

/**
 * 以正确的 receiver 调用原生 window.open。
 *
 * 返回值只表示「调用是否成功发出」，不表示窗口真的开了 ——
 * 带 'noopener' 时规范要求返回 null，WebView 未实现 onCreateWindow 时同样返回 null。
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

  // 1) App 内 WebView：直接导航，由原生 shouldOverrideUrlLoading 交给系统浏览器/对应 App。
  //    这里不要用 window.open —— 它走 onCreateWindow，从 <button> 触发时拿不到 URL，
  //    只会得到一个静默的空窗口（见文件头修复记录 4）。
  if (isNativeWebView() && !targetsAppOrigin(url)) {
    try {
      window.location.href = url;
      return;
    } catch (err) {
      console.warn('[open-external] 主文档导航失败，降级为 window.open', err);
    }
  }

  // 2) 原生桥：直接交给系统浏览器（需要 MainActivity 侧实现 openExternal，目前尚未实现）
  const bridge = getBridge();
  if (typeof bridge?.openExternal === 'function') {
    try {
      bridge.openExternal(url);
      return;
    } catch (err) {
      console.warn('[open-external] 原生桥打开失败，降级为 window.open', err);
    }
  }

  // 3) 与历史行为保持一致：window.open 新窗口 / 新标签页
  if (callWindowOpen(url, '_blank', 'noopener,noreferrer')) return;

  // 4) 仅在调用本身失败时退化（浏览器 window.open 缺失、被改写抛错等）
  window.location.href = url;
}

let installed = false;

/**
 * 安装全局兜底（幂等）：
 * 1) 代理 window.open，保留原生行为，仅在调用抛错时退化为导航。
 * 2) 捕获阶段拦截 <a target="_blank"> 点击，交给 openExternalUrl 统一处理。
 * 普通浏览器中同样只做等价转发，不改变原生新标签页语义。
 */
export function installExternalLinkFix(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  // 桥未注入时不要置位 installed，否则后续重试会被永久跳过
  if (!isNativeWebView() || !rawWindowOpen) return;
  installed = true;

  const patchedOpen = ((url?: string | URL, target?: string, features?: string): Window | null => {
    const href = typeof url === 'string' ? url.trim() : url ? String(url).trim() : '';
    try {
      // 必须带 receiver，否则 Illegal invocation
      return rawWindowOpen.call(window, url as string, target, features);
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
