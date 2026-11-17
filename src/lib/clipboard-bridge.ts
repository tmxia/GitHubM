// 剪贴板全局兜底（Android WebView / file:// 页面）
//
// ── 问题 ────────────────────────────────────────────────────
// App 内 WebView 加载的是 file:// 页面 → 非安全上下文（isSecureContext === false），
// navigator.clipboard 可能为 undefined，或存在但 writeText() 被直接拒绝。
// 于是任何历史代码里直接写 navigator.clipboard.writeText(...) 的地方，在 App 内
// 都会抛异常并被 catch 吞掉，表现为「点了复制没任何反应」。
//
// ── 策略 ───────────────────────────────────────────────────
// 原生侧 MainActivity.WebAppBridge 已提供 writeClipboard / readClipboard，
// 这里在首屏渲染前装一层 shim，把 navigator.clipboard 接到原生桥：
//   1) 优先改写现有 navigator.clipboard 的 writeText / readText（保持对象身份不变）；
//   2) 若 navigator.clipboard 整体不存在，则在 navigator 上 defineProperty 一个 shim。
// 安装后，历史调用点无需逐个改造即可在 App 内生效；浏览器环境没有 AndroidBridge，
// 本模块直接 no-op，完全不影响原生 Clipboard API。
//
// 新代码仍建议优先用 @/lib/utils 的 copyToClipboard()（它自己带 execCommand 兜底）。
//
// 注意：必须由入口文件（main.tsx）在首屏渲染前 import，否则首次交互前调用的
// 代码仍可能拿到未打补丁的 navigator.clipboard。模块内 install 幂等（HMR 安全）。

interface AndroidClipboardBridge {
  writeClipboard?: (text: string) => void;
  readClipboard?: () => string;
}

const INSTALLED_FLAG = '__githubmClipboardBridgeInstalled';

function getBridge(): AndroidClipboardBridge | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { AndroidBridge?: unknown }).AndroidBridge;
  return candidate && typeof candidate === 'object' ? (candidate as AndroidClipboardBridge) : null;
}

/** 在目标对象上定义一个可覆盖的方法；失败返回 false（不抛异常） */
function patchMethod(target: object, key: 'writeText' | 'readText', value: unknown): boolean {
  try {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 安装剪贴板 shim。返回是否成功接管。
 * 非 App 环境（没有 AndroidBridge）返回 false 且不做任何修改。
 */
export function installClipboardBridge(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const flags = window as unknown as Record<string, unknown>;
  if (flags[INSTALLED_FLAG] === true) return true;

  const bridge = getBridge();
  if (!bridge) return false;

  const hasWrite = typeof bridge.writeClipboard === 'function';
  const hasRead = typeof bridge.readClipboard === 'function';
  if (!hasWrite && !hasRead) return false;

  const original = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;

  // 注意：AndroidBridge 的方法必须通过 bridge 对象调用（保留 receiver），
  // 不能把方法抽出来裸调用，否则 WebView 可能抛 Illegal invocation。
  const writeText = async (text: string): Promise<void> => {
    const value = typeof text === 'string' ? text : String(text ?? '');
    if (hasWrite) {
      bridge.writeClipboard?.(value);
      return;
    }
    if (original && typeof original.writeText === 'function') {
      await original.writeText(value);
      return;
    }
    throw new Error('[clipboard] writeText unavailable');
  };

  const readText = async (): Promise<string> => {
    if (hasRead) {
      const value = bridge.readClipboard?.();
      return typeof value === 'string' ? value : '';
    }
    if (original && typeof original.readText === 'function') {
      return original.readText();
    }
    throw new Error('[clipboard] readText unavailable');
  };

  let patched = false;

  // 路径 1：只替换方法，保留 navigator.clipboard 对象身份，
  // 避免破坏 clipboard.write([...]) / addEventListener 等其它用法。
  if (original) {
    if (hasWrite) patched = patchMethod(original, 'writeText', writeText) || patched;
    if (hasRead) patched = patchMethod(original, 'readText', readText) || patched;
  }

  // 路径 2：navigator.clipboard 整体不存在（file:// 常见）时补一个 shim。
  if (!patched) {
    const shim = { writeText, readText };
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        enumerable: true,
        get: () => shim,
      });
      patched = true;
    } catch {
      patched = false;
    }
  }

  if (!patched) {
    console.warn('[clipboard] 原生桥存在但无法接管 navigator.clipboard，继续使用 copyToClipboard()');
    return false;
  }

  flags[INSTALLED_FLAG] = true;
  return true;
}

// import 即安装（与 @/lib/open-external 的约定保持一致）
installClipboardBridge();
