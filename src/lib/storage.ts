/**
 * 通用本地存储适配层（localStorage / sessionStorage）。
 *
 * 统一收口：
 * - 所有读写包裹 try-catch，隐私模式 / 配额满 / 存储被禁用时静默降级，
 *   不再让 setItem 的 QuotaExceededError 上抛导致白屏；
 * - 提供 JSON 序列化辅助，读取失败或结构不符时回退到调用方给定的默认值；
 * - 不强制改造既有 key 名，调用方传入的 key 保持不变，兼容历史已存数据。
 *
 * 敏感 Token 仍走 secureStorage（原生 Keystore 桥接），不要用本模块保存。
 */

type StorageLike = Storage | undefined;

function getStorage(kind: 'local' | 'session'): StorageLike {
  if (typeof window === 'undefined') return undefined;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** 读取字符串；不存在或异常时返回 null。 */
export function lsGet(key: string): string | null {
  const s = getStorage('local');
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 写入字符串；返回是否落盘成功。 */
export function lsSet(key: string, value: string): boolean {
  const s = getStorage('local');
  try {
    s?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function lsRemove(key: string): void {
  const s = getStorage('local');
  try {
    s?.removeItem(key);
  } catch {
    // ignore quota / private mode
  }
}

/** 读取 JSON；解析失败、为空或类型不符时回退到 fallback。 */
export function lsGetJSON<T>(key: string, fallback: T): T {
  const raw = lsGet(key);
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 写入 JSON；返回是否落盘成功。 */
export function lsSetJSON(key: string, value: unknown): boolean {
  try {
    return lsSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** 读取 sessionStorage 字符串；不存在或异常时返回 null。 */
export function ssGet(key: string): string | null {
  const s = getStorage('session');
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 写入 sessionStorage；返回是否落盘成功。 */
export function ssSet(key: string, value: string): boolean {
  const s = getStorage('session');
  try {
    s?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function ssRemove(key: string): void {
  const s = getStorage('session');
  try {
    s?.removeItem(key);
  } catch {
    // ignore
  }
}

/** 读取 sessionStorage JSON；解析失败时回退到 fallback。 */
export function ssGetJSON<T>(key: string, fallback: T): T {
  const raw = ssGet(key);
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 写入 sessionStorage JSON；返回是否落盘成功。 */
export function ssSetJSON(key: string, value: unknown): boolean {
  try {
    return ssSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
