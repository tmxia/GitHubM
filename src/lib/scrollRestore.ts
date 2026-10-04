
export function saveListScroll(key: string): void {
  try { localStorage.setItem(key, String(window.scrollY)); } catch {}
}

export function clearListScroll(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}

export function readListScroll(key: string): number {
  try {
    const v = parseInt(localStorage.getItem(key) || '0', 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch { return 0; }
}
