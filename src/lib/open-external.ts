// 外部链接统一打开入口（普通浏览器 / Android WebView 兼容）
//
// ── 修复记录（避免以后再踩同样的坑）─────────────────────────────
// 【真因，2026-11 修复】Android WebView 中 window.open 会被静默吞掉：
//   MainActivity 的 WebChromeClient.onCreateWindow 用 view?.hitTestResult?.extra 取 URL，
//   而程序化调用 window.open(url) 时 hitTestResult 为空（它不是一次链接点击），
//   于是跳过 if 分支，落到结尾：
//       transport?.webView = null
//       resultMsg?.sendToTarget()
//   即「不创建任何新窗口，再回传一个空 transport」。结果 window.open 既不抛异常、
//   也不返回 null，只是什么都没发生 —— 表现就是「点打开没反应」。
//   → 在 WebView 容器内必须用 location.href 导航，由 WebViewClient
//     .shouldOverrideUrlLoading 接管后 startActivity(ACTION_VIEW) 交给系统浏览器。
//     该回调对一切非 localhost / 非 appassets 的 URL 都 return true 并 startActivity，
//     GitHub 链接还有 github:// → https 的二级 fallback，是当前唯一可靠通路。
//
// 其它已踩过的坑：
// 1) 不要把 window.open 存成变量后裸调用：
//        const raw = window.open; raw(url, '_blank');
//    window.open 是 WebIDL 方法，脱离 window 调用会抛 TypeError: Illegal invocation。
//    → 必须 rawWindowOpen.call(window, ...)。
// 2) 'noopener' 按规范会让 window.open 恒返回 null，返回值不能当成功判据；
//    而 WebView 静默失败时返回值同样不可信。判断依据只能是「环境 + 是否抛异常」。
// 3) 原生桥 AndroidBridge 目前**没有** openExternal 方法（MainActivity 侧未实现），
//    所以桥优先分支在现版本不会命中，仅作为将来扩展的预留通路。
//
// ── 策略（按优先级）────────────────────────────────────────
// 1) 原生桥暴露 openExternal → 直接调用（将来实现后最稳）。
// 2) 运行在 Android WebView 容器内 → location.href 导航（唯一可靠路径）。
// 3) 普通浏览器 → window.open(url, '_blank', 'noopener,noreferrer')，保持历史语义。
// 4) window.open 调用抛异常（浏览器改写等）→ 退化为 location.href。
//
// 本模块被 import 时自动安装全局兜底（幂等）。注意：必须由入口文件（main.tsx）
// 在首屏渲染前 import，否则 <a target="_blank"> 与第三方 window.open 的兜底不会生效。

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

/**
 * 以正确的 receiver 调用原生 window.open。
 *
 * 返回值只表示「调用已发出」，不表示窗口真的开了：
 * 带 'noopener' 时规范要求返回 null，WebView 未建窗口时同样返回 null。
 * 因此本函数只用于普通浏览器分支。
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

/** 顶层导航：在 WebView 内会被 shouldOverrideUrlLoading 接管并交给系统浏览器 */
function navigate(url: string): void {
  window.location.href = url;
}

/**
 * 打开外部链接。
 * 非 http(s)/mailto/tel 协议会被忽略，避免 javascript: 之类的注入。
 */
export function openExternalUrl(rawUrl?: string | null): void {
  const url = (rawUrl || '').trim();
  if (!url || !isSafeUrl(url)) return;

  // 1) 原生桥：直接交给系统浏览器（MainActivity 目前未实现 openExternal，属预留）
  const bridge = getBridge();
  if (typeof bridge?.openExternal === 'function') {
    try {
      bridge.openExternal(url);
      return;
    } catch (err) {
      console.warn('[open-external] 原生桥打开失败，继续降级', err);
    }
  }

  // 2) WebView 容器：window.open 会被 onCreateWindow 静默吞掉（见文件头），必须用导航
  if (isNativeWebView()) {
    navigate(url);
    return;
  }

  // 3) 普通浏览器：保持历史行为（新标签页）
  if (callWindowOpen(url, '_blank', 'noopener,noreferrer')) return;

  // 4) window.open 缺失或被改写抛错时兜底
  navigate(url);
}

let installed = false;

/**
 * 安装全局兜底（幂等）：
 * 1) 代理 window.open —— WebView 内改为导航（否则任何第三方调用都会静默失效），
 *    普通浏览器内保持原生新标签页语义，仅在抛错时降级。
 * 2) 捕获阶段拦截 <a target="_blank"> 点击，交给 openExternalUrl 统一处理。
 */
export function installExternalLinkFix(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  // 桥未注入时不要置位 installed，否则后续重试会被永久跳过
  if (!isNativeWebView() || !rawWindowOpen) return;
  installed = true;

  const patchedOpen = ((url?: string | URL, target?: string, features?: string): Window | null => {
    const href = typeof url === 'string' ? url.trim() : url ? String(url).trim() : '';

    // WebView 内：window.open 无法真正建窗口，改为顶层导航交给系统浏览器
    if (isNativeWebView() && href && isSafeUrl(href)) {
      try {
        navigate(href);
      } catch (err) {
        console.warn('[open-external] 代理 window.open 导航失败', err);
      }
      return null;
    }

    try {
      // 必须带 receiver，否则 Illegal invocation
      return rawWindowOpen.call(window, url as string, target, features);
    } catch (err) {
      console.warn('[open-external] 代理 window.open 调用失败，降级导航', err);
      if (href && isSafeUrl(href)) {
        try {
          navigate(href);
        } catch {
          // 忽略：已无可用降级手段
        }
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

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      // 只接管「新窗口 / 新标签页」语义的链接，普通站内跳转保持原样
      if (anchor.getAttribute('target') !== '_blank') return;

      const absolute = anchor.href || anchor.getAttribute('href') || '';
      if (!isSafeUrl(absolute)) return;

      event.preventDefault();
      openExternalUrl(absolute);
    },
    true,
  );
}
