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
//
// ── 策略 ───────────────────────────────────────────────────
// 1) 原生桥暴露 openExternal 时优先调用（直接跳系统浏览器）。
// 2) 其余情况一律走 window.open(url, '_blank', 'noopener,noreferrer')，与历史行为一致。
// 3) 仅当调用本身抛异常（或环境不存在 window.open）时，才退化为 location.href 导航。
//
// 本模块被 import 时自动安装全局兜底（幂等）。注意：必须由入口文件（main.tsx）
// 在首屏渲染前 import，否则历史代码里的 <a target="_blank"> 兜底不会生效。

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

  // 1) 原生桥：直接交给系统浏览器（需要 MainActivity 侧实现 openExternal）
  const bridge = getBridge();
  if (typeof bridge?.openExternal === 'function') {
    try {
      bridge.openExternal(url);
      return;
    } catch (err) {
      console.warn('[open-external] 原生桥打开失败，降级为 window.open', err);
    }
  }

  // 2) 与历史行为保持一致：window.open 新窗口 / 新标签页
  if (callWindowOpen(url, '_blank', 'noopener,noreferrer')) return;

  // 3) 仅在调用本身失败时退化（浏览器 window.open 缺失、被改写抛错等）
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
