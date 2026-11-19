

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

  if (original) {
    if (hasWrite) patched = patchMethod(original, 'writeText', writeText) || patched;
    if (hasRead) patched = patchMethod(original, 'readText', readText) || patched;
  }

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

installClipboardBridge();
