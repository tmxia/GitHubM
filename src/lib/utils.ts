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
    return raw; // base64 解码失败则原样返回
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { /* 继续 */ }
  try {
    return new TextDecoder('gbk', { fatal: true }).decode(bytes);
  } catch { /* 继续 */ }
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

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
