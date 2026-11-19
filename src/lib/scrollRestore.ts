
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

// ---------- 首页（Dashboard）跳转返回位置记忆，统一口径 ----------

const HOME_RETURNING_KEY = 'home_returning';
const HOME_ANCHOR_KEY = 'home_anchor_id';
const HOME_SCROLL_KEY = 'home_scroll_y';

/** 首页卡片跳转前调用：记录返回标记、可选锚点与当前滚动位置。 */
export function rememberHomeScroll(anchorId?: string): void {
  try {
    sessionStorage.setItem(HOME_RETURNING_KEY, '1');
    if (anchorId) sessionStorage.setItem(HOME_ANCHOR_KEY, anchorId);
    else sessionStorage.removeItem(HOME_ANCHOR_KEY);
    localStorage.setItem(HOME_SCROLL_KEY, String(Math.round(window.scrollY || 0)));
  } catch { /* ignore */ }
}

/** 读取首页返回记忆；兼容历史遗留的旧键。 */
export function readHomeScroll(): { returning: boolean; anchorId: string | null; y: number } {
  let returning = false;
  let anchorId: string | null = null;
  let y = 0;
  try {
    returning = sessionStorage.getItem(HOME_RETURNING_KEY) === '1';
    anchorId = sessionStorage.getItem(HOME_ANCHOR_KEY);
    y = parseInt(localStorage.getItem(HOME_SCROLL_KEY) || '0', 10);

    // 兼容旧键（dashboard:scroll / dash_anchor_id / home_scroll_pos / home-feed-scroll）
    if (!returning) returning = sessionStorage.getItem('dashboard_is_returning') === '1';
    if (!anchorId) anchorId = sessionStorage.getItem('dash_anchor_id');
    if (!y) y = parseInt(localStorage.getItem('dashboard:scroll') || '0', 10);
    if (!y) y = parseInt(sessionStorage.getItem('home_scroll_pos') || '0', 10);
    if (!y) y = parseInt(localStorage.getItem('home-feed-scroll') || '0', 10);
  } catch { /* ignore */ }
  return { returning, anchorId, y: Number.isFinite(y) && y > 0 ? y : 0 };
}

/** 恢复完成后清理首页返回记忆（含旧键）。 */
export function clearHomeScroll(): void {
  try {
    sessionStorage.removeItem(HOME_RETURNING_KEY);
    sessionStorage.removeItem(HOME_ANCHOR_KEY);
    localStorage.removeItem(HOME_SCROLL_KEY);
    sessionStorage.removeItem('dashboard_is_returning');
    sessionStorage.removeItem('dash_anchor_id');
    sessionStorage.removeItem('dash_exact_y');
    localStorage.removeItem('dashboard:scroll');
    sessionStorage.removeItem('home_scroll_pos');
    localStorage.removeItem('home-feed-scroll');
  } catch { /* ignore */ }
}
